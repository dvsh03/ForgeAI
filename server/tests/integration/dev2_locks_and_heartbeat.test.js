const mongoose = require('mongoose');
const { Issue, Agent, Company, HeartbeatRun, WakeupQueue, User } = require('../../src/models');
const { checkoutIssue, releaseIssueLock } = require('../../src/services/issueLockService');
const { enqueueWakeup, canAgentExecute } = require('../../src/services/wakeupQueue');
const { sweepZombieLocks } = require('../../src/services/watchdog');

describe('Developer 2: Locks, Concurrency, Coalescing & Watchdog Integration', () => {
  let user, company, agent, issue;

  beforeEach(async () => {
    user = await User.create({
      name: 'Dev2 Test User',
      email: `dev2_${Date.now()}@test.com`,
      password: 'Password123!'
    });

    company = await Company.create({
      name: 'Paperclip AI Inc',
      issuePrefix: 'PAP',
      ownerUserId: user._id,
      budgetMonthlyCents: 500
    });

    agent = await Agent.create({
      companyId: company._id,
      name: 'CEO Agent',
      role: 'ceo',
      budgetMonthlyCents: 100,
      spentMonthlyMicrocents: 0,
      status: 'idle'
    });

    issue = await Issue.create({
      companyId: company._id,
      issueNumber: 1,
      issueKey: 'PAP-1',
      title: 'Architect Workforce Engine',
      status: 'todo',
      assigneeAgentId: agent._id
    });
  });

  describe('1. Atomic Checkout Locks & 409 Guard', () => {
    it('should acquire atomic 5-minute lease on an unlocked issue', async () => {
      const runId = new mongoose.Types.ObjectId();
      const res = await checkoutIssue({
        companyId: company._id,
        issueId: issue._id,
        agentId: agent._id,
        runId
      });

      expect(res.success).toBe(true);
      expect(res.conflict).toBe(false);
      expect(res.issue.status).toBe('in_progress');
      expect(String(res.issue.lockedByRunId)).toBe(String(runId));
      expect(new Date(res.issue.lockExpiresAt).getTime()).toBeGreaterThan(Date.now() + 4 * 60 * 1000);
    });

    it('should reject a second concurrent checkout with 409 Conflict', async () => {
      const run1 = new mongoose.Types.ObjectId();
      const run2 = new mongoose.Types.ObjectId();

      // First run acquires lock
      const res1 = await checkoutIssue({
        companyId: company._id,
        issueId: issue._id,
        agentId: agent._id,
        runId: run1
      });
      expect(res1.success).toBe(true);

      // Second run attempts to claim the same ticket
      const res2 = await checkoutIssue({
        companyId: company._id,
        issueId: issue._id,
        agentId: agent._id,
        runId: run2
      });

      expect(res2.success).toBe(false);
      expect(res2.conflict).toBe(true);
      expect(res2.error).toContain('409 Conflict');
    });

    it('should allow releasing lock and updating delta comment cursor', async () => {
      const runId = new mongoose.Types.ObjectId();
      await checkoutIssue({
        companyId: company._id,
        issueId: issue._id,
        agentId: agent._id,
        runId
      });

      const released = await releaseIssueLock({
        issueId: issue._id,
        runId,
        newStatus: 'in_review',
        newHydratedCommentCount: 5
      });

      expect(released.lockedByRunId).toBeNull();
      expect(released.lockExpiresAt).toBeNull();
      expect(released.status).toBe('in_review');
      expect(released.lastHydratedCommentCount).toBe(5);
    });
  });

  describe('2. WakeupQueue & Duplicate-Trigger Coalescing', () => {
    it('should coalesce multiple rapid wakeups into a single queued entry', async () => {
      // First trigger
      const first = await enqueueWakeup({
        companyId: company._id,
        agentId: agent._id,
        triggerType: 'assignment',
        payload: { note: 'Initial assignment' }
      });
      expect(first.coalesced).toBe(false);
      expect(first.wakeup.coalescedCount).toBe(1);

      // Second rapid trigger for the same agent
      const second = await enqueueWakeup({
        companyId: company._id,
        agentId: agent._id,
        triggerType: 'mention',
        payload: { comment: 'Also look at this' }
      });
      expect(second.coalesced).toBe(true);
      expect(second.wakeup.coalescedCount).toBe(2);

      // Verify only 1 record exists in WakeupQueue
      const count = await WakeupQueue.countDocuments({ companyId: company._id, agentId: agent._id });
      expect(count).toBe(1);
    });
  });

  describe('3. Pre-Flight Budget Gate & Circuit Breaker', () => {
    it('should block execution and trip circuit breaker if agent is over 100% budget', async () => {
      // Set agent spend over monthly budget ($1.00 budget = 1,000,000 microcents)
      agent.spentMonthlyMicrocents = 1000000;
      await agent.save();

      const check = await canAgentExecute(company._id, agent._id, 'manual');
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('BUDGET_EXCEEDED');

      // Verify agent was automatically marked budget_stopped
      const updatedAgent = await Agent.findById(agent._id);
      expect(updatedAgent.status).toBe('budget_stopped');
    });
  });

  describe('4. 30-Second Zombie Lock Watchdog', () => {
    it('should reclaim expired locks and reset stuck issues back to todo', async () => {
      const run = await HeartbeatRun.create({
        companyId: company._id,
        agentId: agent._id,
        issueId: issue._id,
        triggerType: 'manual',
        status: 'running',
        startedAt: new Date(Date.now() - 10 * 60 * 1000)
      });

      // Simulate an issue locked in the past whose 5-min lease has expired
      issue.status = 'in_progress';
      issue.lockedByRunId = run._id;
      issue.lockExpiresAt = new Date(Date.now() - 60 * 1000); // Expired 1 min ago
      await issue.save();

      agent.status = 'running';
      await agent.save();

      // Trigger watchdog sweep
      await sweepZombieLocks();

      // Issue should be unlocked and reverted to 'todo'
      const updatedIssue = await Issue.findById(issue._id);
      expect(updatedIssue.lockedByRunId).toBeNull();
      expect(updatedIssue.lockExpiresAt).toBeNull();
      expect(updatedIssue.status).toBe('todo');

      // Run should be marked 'stalled'
      const updatedRun = await HeartbeatRun.findById(run._id);
      expect(updatedRun.status).toBe('stalled');

      // Agent should be reset to 'idle'
      const updatedAgent = await Agent.findById(agent._id);
      expect(updatedAgent.status).toBe('idle');
    });
  });
});
