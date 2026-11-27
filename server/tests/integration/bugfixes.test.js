const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const {
  Company,
  Agent,
  Goal,
  Issue,
  HeartbeatRun,
  WakeupQueue,
} = require('../../src/models');
const {
  enqueueWakeup,
  canAgentExecute,
  processPendingWakeups,
} = require('../../src/services/wakeupQueue');
const { sweepZombieLocks } = require('../../src/services/watchdog');
const { executeHeartbeat } = require('../../src/services/heartbeatEngine');

describe('Backend Bugfix Regression Suite', () => {
  let tokenA;
  let companyAId;
  let tokenB;
  let companyBId;

  beforeEach(async () => {
    const regA = await request(app).post('/api/auth/register').send({
      name: 'Owner Alpha',
      email: `alpha-${Date.now()}@test.com`,
      password: 'Password123!',
    });
    tokenA = regA.body.token;

    const compA = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Forge AI', issuePrefix: 'FORGE' });
    companyAId = compA.body.company._id;

    const regB = await request(app).post('/api/auth/register').send({
      name: 'Owner Beta',
      email: `beta-${Date.now()}@test.com`,
      password: 'Password123!',
    });
    tokenB = regB.body.token;

    const compB = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Beta Corp', issuePrefix: 'BET' });
    companyBId = compB.body.company._id;
  });

  test('scopes issues, goals, and runs strictly to resolved company even for demo slugs', async () => {
    await Issue.create({
      companyId: companyAId,
      issueNumber: 1,
      issueKey: 'FORGE-1',
      title: 'Alpha Private Issue',
    });
    await Issue.create({
      companyId: companyBId,
      issueNumber: 1,
      issueKey: 'BET-1',
      title: 'Beta Private Issue',
    });

    await Goal.create({ companyId: companyAId, title: 'Alpha Goal' });
    await Goal.create({ companyId: companyBId, title: 'Beta Goal' });

    const agentA = await Agent.create({ companyId: companyAId, name: 'A1', role: 'CEO' });
    const agentB = await Agent.create({ companyId: companyBId, name: 'B1', role: 'CEO' });
    await HeartbeatRun.create({ companyId: companyAId, agentId: agentA._id, status: 'completed' });
    await HeartbeatRun.create({ companyId: companyBId, agentId: agentB._id, status: 'completed' });

    const slugIssuesRes = await request(app)
      .get('/api/companies/demo_company_1/issues')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(slugIssuesRes.status).toBe(200);
    expect(slugIssuesRes.body.map((i) => i.issueKey)).toEqual(['FORGE-1']);

    const slugGoalsRes = await request(app)
      .get('/api/companies/default/goals')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(slugGoalsRes.status).toBe(200);
    expect(slugGoalsRes.body.map((g) => g.title)).toEqual(['Alpha Goal']);

    const runsBRes = await request(app)
      .get('/api/runs')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(runsBRes.status).toBe(200);
    expect(runsBRes.body).toHaveLength(1);
    expect(String(runsBRes.body[0].companyId)).toBe(String(companyBId));

    const slugRunsRes = await request(app)
      .get('/api/runs?companyId=demo_company_1')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(slugRunsRes.status).toBe(200);
    expect(slugRunsRes.body).toHaveLength(1);
    expect(String(slugRunsRes.body[0].companyId)).toBe(String(companyAId));
  });

  test('checkout endpoint acquires atomic lock and rejects concurrent run with 409', async () => {
    const agent = await Agent.create({ companyId: companyAId, name: 'Worker', role: 'engineer' });
    const issue = await Issue.create({
      companyId: companyAId,
      issueNumber: 2,
      issueKey: 'FORGE-2',
      title: 'Checkout Test',
      status: 'todo',
      assigneeAgentId: agent._id,
    });

    const run1 = new mongoose.Types.ObjectId();
    const first = await request(app)
      .post(`/api/issues/${issue._id}/checkout`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ runId: run1 });
    expect(first.status).toBe(200);
    expect(String(first.body.issue.lockedByRunId)).toBe(String(run1));
    expect(first.body.issue.status).toBe('in_progress');

    const run2 = new mongoose.Types.ObjectId();
    const conflict = await request(app)
      .post(`/api/issues/${issue._id}/checkout`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ runId: run2 });
    expect(conflict.status).toBe(409);
    expect(String(conflict.body.lockedByRunId)).toBe(String(run1));
  });

  test('qa-review clears checkout lock, queues targetIssueId wakeup, and @CTO mentions match case-insensitively', async () => {
    const cto = await Agent.create({ companyId: companyAId, name: 'Ada', role: 'CTO' });
    const issue = await Issue.create({
      companyId: companyAId,
      issueNumber: 3,
      issueKey: 'FORGE-3',
      title: 'QA Lock Test',
      status: 'in_review',
      assigneeAgentId: cto._id,
      lockedByRunId: new mongoose.Types.ObjectId(),
      lockExpiresAt: new Date(Date.now() + 60000),
    });

    const qaRes = await request(app)
      .post(`/api/issues/${issue._id}/qa-review`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ passed: false, feedback: 'Needs unit test coverage.' });
    expect(qaRes.status).toBe(200);
    expect(qaRes.body.issue.status).toBe('todo');
    expect(qaRes.body.issue.lockedByRunId).toBeNull();
    expect(qaRes.body.issue.lockExpiresAt).toBeNull();

    let queued = await WakeupQueue.findOne({ companyId: companyAId, agentId: cto._id, status: 'queued' });
    expect(queued).toBeTruthy();
    expect(String(queued.targetIssueId)).toBe(String(issue._id));

    await WakeupQueue.deleteMany({});

    const commentRes = await request(app)
      .post(`/api/issues/${issue._id}/comments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'Paging @CTO for review' });
    expect(commentRes.status).toBe(201);

    queued = await WakeupQueue.findOne({ companyId: companyAId, agentId: cto._id, status: 'queued' });
    expect(queued).toBeTruthy();
    expect(queued.triggerType).toBe('mention');
  });

  test('wakeupQueue preserves targetIssueId, drains via processPendingWakeups, and enforces lastHeartbeatAt cooldown', async () => {
    const agent = await Agent.create({ companyId: companyAId, name: 'Dev', role: 'engineer' });
    const issue = await Issue.create({
      companyId: companyAId,
      issueNumber: 4,
      issueKey: 'FORGE-4',
      title: 'Queued Wakeup Work',
      status: 'todo',
      assigneeAgentId: agent._id,
    });

    const { wakeup } = await enqueueWakeup({
      companyId: companyAId,
      agentId: agent._id,
      triggerType: 'assignment',
      targetIssueId: issue._id,
    });
    expect(String(wakeup.targetIssueId)).toBe(String(issue._id));

    const calls = [];
    const dispatched = await processPendingWakeups({
      runExecutor: async (params) => {
        calls.push(params);
        await HeartbeatRun.findByIdAndUpdate(params.existingRunId, { status: 'completed', endedAt: new Date() });
        await WakeupQueue.findByIdAndUpdate(params.wakeupId, { status: 'completed', processedAt: new Date() });
      },
    });
    expect(dispatched).toBe(1);
    expect(calls).toHaveLength(1);
    expect(String(calls[0].issueId)).toBe(String(issue._id));

    await Agent.findByIdAndUpdate(agent._id, { lastHeartbeatAt: new Date(), status: 'idle' });
    const autoCheck = await canAgentExecute(companyAId, agent._id, 'assignment');
    expect(autoCheck.allowed).toBe(false);
    expect(autoCheck.reason).toBe('COOLDOWN_ACTIVE');

    const manualCheck = await canAgentExecute(companyAId, agent._id, 'manual');
    expect(manualCheck.allowed).toBe(true);
  });

  test('watchdog sweep passes enum validation and preserves paused or terminated agents', async () => {
    const pausedAgent = await Agent.create({
      companyId: companyAId,
      name: 'Paused',
      role: 'engineer',
      status: 'paused',
    });
    const orphanRun = await HeartbeatRun.create({
      companyId: companyAId,
      agentId: pausedAgent._id,
      status: 'running',
      startedAt: new Date(Date.now() - 15 * 60 * 1000),
    });

    await sweepZombieLocks();

    const updatedRun = await HeartbeatRun.findById(orphanRun._id);
    expect(updatedRun.status).toBe('stalled');
    expect(updatedRun.endedAt).toBeTruthy();
    expect(updatedRun.logs[0].level).toBe('warn');

    const updatedAgent = await Agent.findById(pausedAgent._id);
    expect(updatedAgent.status).toBe('paused');
  });

  test('executeHeartbeat marks pre-created run failed on pre-flight rejection and supports terminated status', async () => {
    const terminatedAgent = await Agent.create({
      companyId: companyAId,
      name: 'Retired',
      role: 'engineer',
      status: 'terminated',
    });
    const run = await HeartbeatRun.create({
      companyId: companyAId,
      agentId: terminatedAgent._id,
      status: 'running',
      startedAt: new Date(),
    });

    await expect(
      executeHeartbeat({
        agentId: terminatedAgent._id,
        companyId: companyAId,
        triggerType: 'manual',
        existingRunId: run._id,
      })
    ).rejects.toThrow(/AGENT_TERMINATED/);

    const failedRun = await HeartbeatRun.findById(run._id);
    expect(failedRun.status).toBe('failed');
    expect(failedRun.endedAt).toBeTruthy();
    expect(failedRun.errorMessage).toContain('AGENT_TERMINATED');
  });
});
