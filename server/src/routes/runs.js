const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const { HeartbeatRun, Agent } = require('../models');
const { runEventBus, executeHeartbeat } = require('../services/heartbeatEngine');
const { enqueueWakeup } = require('../services/wakeupQueue');

/**
 * GET /api/runs
 * List recent heartbeat runs
 */
router.get('/', async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = {};
    if (companyId && mongoose.Types.ObjectId.isValid(companyId)) {
      filter.companyId = companyId;
    }
    const runs = await HeartbeatRun.find(filter)
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('agentId', 'name role')
      .populate('targetIssueId', 'identifier title issueKey');
    res.json(runs);
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

  // Set mandatory SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disables proxy buffering on Render / Nginx
  });

  // Keep-alive heartbeat comment every 15s
  const keepAliveInterval = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  // Send historical logs from DB if run already exists or was started earlier
  let run = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    run = await HeartbeatRun.findById(id);
  }

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
      .populate('issueId', 'identifier title status');
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
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
    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Enqueue manual wakeup
    const { wakeup } = await enqueueWakeup({
      companyId: agent.companyId,
      agentId: agent._id,
      triggerType: 'manual',
      payload: { issueId }
    });

    // Execute asynchronously in background
    executeHeartbeat({
      agentId: agent._id,
      companyId: agent.companyId,
      triggerType: 'manual',
      issueId,
      wakeupId: wakeup._id
    }).catch(err => {
      console.error(`[Invoke] Background heartbeat failed: ${err.message}`);
    });

    res.status(202).json({
      message: 'Agent heartbeat invocation started',
      wakeupId: wakeup._id,
      agentId: agent._id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
