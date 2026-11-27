const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const { HeartbeatRun, Agent, Company, Issue, BudgetIncident } = require('../models');
const { runEventBus, executeHeartbeat } = require('../services/heartbeatEngine');
const { enqueueWakeup } = require('../services/wakeupQueue');
const { authenticateJWT, requireCompanyMember } = require('../middleware/auth');

router.use(authenticateJWT);

/**
 * GET /api/runs
 * List recent heartbeat runs
 */
router.get('/', async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = {};
    if (companyId) {
      req.companyId = companyId;
      await new Promise((resolve, reject) => {
        requireCompanyMember(req, res, (err) => (err ? reject(err) : resolve()));
      });
      if (res.headersSent) return;
      filter.companyId = req.company._id;
    } else {
      const accessibleCompanies = await Company.find({
        $or: [{ ownerUserId: req.user._id }, { 'members.userId': req.user._id }],
      }).distinct('_id');
      filter.companyId = { $in: accessibleCompanies };
    }
    const runs = await HeartbeatRun.find(filter)
      .sort({ startedAt: -1 })
      .limit(20)
      .populate('agentId', 'name role')
      .populate('targetIssueId', 'identifier title issueKey status')
      .lean();

    const formattedRuns = runs.map((r) => ({
      ...r,
      issueId: r.targetIssueId,
      issue: r.targetIssueId,
    }));

    res.json(formattedRuns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/runs/:id/stream
 * Server-Sent Events (SSE) live telemetry console endpoint
 */
router.get('/:id/stream', async (req, res) => {
  const { id } = req.params;

  // Send historical logs from DB if run already exists or was started earlier
  let run = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    run = await HeartbeatRun.findById(id);
    if (run) {
      req.companyId = run.companyId;
      await new Promise((resolve, reject) => {
        requireCompanyMember(req, res, (err) => (err ? reject(err) : resolve()));
      });
      if (res.headersSent) return;
    }
  }

  // Set mandatory SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disables proxy buffering on Render / Nginx
  });

  // Keep-alive heartbeat comment every 15s
  const keepAliveInterval = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  if (run) {
    if (run.logs && run.logs.length > 0) {
      for (const log of run.logs) {
        res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
      }
    }
    if (run.status !== 'running') {
      res.write(`event: usage\ndata: ${JSON.stringify({
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
        costMicrocents: run.costMicrocents
      })}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({ status: run.status })}\n\n`);
      clearInterval(keepAliveInterval);
      return res.end();
    }
  } else if (!mongoose.Types.ObjectId.isValid(id)) {
    // Demo / mock run event stream simulation
    res.write(`event: log\ndata: ${JSON.stringify({ ts: new Date().toISOString(), level: 'system', message: `Attached to live telemetry stream for run [${id}]` })}\n\n`);
    res.write(`event: log\ndata: ${JSON.stringify({ ts: new Date().toISOString(), level: 'info', message: 'Agent heartbeat engine monitoring active.' })}\n\n`);
  }

  // Subscribe to live run event bus
  const eventHandler = ({ event, data }) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (event === 'done') {
      clearInterval(keepAliveInterval);
      runEventBus.removeListener(`run:${id}`, eventHandler);
      res.end();
    }
  };

  runEventBus.on(`run:${id}`, eventHandler);

  // Clean up listener when client disconnects
  req.on('close', () => {
    clearInterval(keepAliveInterval);
    runEventBus.removeListener(`run:${id}`, eventHandler);
  });
});

/**
 * GET /api/runs/:id
 * Fetches status and details of a single heartbeat run
 */
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Run not found' });
    }
    const run = await HeartbeatRun.findById(req.params.id)
      .populate('agentId', 'name role title')
      .populate('targetIssueId', 'identifier title status issueKey')
      .lean();
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    req.companyId = run.companyId;
    await new Promise((resolve, reject) => {
      requireCompanyMember(req, res, (err) => (err ? reject(err) : resolve()));
    });
    if (res.headersSent) return;

    run.issueId = run.targetIssueId;
    run.issue = run.targetIssueId;
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/agents/:id/invoke
 * Manually invokes an agent heartbeat run (Used by Org Chart "Run Now" button)
 */
router.post('/agents/:id/invoke', async (req, res) => {
  const { id } = req.params;
  const { issueId } = req.body;

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid agent ID format' });
    }
    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    req.companyId = agent.companyId;
    await new Promise((resolve, reject) => {
      requireCompanyMember(req, res, (err) => (err ? reject(err) : resolve()));
    });
    if (res.headersSent) return;

    if (agent.status === 'paused' || agent.status === 'terminated') {
      return res.status(409).json({ error: 'This agent cannot be invoked in its current status' });
    }

    const budgetLimitMicrocents = (agent.budgetMonthlyCents || 100) * 10000;
    if ((agent.spentMonthlyMicrocents || 0) >= budgetLimitMicrocents) {
      agent.status = 'budget_stopped';
      await agent.save();
      await BudgetIncident.updateOne(
        { agentId: agent._id, companyId: agent.companyId, status: 'open' },
        {
          $setOnInsert: {
            agentId: agent._id,
            companyId: agent.companyId,
            threshold: 100,
            spentMonthlyMicrocents: agent.spentMonthlyMicrocents || 0,
            budgetMonthlyCents: agent.budgetMonthlyCents || 100,
          },
        },
        { upsert: true }
      );
      return res.status(409).json({ error: 'Agent monthly budget is exhausted' });
    }

    let validIssueId = null;
    if (issueId !== undefined && issueId !== null) {
      if (!mongoose.Types.ObjectId.isValid(issueId)) {
        return res.status(400).json({ error: 'Invalid issue ID format' });
      }
      const targetIssue = await Issue.findOne({ _id: issueId, companyId: agent.companyId });
      if (!targetIssue) {
        return res.status(404).json({ error: 'Issue not found in this company' });
      }
      validIssueId = targetIssue._id;
    }

    // Enqueue manual wakeup
    const { wakeup } = await enqueueWakeup({
      companyId: agent.companyId,
      agentId: agent._id,
      triggerType: 'manual',
      targetIssueId: validIssueId,
      payload: validIssueId ? { issueId: validIssueId } : {}
    });

    const run = await HeartbeatRun.create({
      companyId: agent.companyId,
      agentId: agent._id,
      targetIssueId: validIssueId,
      wakeupQueueId: wakeup._id,
      triggerType: 'manual',
      status: 'running',
      startedAt: new Date(),
      logs: [
        {
          ts: new Date(),
          level: 'system',
          message: `Manual heartbeat invocation queued for ${agent.name}`,
        },
      ],
    });

    // Execute asynchronously in background
    setImmediate(() => {
      executeHeartbeat({
        agentId: agent._id,
        companyId: agent.companyId,
        triggerType: 'manual',
        issueId: validIssueId,
        wakeupId: wakeup._id,
        existingRunId: run._id,
      }).catch(err => {
        console.error(`[Invoke] Background heartbeat failed: ${err.message}`);
      });
    });

    res.status(202).json({
      message: 'Agent heartbeat invocation started',
      wakeupId: wakeup._id,
      runId: run._id,
      agentId: agent._id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
