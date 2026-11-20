const { WakeupQueue, Agent, Company, HeartbeatRun, BudgetIncident } = require('../models');

const MAX_CONCURRENT_HEARTBEATS_PER_COMPANY = 2;
const AUTO_WAKEUP_COOLDOWN_MS = 30 * 1000; // 30 seconds cooldown for automated wakeups

/**
 * Enqueue a wakeup for an agent with duplicate-trigger coalescing
 *
 * @param {Object} params
 * @param {string|ObjectId} params.companyId
 * @param {string|ObjectId} params.agentId
 * @param {'manual'|'assignment'|'mention'|'cron'|'approval_resolved'} params.triggerType
 * @param {Object} [params.payload]
 * @returns {Promise<Object>} Queued or coalesced WakeupQueue doc
 */
async function enqueueWakeup({ companyId, agentId, triggerType, payload = {} }) {
  // Check if agent already has a pending 'queued' wakeup
  const existingQueued = await WakeupQueue.findOne({
    companyId,
    agentId,
    status: 'queued'
  });

  if (existingQueued) {
    // Coalesce: Merge payload and increment count
    existingQueued.coalescedCount += 1;
    existingQueued.payload = {
      ...existingQueued.payload,
      ...payload,
      lastMergedAt: new Date()
    };
    await existingQueued.save();
    return { wakeup: existingQueued, coalesced: true };
  }

  // Create new queued entry
  const newWakeup = await WakeupQueue.create({
    companyId,
    agentId,
    triggerType,
    status: 'queued',
    coalescedCount: 1,
    payload
  });

  return { wakeup: newWakeup, coalesced: false };
}

/**
 * Checks if an agent is allowed to start a heartbeat right now
 * (Evaluates concurrency limit, budget limit, agent status, and cooldown)
 */
async function canAgentExecute(companyId, agentId, triggerType = 'manual') {
  const agent = await Agent.findOne({ _id: agentId, companyId });
  if (!agent) {
    return { allowed: false, reason: 'AGENT_NOT_FOUND' };
  }

  // 1. Agent Status check
  if (agent.status === 'running') {
    return { allowed: false, reason: 'AGENT_ALREADY_RUNNING' };
  }
  if (agent.status === 'paused') {
    return { allowed: false, reason: 'AGENT_PAUSED' };
  }
  if (agent.status === 'budget_stopped') {
    return { allowed: false, reason: 'AGENT_BUDGET_STOPPED' };
  }
  if (agent.status === 'terminated') {
    return { allowed: false, reason: 'AGENT_TERMINATED' };
  }

  // 2. Pre-flight 30s Cooldown for automated wakeups
  if (triggerType !== 'manual' && agent.lastHeartbeatAt) {
    const elapsed = Date.now() - new Date(agent.lastHeartbeatAt).getTime();
    if (elapsed < AUTO_WAKEUP_COOLDOWN_MS) {
      return {
        allowed: false,
        reason: 'COOLDOWN_ACTIVE',
        retryAfterMs: AUTO_WAKEUP_COOLDOWN_MS - elapsed
      };
    }
  }

  // 3. Pre-flight Budget check (Microcent gate: 1 cent = 10,000 microcents)
  const budgetMicrocents = (agent.budgetMonthlyCents || 100) * 10000;
  const spentMicrocents = agent.spentMonthlyMicrocents || 0;

  if (spentMicrocents >= budgetMicrocents) {
    // Auto-stop circuit breaker: flip status & create incident
    agent.status = 'budget_stopped';
    await agent.save();

    await BudgetIncident.create({
      companyId,
      agentId,
      budgetMonthlyCents: agent.budgetMonthlyCents || 100,
      spentMonthlyMicrocents: spentMicrocents,
      threshold: 100,
      status: 'open',
      resolutionNote: 'Auto-paused by Pre-Flight Budget Gate circuit breaker.'
    });

    return { allowed: false, reason: 'BUDGET_EXCEEDED' };
  }

  // 4. Company Concurrency Semaphore (Max 2 active heartbeats per company)
  const activeHeartbeatsCount = await HeartbeatRun.countDocuments({
    companyId,
    status: 'running'
  });

  if (activeHeartbeatsCount >= MAX_CONCURRENT_HEARTBEATS_PER_COMPANY) {
    return {
      allowed: false,
      reason: 'CONCURRENCY_LIMIT_REACHED',
      activeCount: activeHeartbeatsCount
    };
  }

  return { allowed: true, agent };
}

/**
 * Polls next eligible queued wakeup for a company
 */
async function getNextEligibleWakeup(companyId) {
  const queuedItems = await WakeupQueue.find({
    companyId,
    status: 'queued'
  }).sort({ createdAt: 1 });

  for (const item of queuedItems) {
    const check = await canAgentExecute(companyId, item.agentId, item.triggerType);
    if (check.allowed) {
      return { wakeup: item, agent: check.agent };
    }
  }

  return null;
}

module.exports = {
  MAX_CONCURRENT_HEARTBEATS_PER_COMPANY,
  AUTO_WAKEUP_COOLDOWN_MS,
  enqueueWakeup,
  canAgentExecute,
  getNextEligibleWakeup
};
