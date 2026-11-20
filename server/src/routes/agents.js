const express = require('express');
const mongoose = require('mongoose');
const Agent = require('../models/Agent');
const AgentConfigRevision = require('../models/AgentConfigRevision');
const BudgetIncident = require('../models/BudgetIncident');
const Issue = require('../models/Issue');
const WakeupQueue = require('../models/WakeupQueue');
const { executeHeartbeat } = require('../services/heartbeatEngine');
const { authenticateJWT, requireCompanyMember } = require('../middleware/auth');
const { recordActivity } = require('../middleware/auditLog');

const router = express.Router();

const serializeAgent = (agent) => ({
  _id: agent._id.toString(),
  companyId: agent.companyId.toString(),
  name: agent.name,
  title: agent.title || '',
  role: agent.role,
  reportsTo: agent.reportsTo ? agent.reportsTo.toString() : null,
  adapterType: agent.adapter,
  adapterConfig: {
    model: agent.model,
    webhookUrl: agent.webhookUrl || '',
    heartbeatCron: agent.heartbeatCron || '',
    autoHeartbeatEnabled: Boolean(agent.autoHeartbeatEnabled),
  },
  status: agent.status,
  budgetMonthlyCents: agent.budgetMonthlyCents,
  spentMonthlyMicrocents: agent.spentMonthlyMicrocents,
  instructionsMarkdown: agent.instructionsMarkdown,
  createdAt: agent.createdAt,
  updatedAt: agent.updatedAt,
});

const loadAgent = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID format' });
    }

    const agent = await Agent.findById(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    req.agent = agent;
    req.companyId = agent.companyId;
    req.params.cid = agent.companyId.toString();
    return next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load agent', details: err.message });
  }
};

router.use(authenticateJWT);
router.use('/:agentId', loadAgent, requireCompanyMember);

router.patch('/:agentId', async (req, res) => {
  try {
    const updates = {};
    const { instructionsMarkdown, budgetMonthlyCents, adapterType, model, webhookUrl, heartbeatCron, autoHeartbeatEnabled } = req.body;

    if (instructionsMarkdown !== undefined) {
      if (typeof instructionsMarkdown !== 'string' || instructionsMarkdown.length > 15000) {
        return res.status(400).json({ error: 'Instructions must be a string no longer than 15000 characters' });
      }
      updates.instructionsMarkdown = instructionsMarkdown;
    }
    if (budgetMonthlyCents !== undefined) {
      if (!Number.isFinite(budgetMonthlyCents) || budgetMonthlyCents < 0) {
        return res.status(400).json({ error: 'Monthly budget must be a non-negative number of cents' });
      }
      updates.budgetMonthlyCents = budgetMonthlyCents;
    }
    if (adapterType !== undefined) {
      if (!['groq_llm', 'gemini_llm', 'http_webhook'].includes(adapterType)) {
        return res.status(400).json({ error: 'Unsupported agent adapter' });
      }
      updates.adapter = adapterType;
    }
    if (model !== undefined) {
      if (typeof model !== 'string' || !model.trim() || model.length > 200) {
        return res.status(400).json({ error: 'Model must be a non-empty string of at most 200 characters' });
      }
      updates.model = model.trim();
    }
    if (webhookUrl !== undefined) {
      if (typeof webhookUrl !== 'string' || webhookUrl.length > 2000) {
        return res.status(400).json({ error: 'Webhook URL must be a string of at most 2000 characters' });
      }
      updates.webhookUrl = webhookUrl.trim();
    }
    if (heartbeatCron !== undefined) {
      if (typeof heartbeatCron !== 'string' || heartbeatCron.length > 100) {
        return res.status(400).json({ error: 'Heartbeat schedule must be a string of at most 100 characters' });
      }
      updates.heartbeatCron = heartbeatCron.trim();
    }
    if (autoHeartbeatEnabled !== undefined) {
      if (typeof autoHeartbeatEnabled !== 'boolean') {
        return res.status(400).json({ error: 'autoHeartbeatEnabled must be a boolean' });
      }
      updates.autoHeartbeatEnabled = autoHeartbeatEnabled;
    }

    const before = req.agent.toObject();
    Object.assign(req.agent, updates);
    await req.agent.save();

    if (Object.keys(updates).length) {
      const previousRevision = await AgentConfigRevision.findOne({
        agentId: req.agent._id,
        companyId: req.agent.companyId,
      }).sort({ revisionNumber: -1 });
      await AgentConfigRevision.create({
        agentId: req.agent._id,
        companyId: req.agent.companyId,
        revisionNumber: (previousRevision?.revisionNumber || 0) + 1,
        changedByUserId: req.user._id,
        instructionsMarkdown: req.agent.instructionsMarkdown,
        adapter: req.agent.adapter,
        model: req.agent.model,
        budgetMonthlyCents: req.agent.budgetMonthlyCents,
        changedKeys: Object.keys(updates),
        snapshot: req.agent.toObject(),
        reason: `Updated ${Object.keys(updates).join(', ')}`,
      });

      await recordActivity({
        companyId: req.agent.companyId,
        actorId: req.user._id,
        actorName: req.user.name,
        action: 'update_agent',
        entityType: 'Agent',
        entityId: req.agent._id,
        details: { changedKeys: Object.keys(updates), previousStatus: before.status },
        ip: req.ip || '',
      });
    }

    return res.status(200).json(serializeAgent(req.agent));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update agent', details: err.message });
  }
});

router.get('/:agentId/revisions', async (req, res) => {
  try {
    const revisions = await AgentConfigRevision.find({
      agentId: req.agent._id,
      companyId: req.agent.companyId,
    }).sort({ revisionNumber: -1 }).lean();

    const result = revisions.map((revision, index) => {
      return {
        _id: revision._id.toString(),
        revisionNumber: revision.revisionNumber,
        changedKeys: revision.changedKeys || [],
        createdAt: revision.createdAt,
        reason: revision.reason,
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch agent revisions', details: err.message });
  }
});

router.post('/:agentId/revisions/:revisionId/rollback', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.revisionId)) {
      return res.status(400).json({ error: 'Invalid revision ID format' });
    }
    const revision = await AgentConfigRevision.findOne({
      _id: req.params.revisionId,
      agentId: req.agent._id,
      companyId: req.agent.companyId,
    });
    if (!revision) {
      return res.status(404).json({ error: 'Agent revision not found' });
    }

    const snapshot = revision.snapshot || {};
    const restoredFields = ['instructionsMarkdown', 'adapter', 'model', 'budgetMonthlyCents', 'webhookUrl', 'heartbeatCron', 'autoHeartbeatEnabled'];
    for (const field of restoredFields) {
      if (snapshot[field] !== undefined) req.agent[field] = snapshot[field];
    }
    await req.agent.save();

    const latestRevision = await AgentConfigRevision.findOne({
      agentId: req.agent._id,
      companyId: req.agent.companyId,
    }).sort({ revisionNumber: -1 });
    await AgentConfigRevision.create({
      agentId: req.agent._id,
      companyId: req.agent.companyId,
      revisionNumber: (latestRevision?.revisionNumber || 0) + 1,
      changedByUserId: req.user._id,
      instructionsMarkdown: req.agent.instructionsMarkdown,
      adapter: req.agent.adapter,
      model: req.agent.model,
      budgetMonthlyCents: req.agent.budgetMonthlyCents,
      changedKeys: restoredFields,
      snapshot: req.agent.toObject(),
      reason: `Rolled back to revision ${revision.revisionNumber}`,
    });

    await recordActivity({
      companyId: req.agent.companyId,
      actorId: req.user._id,
      actorName: req.user.name,
      action: 'rollback_agent_config',
      entityType: 'Agent',
      entityId: req.agent._id,
      details: { revisionNumber: revision.revisionNumber },
      ip: req.ip || '',
    });

    return res.status(200).json(serializeAgent(req.agent));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to roll back agent configuration', details: err.message });
  }
});

router.post('/:agentId/pause', async (req, res) => updateAgentStatus(req, res, 'paused'));
router.post('/:agentId/resume', async (req, res) => {
  if (req.agent.status === 'budget_stopped') {
    return res.status(409).json({ error: 'Resolve the open budget incident before resuming this agent' });
  }
  return updateAgentStatus(req, res, 'idle');
});

async function updateAgentStatus(req, res, status) {
  try {
    req.agent.status = status;
    await req.agent.save();
    await recordActivity({
      companyId: req.agent.companyId,
      actorId: req.user._id,
      actorName: req.user.name,
      action: status === 'paused' ? 'pause_agent' : 'resume_agent',
      entityType: 'Agent',
      entityId: req.agent._id,
      details: { status },
      ip: req.ip || '',
    });
    return res.status(200).json({ agent: serializeAgent(req.agent) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update agent status', details: err.message });
  }
}

router.post('/:agentId/invoke', async (req, res) => {
  try {
    if (req.agent.status === 'paused' || req.agent.status === 'terminated') {
      return res.status(409).json({ error: 'This agent cannot be invoked in its current status' });
    }

    const budgetLimitMicrocents = req.agent.budgetMonthlyCents * 10000;
    if (req.agent.spentMonthlyMicrocents >= budgetLimitMicrocents) {
      req.agent.status = 'budget_stopped';
      await req.agent.save();
      await BudgetIncident.updateOne(
        { agentId: req.agent._id, companyId: req.agent.companyId, status: 'open' },
        {
          $setOnInsert: {
            agentId: req.agent._id,
            companyId: req.agent.companyId,
            threshold: 100,
            spentMonthlyMicrocents: req.agent.spentMonthlyMicrocents,
            budgetMonthlyCents: req.agent.budgetMonthlyCents,
          },
        },
        { upsert: true }
      );
      return res.status(409).json({ error: 'Agent monthly budget is exhausted' });
    }

    let targetIssueId = null;
    if (req.body.issueId !== undefined && req.body.issueId !== null) {
      if (!mongoose.Types.ObjectId.isValid(req.body.issueId)) {
        return res.status(400).json({ error: 'Invalid issue ID format' });
      }
      const issue = await Issue.findOne({ _id: req.body.issueId, companyId: req.agent.companyId });
      if (!issue) return res.status(404).json({ error: 'Issue not found in this company' });
      targetIssueId = issue._id;
    }

    const wakeup = await WakeupQueue.create({
      companyId: req.agent.companyId,
      agentId: req.agent._id,
      triggerType: 'manual',
      targetIssueId,
      payload: req.body.payload || {},
    });

    // Execute asynchronously in background
    executeHeartbeat({
      agentId: req.agent._id,
      companyId: req.agent.companyId,
      triggerType: 'manual',
      issueId: targetIssueId,
      wakeupId: wakeup._id,
    }).catch((err) => {
      console.error(`[Invoke] Background heartbeat failed: ${err.message}`);
    });

    await recordActivity({
      companyId: req.agent.companyId,
      actorId: req.user._id,
      actorName: req.user.name,
      action: 'invoke_agent',
      entityType: 'WakeupQueue',
      entityId: wakeup._id,
      details: { agentId: req.agent._id, triggerType: 'manual' },
      ip: req.ip || '',
    });

    return res.status(202).json({ wakeupId: wakeup._id, status: wakeup.status });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to queue agent heartbeat', details: err.message });
  }
});

module.exports = router;
