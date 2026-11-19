const request = require('supertest');
const app = require('../../src/app');
const Agent = require('../../src/models/Agent');
const AgentConfigRevision = require('../../src/models/AgentConfigRevision');
const Approval = require('../../src/models/Approval');
const BudgetIncident = require('../../src/models/BudgetIncident');
const Company = require('../../src/models/Company');
const Goal = require('../../src/models/Goal');
const WakeupQueue = require('../../src/models/WakeupQueue');

describe('Agent governance endpoints', () => {
  let userToken;
  let companyId;

  beforeEach(async () => {
    const userResponse = await request(app).post('/api/auth/register').send({
      name: 'Governance Owner',
      email: `governance-${Date.now()}@paperclip.dev`,
      password: 'Password123!',
    });
    userToken = userResponse.body.token;

    const companyResponse = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Governance Test', issuePrefix: 'GOV' });
    companyId = companyResponse.body.company._id;
  });

  test('creates an agent, saves config revisions, and rolls a revision back', async () => {
    const createResponse = await request(app)
      .post(`/api/companies/${companyId}/agents`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Nova',
        title: 'Research Analyst',
        role: 'researcher',
        adapterType: 'gemini_llm',
        model: 'gemini-2.5-flash',
        budgetMonthlyCents: 250,
      });

    expect(createResponse.status).toBe(201);
    const agentId = createResponse.body.agent._id;
    expect(createResponse.body.agent.title).toBe('Research Analyst');

    const updateResponse = await request(app)
      .patch(`/api/agents/${agentId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ instructionsMarkdown: 'Version one', heartbeatCron: '0 */2 * * *' });
    expect(updateResponse.status).toBe(200);

    await request(app)
      .patch(`/api/agents/${agentId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ instructionsMarkdown: 'Version two' });

    const revisionsResponse = await request(app)
      .get(`/api/agents/${agentId}/revisions`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(revisionsResponse.status).toBe(200);
    expect(revisionsResponse.body[0].changedKeys).toContain('instructionsMarkdown');

    const rollbackResponse = await request(app)
      .post(`/api/agents/${agentId}/revisions/${revisionsResponse.body[1]._id}/rollback`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(rollbackResponse.status).toBe(200);
    expect(rollbackResponse.body.instructionsMarkdown).toBe('Version one');

    const listResponse = await request(app)
      .get(`/api/companies/${companyId}/agents`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.agents[0].adapterConfig.heartbeatCron).toBe('0 */2 * * *');
  });

  test('queues manual runs and enforces pause and budget stops', async () => {
    const agent = await Agent.create({
      companyId,
      name: 'Runner',
      role: 'engineer',
      budgetMonthlyCents: 100,
    });

    const runResponse = await request(app)
      .post(`/api/agents/${agent._id}/invoke`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(runResponse.status).toBe(202);
    expect(await WakeupQueue.countDocuments({ agentId: agent._id, status: 'queued' })).toBe(1);

    const pauseResponse = await request(app)
      .post(`/api/agents/${agent._id}/pause`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(pauseResponse.status).toBe(200);

    const pausedRunResponse = await request(app)
      .post(`/api/agents/${agent._id}/invoke`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(pausedRunResponse.status).toBe(409);

    await request(app)
      .post(`/api/agents/${agent._id}/resume`)
      .set('Authorization', `Bearer ${userToken}`);
    await Agent.findByIdAndUpdate(agent._id, { spentMonthlyMicrocents: 1000000 });
    const exhaustedResponse = await request(app)
      .post(`/api/agents/${agent._id}/invoke`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(exhaustedResponse.status).toBe(409);
    expect(await BudgetIncident.countDocuments({ agentId: agent._id, status: 'open' })).toBe(1);
  });

  test('decides approvals and resolves budget incidents', async () => {
    const requester = await Agent.create({ companyId, name: 'CEO', role: 'ceo' });
    const approval = await Approval.create({
      companyId,
      agentId: requester._id,
      type: 'strategy_plan',
      payload: { objective: 'Launch the next product milestone' },
    });

    const decisionResponse = await request(app)
      .post(`/api/approvals/${approval._id}/decide`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ decision: 'approved', decisionNote: 'Approved by the board.' });
    expect(decisionResponse.status).toBe(200);
    expect(await Goal.countDocuments({ companyId, title: 'Launch the next product milestone' })).toBe(1);

    const agent = await Agent.create({
      companyId,
      name: 'Capped',
      role: 'engineer',
      status: 'budget_stopped',
      budgetMonthlyCents: 100,
      spentMonthlyMicrocents: 1100000,
    });
    const incident = await BudgetIncident.create({
      companyId,
      agentId: agent._id,
      spentMonthlyMicrocents: agent.spentMonthlyMicrocents,
      budgetMonthlyCents: agent.budgetMonthlyCents,
    });

    const resolveResponse = await request(app)
      .post(`/api/budget-incidents/${incident._id}/resolve`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ newBudgetMonthlyCents: 200, resolutionNote: 'Raised for approved work.' });
    expect(resolveResponse.status).toBe(200);
    expect(resolveResponse.body.agent.status).toBe('idle');
    expect((await Company.findById(companyId)).budgetMonthlyCents).toBe(10000);
  });

  test('does not expose agent details to unauthenticated callers', async () => {
    const agent = await Agent.create({ companyId, name: 'Private Agent', role: 'engineer' });
    const response = await request(app).get(`/api/agents/${agent._id}/revisions`);
    expect(response.status).toBe(401);
    expect(await AgentConfigRevision.countDocuments({ agentId: agent._id })).toBe(0);
  });
});
