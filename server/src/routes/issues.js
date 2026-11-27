const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Issue, IssueComment, Agent, Goal, Company, User } = require('../models');
const { checkoutIssue } = require('../services/issueLockService');
const { allocateIssueKey } = require('../utils/issueKey');
const { callGemini } = require('../adapters/geminiAdapter');
const { enqueueWakeup } = require('../services/wakeupQueue');
const { authenticateJWT, requireCompanyMember } = require('../middleware/auth');

router.use(authenticateJWT);

const loadIssueAndRequireMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    const issue = await Issue.findById(id);
    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    req.issue = issue;
    req.companyId = issue.companyId;
    return requireCompanyMember(req, res, next);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

async function getOrCreateDemoCompany() {
  let company = (await Company.findOne({ name: 'Forge AI' })) || (await Company.findOne());
  if (company) return company;

  let owner = await User.findOne();
  if (!owner) {
    owner = await User.create({
      name: 'Forge Operator',
      email: 'operator@forgeai.dev',
      password: 'ForgeOperator2026!',
    });
  }

  company = await Company.create({
    name: 'Forge AI',
    issuePrefix: 'FORGE',
    ownerUserId: owner._id,
    members: [{ userId: owner._id, role: 'owner' }],
  });
  return company;
}

// ── GET /api/companies/:cid/issues ──────────────────────────
router.get('/companies/:cid/issues', requireCompanyMember, async (req, res) => {
  try {
    const companyId = req.company ? req.company._id : req.params.cid;
    const issues = await Issue.find({ companyId }).sort({ createdAt: -1 });
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/companies/:cid/issues ─────────────────────────
router.post('/companies/:cid/issues', requireCompanyMember, async (req, res) => {
  try {
    const { cid } = req.params;
    const { title, description, priority, status, assigneeAgentId, goalId, acceptanceCriteria } = req.body;

    const companyId = req.company ? req.company._id : (mongoose.Types.ObjectId.isValid(cid) ? cid : (await getOrCreateDemoCompany())._id);
    let keyInfo = { issueNumber: 1, issueKey: `PAP-${Date.now().toString().slice(-4)}` };

    try {
      keyInfo = await allocateIssueKey(companyId);
    } catch (e) {
      const prefix = req.company?.issuePrefix || 'FORGE';
      keyInfo = { issueNumber: Math.floor(Math.random() * 1000) + 1, issueKey: `${prefix}-${Math.floor(Math.random() * 1000) + 1}` };
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
          payload: { issueId: issue._id },
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

// ── GET /api/companies/:cid/goals ───────────────────────────
router.get('/companies/:cid/goals', requireCompanyMember, async (req, res) => {
  try {
    const companyId = req.company ? req.company._id : req.params.cid;
    let goals = await Goal.find({ companyId });

    if (goals.length === 0) {
      const g1 = await Goal.create({
        companyId,
        title: 'Launch Paperclip MERN MVP on Free-Tier Cloud',
        description: 'Deploy control plane with $0 monthly operational budget.',
        status: 'active',
      });
      const g2 = await Goal.create({
        companyId,
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
router.get('/issues/:id', loadIssueAndRequireMember, async (req, res) => {
  res.json(req.issue);
});

// ── PATCH /api/issues/:id ───────────────────────────────────
router.patch('/issues/:id', loadIssueAndRequireMember, async (req, res) => {
  try {
    const { id } = req.params;
    const previousAssigneeId = req.issue.assigneeAgentId ? req.issue.assigneeAgentId.toString() : null;
    const { companyId: _ignoreCompanyId, _id: _ignoreId, issueNumber: _ignoreNum, issueKey: _ignoreKey, ...safeUpdates } = req.body;
    const updated = await Issue.findByIdAndUpdate(
      id,
      { $set: safeUpdates },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Issue not found' });

    if (
      updated.assigneeAgentId &&
      updated.assigneeAgentId.toString() !== previousAssigneeId
    ) {
      try {
        await enqueueWakeup({
          companyId: updated.companyId,
          agentId: updated.assigneeAgentId,
          triggerType: 'assignment',
          targetIssueId: updated._id,
          payload: { issueId: updated._id },
        });
      } catch (qErr) {
        // non-blocking
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/issues/:id/checkout ───────────────────────────
router.post('/issues/:id/checkout', loadIssueAndRequireMember, async (req, res) => {
  try {
    const { id } = req.params;
    const runId = req.body.runId || new mongoose.Types.ObjectId();
    const agentId = req.body.agentId || req.issue.assigneeAgentId || null;
    const result = await checkoutIssue({
      companyId: req.issue.companyId,
      issueId: id,
      agentId,
      runId,
    });
    if (result.conflict) {
      const current = await Issue.findById(id).select('lockedByRunId');
      return res.status(409).json({
        error: 'Issue locked by another run',
        lockedByRunId: current ? current.lockedByRunId : null,
      });
    }
    res.json({ message: 'Lock acquired', issue: result.issue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/issues/:id/qa-review ──────────────────────────
router.post('/issues/:id/qa-review', loadIssueAndRequireMember, async (req, res) => {
  try {
    const { id } = req.params;
    const { passed, feedback } = req.body;
    const targetStatus = passed ? 'done' : 'todo';
    const updated = await Issue.findByIdAndUpdate(
      id,
      { $set: { status: targetStatus, lockedByRunId: null, lockExpiresAt: null } },
      { new: true }
    );
    if (feedback) {
      const commentText = `[QA Review: ${passed ? 'PASSED' : 'REJECTED'}] ${feedback}`;
      await IssueComment.create({
        companyId: updated.companyId,
        issueId: id,
        authorType: 'agent',
        authorName: 'Vigil (QA Gatekeeper)',
        content: commentText,
        body: commentText,
      });
    }

    // If QA review failed, wake up the assigned worker to address issues
    if (!passed && updated.assigneeAgentId) {
      try {
        await enqueueWakeup({
          companyId: updated.companyId,
          agentId: updated.assigneeAgentId,
          triggerType: 'assignment',
          targetIssueId: updated._id,
          payload: {
            issueId: updated._id,
            reason: 'qa_rejected',
            feedback: feedback || 'QA review rejected. Please address feedback.',
          },
        });
      } catch (wakeErr) {
        console.warn('[QA-Review] Failed to enqueue wakeup for rejected ticket:', wakeErr.message);
      }
    }

    res.json({ issue: updated, message: `QA Review completed: ${targetStatus}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/issues/:id/comments ────────────────────────────
router.get('/issues/:id/comments', loadIssueAndRequireMember, async (req, res) => {
  try {
    const { id } = req.params;
    const comments = await IssueComment.find({ issueId: id }).sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/issues/:id/comments ───────────────────────────
router.post('/issues/:id/comments', loadIssueAndRequireMember, async (req, res) => {
  try {
    const { id } = req.params;
    const { body, content, authorType, authorName } = req.body;
    const issue = req.issue;

    const commentText = content || body || '';
    if (!commentText.trim()) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const comment = await IssueComment.create({
      companyId: issue.companyId,
      issueId: id,
      authorType: authorType || 'user',
      authorUserId: req.user ? req.user._id : null,
      authorName: authorName || (req.user ? req.user.name : 'Board Operator'),
      content: commentText,
      body: commentText,
    });

    // Parse @Mentions (e.g., @Ada, @Nexus, @Vigil, @CTO, @Engineer)
    const mentionMatches = commentText.match(/@(\w+)/g);
    if (mentionMatches) {
      for (const mention of mentionMatches) {
        const targetNameOrRole = mention.replace('@', '').toLowerCase();
        const escapedToken = targetNameOrRole.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          const targetAgent = await Agent.findOne({
            companyId: issue.companyId,
            $or: [
              { role: new RegExp(`^${escapedToken}$`, 'i') },
              { name: new RegExp(`^${escapedToken}`, 'i') },
            ],
          });
          if (targetAgent) {
            await enqueueWakeup({
              companyId: issue.companyId,
              agentId: targetAgent._id,
              triggerType: 'mention',
              targetIssueId: issue._id,
              payload: {
                issueId: issue._id,
                mentionedBy: req.user ? req.user.name : 'Board Operator',
                commentText,
              },
            });
          }
        } catch (mErr) {
          console.warn('[Comments] Mention parse error:', mErr.message);
        }
      }
    }

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/companies/:cid/plans/generate (AI Plan Decomposition) ──
router.post('/companies/:cid/plans/generate', requireCompanyMember, async (req, res) => {
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
        const aiResult = await callGemini({
          apiKey,
          systemInstruction: 'You are an AI task decomposition engine. Always return valid JSON only.',
          messages: [{ role: 'user', content: prompt }],
          tools: [],
          model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
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
