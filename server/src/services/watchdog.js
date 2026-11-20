const { HeartbeatRun, Issue, Agent } = require('../models');

const WATCHDOG_INTERVAL_MS = 30 * 1000; // 30 seconds

/**
 * Sweeps the database for stalled runs where lockExpiresAt < now
 * Reclaims orphaned locks, resets issues to 'todo', and sets agents to 'idle'
 */
async function sweepZombieLocks() {
  const now = new Date();
  try {
    // 1. Find all issues where lockExpiresAt has expired but lockedByRunId is still present
    const expiredIssues = await Issue.find({
      lockedByRunId: { $ne: null },
      lockExpiresAt: { $lt: now }
    });

    for (const issue of expiredIssues) {
      console.warn(`[Watchdog] Found expired lease on Issue ${issue.identifier || issue._id}. Reclaiming lock...`);

      const runId = issue.lockedByRunId;
      const agentId = issue.assigneeAgentId;

      // Mark HeartbeatRun as stalled
      if (runId) {
        await HeartbeatRun.findByIdAndUpdate(runId, {
          $set: {
            status: 'stalled',
            finishedAt: now
          },
          $push: {
            logs: {
              ts: now,
              level: 'WARN',
              message: 'Zombie Lock Watchdog: Run exceeded 5-minute lease and was marked stalled.'
            }
          }
        });
      }

      // Unlock issue and revert to 'todo'
      await Issue.findByIdAndUpdate(issue._id, {
        $set: {
          lockedByRunId: null,
          lockExpiresAt: null,
          status: 'todo'
        }
      });

      // Reset Agent status to 'idle'
      if (agentId) {
        await Agent.findByIdAndUpdate(agentId, {
          $set: { status: 'idle' }
        });
      }

      console.log(`[Watchdog] Successfully reclaimed Issue ${issue.identifier || issue._id} and restored Agent to idle.`);
    }

    // 2. Also check HeartbeatRuns that are marked 'running' for more than 10 minutes without active lock
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const orphanRuns = await HeartbeatRun.find({
      status: 'running',
      startedAt: { $lt: tenMinutesAgo }
    });

    for (const run of orphanRuns) {
      console.warn(`[Watchdog] Marking orphan HeartbeatRun ${run._id} as stalled.`);
      run.status = 'stalled';
      run.finishedAt = now;
      run.logs.push({
        ts: now,
        level: 'WARN',
        message: 'Watchdog: Run timed out with no active issue lease.'
      });
      await run.save();

      if (run.agentId) {
        await Agent.findByIdAndUpdate(run.agentId, {
          $set: { status: 'idle' }
        });
      }
    }
  } catch (err) {
    console.error(`[Watchdog] Error during zombie lock sweep: ${err.message}`);
  }
}

let watchdogTimer = null;

function startWatchdog() {
  if (watchdogTimer) return;
  console.log('[Watchdog] Starting 30-Second Zombie Lock Watchdog service...');
  // Initial sweep on server boot
  sweepZombieLocks();
  // Periodic sweep
  watchdogTimer = setInterval(sweepZombieLocks, WATCHDOG_INTERVAL_MS);
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
    console.log('[Watchdog] Stopped Zombie Lock Watchdog service.');
  }
}

module.exports = {
  WATCHDOG_INTERVAL_MS,
  sweepZombieLocks,
  startWatchdog,
  stopWatchdog
};
