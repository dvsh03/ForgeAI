const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Issue, IssueComment, Agent, Goal, Company } = require('../models');
const { acquireLock, releaseLock } = require('../services/issueLockService');
const { allocateIssueKey } = require('../utils/issueKey');
const { invokeGemini } = require('../adapters/geminiAdapter');
const { enqueueWakeup } = require('../services/wakeupQueue');

// ── GET /api/companies/:cid/issues ──────────────────────────
router.get('/companies/:cid/issues', async (req, res) => {
  try {
    const { cid } = req.params;
    const filter = mongoose.Types.ObjectId.isValid(cid)
      ? { companyId: cid }
      : {}; // fallback for demo_company_1
    const issues = await Issue.find(filter).sort({ createdAt: -1 });
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/companies/:cid/issues ─────────────────────────
router.post('/companies/:cid/issues', async (req, res) => {
  try {
    const { cid } = req.params;
    const { title, description, priority, status, assigneeAgentId, goalId, acceptanceCriteria } = req.body;

    let companyId = cid;
    let keyInfo = { issueNumber: 1, issueKey: `PAP-${Date.now().toString().slice(-4)}` };

    if (mongoose.Types.ObjectId.isValid(cid)) {
      try {
        keyInfo = await allocateIssueKey(cid);
      } catch (e) {
        // use fallback key
      }
    } else {
      // Find or create default demo company
      let demoCo = await Company.findOne({ name: 'Forge AI' });
      if (!demoCo) {
        demoCo = await Company.create({ name: 'Forge AI', issuePrefix: 'FORGE' });
      }
      companyId = demoCo._id;
      try {
        keyInfo = await allocateIssueKey(companyId);
      } catch (e) {
        keyInfo = { issueNumber: Math.floor(Math.random() * 1000), issueKey: `FORGE-${Math.floor(Math.random() * 1000)}` };
      }
    }

    const issue = await Issue.create({
      companyId,
      issueNumber: keyInfo.issueNumber,
      issueKey: keyInfo.issueKey,
      title: title || 'Untitled Issue',
      description: description || '',
      priority: priority || 'medium',
      status: status || 'todo',
      assigneeAgentId: assigneeAgentId && mongoose.Types.ObjectId.isValid(assigneeAgentId) ? assigneeAgentId : null,
      goalId: goalId && mongoose.Types.ObjectId.isValid(goalId) ? goalId : null,
      acceptanceCriteria: Array.isArray(acceptanceCriteria)
        ? acceptanceCriteria.map((c, i) => ({ id: `crit_${i + 1}`, text: c.text || c, completed: !!c.completed }))
        : [],
    });

    // If an agent is assigned, enqueue wakeup trigger
    if (issue.assigneeAgentId) {
      try {
        await enqueueWakeup({
          companyId,
          agentId: issue.assigneeAgentId,
          triggerType: 'assignment',
          targetIssueId: issue._id,
        });
      } catch (qErr) {
        // non-blocking
      }
    }

    res.status(201).json(issue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/companies/:cid/agents ──────────────────────────
router.get('/companies/:cid/agents', async (req, res) => {
  try {
    const { cid } = req.params;
    const filter = mongoose.Types.ObjectId.isValid(cid)
      ? { companyId: cid }
      : {};
    let agents = await Agent.find(filter);

    // If no agents in DB yet, seed initial 4-agent startup org
    if (agents.length === 0) {
      let company = await Company.findOne();
      if (!company) {
        company = await Company.create({ name: 'Forge AI', issuePrefix: 'FORGE' });
      }
      const ceo = await Agent.create({
        companyId: company._id,
        name: 'Atlas (CEO)',
        role: 'ceo',
        adapter: 'gemini_llm',
        model: 'gemini-3.5-flash-lite',
        status: 'idle',
        budgetMonthlyCents: 500,
        spentMonthlyMicrocents: 124000,
        instructionsMarkdown: 'Coordinate team, break high-level goals into atomic tickets.',
      });
      const cto = await Agent.create({
        companyId: company._id,
        name: 'Ada (CTO)',
        role: 'cto',
        reportsTo: ceo._id,
        adapter: 'gemini_llm',
        model: 'gemini-3.5-flash-lite',
        status: 'running',
        budgetMonthlyCents: 300,
        spentMonthlyMicrocents: 185000,
        instructionsMarkdown: 'Architect backend, enforce atomic locks and microcent accounting.',
      });
      const dev = await Agent.create({
        companyId: company._id,
        name: 'Nexus (Engineer)',
        role: 'engineer',
        reportsTo: cto._id,
        adapter: 'gemini_llm',
        model: 'gemini-3.5-flash-lite',
        status: 'idle',
        budgetMonthlyCents: 200,
        spentMonthlyMicrocents: 72000,
        instructionsMarkdown: 'Implement components, write tests, attach deliverables.',
      });
      const qa = await Agent.create({
        companyId: company._id,
        name: 'Vigil (QA Gatekeeper)',
        role: 'qa',
        reportsTo: cto._id,
        adapter: 'gemini_llm',
        model: 'gemini-3.5-flash-lite',
        status: 'idle',
        budgetMonthlyCents: 150,
        spentMonthlyMicrocents: 34000,
        instructionsMarkdown: 'Verify acceptance criteria and inspect deliverables before closing tickets.',
      });
      agents = [ceo, cto, dev, qa];
    }

    res.json({ agents, tree: agents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/companies/:cid/goals ───────────────────────────
router.get('/companies/:cid/goals', async (req, res) => {
  try {
    const { cid } = req.params;
    const filter = mongoose.Types.ObjectId.isValid(cid)
      ? { companyId: cid }
      : {};
    let goals = await Goal.find(filter);

    if (goals.length === 0) {
      let company = await Company.findOne();
      if (!company) {
        company = await Company.create({ name: 'Forge AI', issuePrefix: 'FORGE' });
      }
      const g1 = await Goal.create({
        companyId: company._id,
        title: 'Launch Paperclip MERN MVP on Free-Tier Cloud',
        description: 'Deploy control plane with $0 monthly operational budget.',
        status: 'active',
      });
      const g2 = await Goal.create({
        companyId: company._id,
        title: 'Autonomous Multi-Agent Heartbeat Loop',
        description: 'Verify 409 atomic lock contention and microcent circuit breakers.',
        status: 'active',
      });
      goals = [g1, g2];
    }

    res.json(goals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/issues/:id ─────────────────────────────────────
router.get('/issues/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    const issue = await Issue.findById(id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    res.json(issue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/issues/:id ───────────────────────────────────
router.patch('/issues/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    const updated = await Issue.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Issue not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/issues/:id/checkout ───────────────────────────
router.post('/issues/:id/checkout', async (req, res) => {
  try {
    const { id } = req.params;
    const runId = req.body.runId || new mongoose.Types.ObjectId();
    const result = await acquireLock(id, runId);
    if (result.conflict) {
      return res.status(409).json({ error: 'Issue locked by another run', lockedByRunId: result.lockedByRunId });
    }
    res.json({ message: 'Lock acquired', issue: result.issue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/issues/:id/qa-review ──────────────────────────
router.post('/issues/:id/qa-review', async (req, res) => {
  try {
    const { id } = req.params;
    const { passed, feedback } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    const targetStatus = passed ? 'done' : 'todo';
    const updated = await Issue.findByIdAndUpdate(
      id,
      { $set: { status: targetStatus } },
      { new: true }
    );
    if (feedback) {
      await IssueComment.create({
        companyId: updated.companyId,
        issueId: id,
        authorType: 'agent',
        authorName: 'Vigil (QA Gatekeeper)',
        body: `[QA Review: ${passed ? 'PASSED' : 'REJECTED'}] ${feedback}`,
      });
    }
    res.json({ issue: updated, message: `QA Review completed: ${targetStatus}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/issues/:id/comments ────────────────────────────
router.get('/issues/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.json([]);
    }
    const comments = await IssueComment.find({ issueId: id }).sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/issues/:id/comments ───────────────────────────
router.post('/issues/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { body, authorType, authorName } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    const issue = await Issue.findById(id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const comment = await IssueComment.create({
      companyId: issue.companyId,
      issueId: id,
      authorType: authorType || 'user',
      authorName: authorName || 'Board Operator',
      body: body || '',
    });

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/companies/:cid/plans/generate (AI Plan Decomposition) ──
router.post('/companies/:cid/plans/generate', async (req, res) => {
  try {
    const { objective, context } = req.body;
    const prompt = `You are the Lead Strategic AI Planner for an autonomous software organization.
Decompose the following high-level objective into 3 atomic, actionable engineering tasks with acceptance criteria.

Objective: ${objective}
${context ? `Context: ${context}` : ''}

Respond ONLY in valid JSON matching this exact structure:
{
  "tasks": [
    {
      "title": "Clear concise task title",
      "description": "Specific technical implementation details",
      "priority": "high",
      "assigneeRole": "engineer",
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"]
    }
  ]
}`;

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const aiResult = await invokeGemini({
          apiKey,
          systemInstruction: 'You are an AI task decomposition engine. Always return valid JSON only.',
          messages: [{ role: 'user', content: prompt }],
          tools: [],
          model: 'gemini-3.5-flash-lite',
        });

        const rawText = aiResult.content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(rawText);
        return res.json({
          plan: {
            objective,
            estimatedTotalMicrocents: aiResult.costMicrocents || 15000,
            tasks: parsed.tasks || [],
          },
          runId: new mongoose.Types.ObjectId(),
        });
      } catch (geminiErr) {
        console.warn('[PlanGenerator] Gemini call fallback to template:', geminiErr.message);
      }
    }

    // High quality template fallback
    res.json({
      plan: {
        objective,
        estimatedTotalMicrocents: 18000,
        tasks: [
          {
            title: `Architect technical specification for: ${objective.slice(0, 45)}`,
            description: 'Evaluate schema impacts, API contracts, and tenant boundary constraints.',
            priority: 'high',
            assigneeRole: 'cto',
            acceptanceCriteria: ['Define API payload contracts', 'Verify multi-tenant isolation'],
          },
          {
            title: `Implement core logic and unit tests`,
            description: 'Develop implementation with atomic lease locking and microcent accounting.',
            priority: 'urgent',
            assigneeRole: 'engineer',
            acceptanceCriteria: ['Pass unit verification suite', 'Attach code deliverable link'],
          },
          {
            title: `Perform QA audit & review acceptance checklist`,
            description: 'Inspect attached deliverables and verify acceptance checklist items before sign-off.',
            priority: 'medium',
            assigneeRole: 'qa',
            acceptanceCriteria: ['Deliverables verified', 'Transition ticket to Done'],
          },
        ],
      },
      runId: new mongoose.Types.ObjectId(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
