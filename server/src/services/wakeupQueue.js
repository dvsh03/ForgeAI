const { WakeupQueue, Agent, Company, HeartbeatRun, BudgetIncident } = require('../models');

const MAX_CONCURRENT_HEARTBEATS_PER_COMPANY = 2;
const AUTO_WAKEUP_COOLDOWN_MS = 30 * 1000; // 30 seconds cooldown for automated wakeups
const WAKEUP_POLL_INTERVAL_MS = 5000; // 5 seconds periodic queue poll

let wakeupWorkerTimer = null;
let isDrainingWakeups = false;

function scheduleImmediateWakeupDrain() {
  if (!wakeupWorkerTimer) return;
  setImmediate(() => {
    processPendingWakeups().catch((err) => {
      console.error(`[WakeupWorker] Drain error: ${err.message}`);
    });
  });
}

/**
 * Enqueue a wakeup for an agent with duplicate-trigger coalescing
 *
 * @param {Object} params
 * @param {string|ObjectId} params.companyId
 * @param {string|ObjectId} params.agentId
 * @param {'manual'|'assignment'|'mention'|'cron'|'schedule'|'approval_resolved'|'dependency_resolved'} params.triggerType
 * @param {string|ObjectId} [params.targetIssueId]
 * @param {Object} [params.payload]
 * @returns {Promise<Object>} Queued or coalesced WakeupQueue doc
 */
async function enqueueWakeup({ companyId, agentId, triggerType, targetIssueId = null, payload = {} }) {
  const resolvedTargetIssueId = targetIssueId || (payload && payload.issueId) || null;
  const mergedPayloadInput =
    resolvedTargetIssueId && !(payload && payload.issueId)
      ? { ...payload, issueId: resolvedTargetIssueId }
      : { ...payload };

  // Check if agent already has a pending 'queued' wakeup
  const existingQueued = await WakeupQueue.findOne({
    companyId,
    agentId,
    status: 'queued'
  });

  if (existingQueued) {
    // Coalesce: Merge payload and increment count
    existingQueued.coalescedCount += 1;
    if (resolvedTargetIssueId && !existingQueued.targetIssueId) {
      existingQueued.targetIssueId = resolvedTargetIssueId;
    }
    existingQueued.payload = {
      ...existingQueued.payload,
      ...mergedPayloadInput,
      lastMergedAt: new Date()
    };
    await existingQueued.save();
    scheduleImmediateWakeupDrain();
    return { wakeup: existingQueued, coalesced: true };
  }

  // Create new queued entry
  const newWakeup = await WakeupQueue.create({
    companyId,
    agentId,
    triggerType,
    targetIssueId: resolvedTargetIssueId,
    status: 'queued',
    coalescedCount: 1,
    payload: mergedPayloadInput
  });

  scheduleImmediateWakeupDrain();
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

/**
 * Claims and executes eligible queued wakeups across companies
 */
async function processPendingWakeups({ maxDispatches = 5, runExecutor = null } = {}) {
  if (isDrainingWakeups) return 0;
  isDrainingWakeups = true;

  try {
    const execute = runExecutor || require('./heartbeatEngine').executeHeartbeat;
    const companyIds = await WakeupQueue.distinct('companyId', { status: 'queued' });
    const dispatchedTasks = [];

    for (const companyId of companyIds) {
      while (dispatchedTasks.length < maxDispatches) {
        const eligible = await getNextEligibleWakeup(companyId);
        if (!eligible) break;

        const claimed = await WakeupQueue.findOneAndUpdate(
          { _id: eligible.wakeup._id, status: 'queued' },
          { $set: { status: 'processing' } },
          { new: true }
        );
        if (!claimed) continue;

        const targetIssueId = claimed.targetIssueId || (claimed.payload && claimed.payload.issueId) || null;
        const run = await HeartbeatRun.create({
          companyId: claimed.companyId,
          agentId: claimed.agentId,
          targetIssueId,
          wakeupQueueId: claimed._id,
          triggerType: claimed.triggerType,
          status: 'running',
          startedAt: new Date(),
          logs: [
            {
              ts: new Date(),
              level: 'system',
              message: `Queued ${claimed.triggerType} wakeup dispatched for execution`
            }
          ]
        });

        const task = execute({
          agentId: claimed.agentId,
          companyId: claimed.companyId,
          triggerType: claimed.triggerType,
          issueId: targetIssueId,
          wakeupId: claimed._id,
          existingRunId: run._id
        }).catch(async (err) => {
          console.error(`[WakeupWorker] Execution failed for wakeup ${claimed._id}: ${err.message}`);
          await HeartbeatRun.updateOne(
            { _id: run._id, status: 'running' },
            {
              $set: { status: 'failed', endedAt: new Date(), errorMessage: err.message },
              $push: { logs: { ts: new Date(), level: 'error', message: err.message } }
            }
          ).catch(() => {});
          await WakeupQueue.updateOne(
            { _id: claimed._id, status: 'processing' },
            { $set: { status: 'failed', processedAt: new Date() } }
          ).catch(() => {});
        });

        dispatchedTasks.push(task);
      }
    }

    if (dispatchedTasks.length > 0) {
      await Promise.allSettled(dispatchedTasks);
    }

    return dispatchedTasks.length;
  } finally {
    isDrainingWakeups = false;
  }
}

function startWakeupWorker(intervalMs = WAKEUP_POLL_INTERVAL_MS) {
  if (wakeupWorkerTimer) return;
  console.log('[WakeupWorker] Starting WakeupQueue background consumer...');
  processPendingWakeups().catch((err) => {
    console.error(`[WakeupWorker] Initial drain error: ${err.message}`);
  });
  wakeupWorkerTimer = setInterval(() => {
    processPendingWakeups().catch((err) => {
      console.error(`[WakeupWorker] Poll error: ${err.message}`);
    });
  }, intervalMs);
}

function stopWakeupWorker() {
  if (wakeupWorkerTimer) {
    clearInterval(wakeupWorkerTimer);
    wakeupWorkerTimer = null;
    console.log('[WakeupWorker] Stopped WakeupQueue background consumer.');
  }
}

module.exports = {
  MAX_CONCURRENT_HEARTBEATS_PER_COMPANY,
  AUTO_WAKEUP_COOLDOWN_MS,
  WAKEUP_POLL_INTERVAL_MS,
  enqueueWakeup,
  canAgentExecute,
  getNextEligibleWakeup,
  processPendingWakeups,
  startWakeupWorker,
  stopWakeupWorker
};
