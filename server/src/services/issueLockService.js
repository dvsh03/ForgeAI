const { Issue } = require('../models');

const LEASE_DURATION_MS = 5 * 60 * 1000; // 5-minute atomic checkout lease

/**
 * Atomically checkout and lock an issue for a heartbeat run
 * Enforces single-owner atomic lock and 409 Conflict rejection if locked
 *
 * @param {Object} params
 * @param {string|ObjectId} params.companyId
 * @param {string|ObjectId} params.issueId
 * @param {string|ObjectId} params.agentId
 * @param {string|ObjectId} params.runId
 * @returns {Promise<{ success: boolean, issue?: Object, conflict?: boolean }>}
 */
async function checkoutIssue({ companyId, issueId, agentId, runId }) {
  const now = new Date();
  const leaseExpiration = new Date(now.getTime() + LEASE_DURATION_MS);

  // Atomic findOneAndUpdate with lease and conflict check
  const lockedIssue = await Issue.findOneAndUpdate(
    {
      _id: issueId,
      companyId,
      status: { $in: ['backlog', 'todo', 'in_progress'] },
      $or: [
        { lockedByRunId: null },
        { lockExpiresAt: { $lt: now } },
        { lockedByRunId: runId } // Idempotent re-entry by the same run
      ]
    },
    {
      $set: {
        status: 'in_progress',
        assigneeAgentId: agentId,
        lockedByRunId: runId,
        lockExpiresAt: leaseExpiration
      }
    },
    { new: true }
  );

  if (!lockedIssue) {
    return {
      success: false,
      conflict: true,
      error: 'Ticket already locked by another run or not in an actionable status (409 Conflict)'
    };
  }

  return {
    success: true,
    issue: lockedIssue,
    conflict: false
  };
}

/**
 * Releases the atomic lock on an issue when a run finishes or submits for review
 *
 * @param {Object} params
 * @param {string|ObjectId} params.issueId
 * @param {string|ObjectId} params.runId
 * @param {string} [params.newStatus] - Optional updated status ('in_review', 'todo', 'backlog', etc.)
 * @param {number} [params.newHydratedCommentCount] - Optional delta cursor update
 */
async function releaseIssueLock({ issueId, runId, newStatus, newHydratedCommentCount }) {
  const updateFields = {
    lockedByRunId: null,
    lockExpiresAt: null
  };

  if (newStatus) {
    updateFields.status = newStatus;
  }
  if (typeof newHydratedCommentCount === 'number') {
    updateFields.lastHydratedCommentCount = newHydratedCommentCount;
  }

  return await Issue.findOneAndUpdate(
    {
      _id: issueId,
      lockedByRunId: runId
    },
    {
      $set: updateFields
    },
    { new: true }
  );
}

module.exports = {
  LEASE_DURATION_MS,
  checkoutIssue,
  releaseIssueLock
};
