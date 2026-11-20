const express = require('express');
const mongoose = require('mongoose');
const Company = require('../models/Company');
const Agent = require('../models/Agent');
const AgentConfigRevision = require('../models/AgentConfigRevision');
const Goal = require('../models/Goal');
const Issue = require('../models/Issue');
const IssueComment = require('../models/IssueComment');
const ActivityLog = require('../models/ActivityLog');
const Approval = require('../models/Approval');
const BudgetIncident = require('../models/BudgetIncident');
const { authenticateJWT, requireCompanyMember } = require('../middleware/auth');
const { recordActivity } = require('../middleware/auditLog');
const { scrubSensitiveData } = require('../services/vault');
const { generateAuditCSV } = require('../utils/csvExport');

const router = express.Router();

router.use(authenticateJWT);

/**
 * @route   GET /api/companies
 * @desc    Get all company workspaces accessible to the authenticated user
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;
    const companies = await Company.find({
      $or: [{ ownerUserId: userId }, { 'members.userId': userId }],
    }).sort({ createdAt: -1 });

    return res.status(200).json({ companies });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch companies', details: err.message });
  }
});

/**
 * @route   POST /api/companies
 * @desc    Create a new company workspace
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, issuePrefix, budgetMonthlyCents, requireHireApproval } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const prefix = (issuePrefix || 'PAP').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,6}$/.test(prefix)) {
      return res.status(400).json({
        error: 'Issue prefix must be 2-6 alphanumeric uppercase characters (e.g. PAP)',
      });
    }

    const company = new Company({
      name: name.trim(),
      description: description ? description.trim() : '',
      issuePrefix: prefix,
      budgetMonthlyCents: typeof budgetMonthlyCents === 'number' ? budgetMonthlyCents : 10000,
      requireHireApproval: Boolean(requireHireApproval),
      ownerUserId: req.user._id,
      members: [
        {
          userId: req.user._id,
          role: 'owner',
        },
      ],
    });

    await company.save();

    await recordActivity({
      companyId: company._id,
      actorType: 'user',
      actorId: req.user._id,
      actorName: req.user.name,
      action: 'create_company',
      entityType: 'Company',
      entityId: company._id,
      details: { name: company.name, issuePrefix: company.issuePrefix },
      ip: req.ip || '',
    });

    return res.status(201).json({
      message: 'Company workspace created successfully',
      company,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create company', details: err.message });
  }
});

/**
 * @route   GET /api/companies/:cid/agents
 * @desc    List agents in a company workspace
 * @access  Private (Company Member)
 */
router.get('/:cid/agents', requireCompanyMember, async (req, res) => {
  try {
    let agents = await Agent.find({ companyId: req.company._id }).sort({ createdAt: 1 }).lean();
    if (agents.length === 0) {
      const ceo = await Agent.create({
        companyId: req.company._id,
        name: 'Atlas (CEO)',
        title: 'Chief Executive Agent',
        role: 'CEO',
        adapter: 'groq_llm',
        model: 'llama-3.3-70b-versatile',
        status: 'idle',
        budgetMonthlyCents: 500,
        instructionsMarkdown: '# CEO Directive\nCoordinate team, break high-level goals into atomic tickets.',
      });
      const cto = await Agent.create({
        companyId: req.company._id,
        name: 'Ada (CTO)',
        title: 'Chief Technical Agent',
        role: 'CTO',
        reportsTo: ceo._id,
        adapter: 'groq_llm',
        model: 'llama-3.3-70b-versatile',
        status: 'idle',
        budgetMonthlyCents: 350,
        instructionsMarkdown: '# CTO Directive\nArchitect backend, enforce atomic locks and microcent accounting.',
      });
      const dev = await Agent.create({
        companyId: req.company._id,
        name: 'Nexus (Engineer)',
        title: 'Lead Full Stack Engineer',
        role: 'Senior Engineer',
        reportsTo: cto._id,
        adapter: 'groq_llm',
        model: 'llama-3.3-70b-versatile',
        status: 'idle',
        budgetMonthlyCents: 250,
        instructionsMarkdown: '# Senior Engineer Directive\nImplement components, write tests, attach deliverables.',
      });
      const qa = await Agent.create({
        companyId: req.company._id,
        name: 'Vigil (QA Gatekeeper)',
        title: 'QA & Security Engineer',
        role: 'QA Engineer',
        reportsTo: cto._id,
        adapter: 'gemini_llm',
        model: 'gemini-2.5-flash',
        status: 'idle',
        budgetMonthlyCents: 200,
        instructionsMarkdown: '# QA Directive\nVerify acceptance criteria and inspect deliverables before closing tickets.',
      });
      agents = [ceo, cto, dev, qa].map((a) => a.toObject());
    }
    return res.status(200).json({
      agents: agents.map((agent) => ({
        ...agent,
        _id: agent._id.toString(),
        companyId: agent.companyId.toString(),
        reportsTo: agent.reportsTo ? agent.reportsTo.toString() : null,
        title: agent.title || '',
        adapterType: agent.adapter,
        adapterConfig: {
          model: agent.model,
          webhookUrl: agent.webhookUrl || '',
          heartbeatCron: agent.heartbeatCron || '',
          autoHeartbeatEnabled: Boolean(agent.autoHeartbeatEnabled),
        },
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch company agents', details: err.message });
  }
});

/**
 * @route   GET /api/companies/:cid
 * @desc    Get details of a specific company workspace
 * @access  Private (Company Member)
 */
router.get('/:cid', requireCompanyMember, async (req, res) => {
  return res.status(200).json({ company: req.company });
});

/**
 * @route   POST /api/companies/:cid/agents
 * @desc    Hire an agent into a company workspace
 * @access  Private (Company Member)
 */
router.post('/:cid/agents', requireCompanyMember, async (req, res) => {
  try {
    const {
      name,
      title,
      role,
      adapterType = 'groq_llm',
      model = 'llama-3.3-70b-versatile',
      budgetMonthlyCents = 250,
      reportsTo = null,
    } = req.body;

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Agent name is required' });
    }
    if (typeof role !== 'string' || !role.trim()) {
      return res.status(400).json({ error: 'Agent role is required' });
    }
    if (!['groq_llm', 'gemini_llm', 'http_webhook'].includes(adapterType)) {
      return res.status(400).json({ error: 'Unsupported agent adapter' });
    }
    if (!Number.isFinite(budgetMonthlyCents) || budgetMonthlyCents < 0) {
      return res.status(400).json({ error: 'Monthly budget must be a non-negative number of cents' });
    }

    if (reportsTo) {
      const manager = await Agent.findOne({ _id: reportsTo, companyId: req.company._id });
      if (!manager) {
        return res.status(400).json({ error: 'Manager must belong to this company' });
      }
    }

    const created = await Agent.create({
      companyId: req.company._id,
      name: name.trim(),
      title: typeof title === 'string' ? title.trim() : '',
      role: role.trim(),
      reportsTo,
      adapter: adapterType,
      model: typeof model === 'string' && model.trim() ? model.trim() : 'llama-3.3-70b-versatile',
      instructionsMarkdown: '',
      budgetMonthlyCents,
      status: 'idle',
    });

    const agent = {
      _id: created._id,
      companyId: created.companyId,
      name: created.name,
      title: created.title,
      role: created.role,
      reportsTo: created.reportsTo,
      adapterType: created.adapter,
      adapterConfig: { model: created.model },
      status: created.status,
      budgetMonthlyCents: created.budgetMonthlyCents,
      spentMonthlyMicrocents: created.spentMonthlyMicrocents,
      instructionsMarkdown: created.instructionsMarkdown,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };

    await AgentConfigRevision.create({
      agentId: created._id,
      companyId: req.company._id,
      revisionNumber: 1,
      changedByUserId: req.user._id,
      instructionsMarkdown: created.instructionsMarkdown,
      adapter: created.adapter,
      model: created.model,
      budgetMonthlyCents: created.budgetMonthlyCents,
      changedKeys: ['created'],
      snapshot: created.toObject(),
      reason: 'Agent hired',
    });

    await recordActivity({
      companyId: req.company._id,
      actorType: 'user',
      actorId: req.user._id,
      actorName: req.user.name,
      action: 'hire_agent',
      entityType: 'Agent',
      entityId: created._id,
      details: { name: created.name, role: created.role, adapter: created.adapter },
      ip: req.ip || '',
    });

    return res.status(201).json({ agent });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to hire agent', details: err.message });
  }
});

/**
 * @route   PATCH /api/companies/:cid
 * @desc    Update company workspace settings
 * @access  Private (Company Member)
 */
router.patch('/:cid', requireCompanyMember, async (req, res) => {
  try {
    const updates = {};
    const { name, description, budgetMonthlyCents, requireHireApproval } = req.body;

    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (budgetMonthlyCents !== undefined) {
      if (typeof budgetMonthlyCents !== 'number' || budgetMonthlyCents < 0) {
        return res.status(400).json({ error: 'Budget monthly cents must be a positive number' });
      }
      updates.budgetMonthlyCents = budgetMonthlyCents;
    }
    if (requireHireApproval !== undefined) {
      updates.requireHireApproval = Boolean(requireHireApproval);
    }

    const updated = await Company.findByIdAndUpdate(
      req.company._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    await recordActivity({
      companyId: req.company._id,
      actorType: 'user',
      actorId: req.user._id,
      actorName: req.user.name,
      action: 'update_company',
      entityType: 'Company',
      entityId: req.company._id,
      details: updates,
      ip: req.ip || '',
    });

    return res.status(200).json({
      message: 'Company settings updated successfully',
      company: updated,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update company', details: err.message });
  }
});

/**
 * @route   GET /api/companies/:cid/approvals
 * @desc    List governance approvals for a company
 * @access  Private (Company Member)
 */
router.get('/:cid/approvals', requireCompanyMember, async (req, res) => {
  try {
    let approvals = await Approval.find({ companyId: req.company._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('agentId', 'name')
      .lean();

    // If company has no approvals yet, auto-seed 2 realistic pending approvals for testing
    if (approvals.length === 0) {
      const ceo = await Agent.findOne({ companyId: req.company._id, role: 'CEO' }) || await Agent.findOne({ companyId: req.company._id });
      const cto = await Agent.findOne({ companyId: req.company._id, role: 'CTO' }) || ceo;
      if (ceo) {
        const app1 = await Approval.create({
          companyId: req.company._id,
          agentId: ceo._id,
          type: 'strategy_plan',
          payload: {
            objective: 'Deploy automated CI/CD pipeline & verify zero-downtime releases',
            targetDate: '2026-12-01',
            estimatedBudgetCents: 500,
          },
          status: 'pending',
        });
        const app2 = await Approval.create({
          companyId: req.company._id,
          agentId: cto ? cto._id : ceo._id,
          type: 'hire_agent',
          payload: {
            name: 'Mira (Data Analyst)',
            role: 'researcher',
            title: 'Data & Growth Analyst',
            budgetMonthlyCents: 250,
          },
          status: 'pending',
        });
        approvals = [
          { ...app1.toObject(), agentId: { _id: ceo._id, name: ceo.name } },
          { ...app2.toObject(), agentId: { _id: cto._id, name: cto.name } },
        ];
      }
    }

    return res.status(200).json({
      approvals: approvals.map((approval) => ({
        ...approval,
        _id: approval._id.toString(),
        companyId: approval.companyId.toString(),
        requestedByAgentId: approval.agentId?.name ? approval.agentId.name : (approval.agentId?._id?.toString() || approval.agentId?.toString() || ''),
        agentId: approval.agentId?._id?.toString() || approval.agentId?.toString() || '',
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch approvals', details: err.message });
  }
});

/**
 * @route   GET /api/companies/:cid/budget-incidents
 * @desc    List open agent budget incidents for a company
 * @access  Private (Company Member)
 */
router.get('/:cid/budget-incidents', requireCompanyMember, async (req, res) => {
  try {
    const incidents = await BudgetIncident.find({ companyId: req.company._id, status: 'open' })
      .sort({ createdAt: -1 })
      .populate('agentId', 'name')
      .lean();
    return res.status(200).json({
      incidents: incidents.map((incident) => ({
        ...incident,
        _id: incident._id.toString(),
        companyId: incident.companyId.toString(),
        agentId: incident.agentId?._id?.toString() || incident.agentId?.toString() || '',
        agentName: incident.agentId?.name || 'Agent',
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch budget incidents', details: err.message });
  }
});

/**
 * @route   DELETE /api/companies/:cid
 * @desc    Delete a company workspace (Only Owner)
 * @access  Private (Owner Only)
 */
router.delete('/:cid', requireCompanyMember, async (req, res) => {
  try {
    if (req.company.ownerUserId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the company owner can delete this workspace' });
    }

    const companyId = req.company._id;

    // Clean up associated records
    await Promise.all([
      Company.findByIdAndDelete(companyId),
      Agent.deleteMany({ companyId }),
      AgentConfigRevision.deleteMany({ companyId }),
      Goal.deleteMany({ companyId }),
      Issue.deleteMany({ companyId }),
      IssueComment.deleteMany({ companyId }),
    ]);

    return res.status(200).json({ message: 'Company workspace deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete company', details: err.message });
  }
});

/**
 * @route   POST /api/companies/:cid/seed-demo
 * @desc    Seeds a 4-agent startup org (CEO, CTO, Senior Engineer, Growth Marketer), 2 Goals, and 3 starter Issues
 * @access  Private (Company Member)
 */
router.post('/:cid/seed-demo', requireCompanyMember, async (req, res) => {
  try {
    const company = req.company;
    const companyId = company._id;

    // 1. Create CEO Agent
    const ceoAgent = await Agent.create({
      companyId,
      name: 'Elena Vance (CEO)',
      role: 'CEO',
      reportsTo: null,
      adapter: 'groq_llm',
      model: 'llama-3.3-70b-versatile',
      status: 'idle',
      instructionsMarkdown:
        '# CEO Directive\nYou are the autonomous CEO of the company. Break down strategic goals into tactical tickets, assign work to CTO and Growth Marketer, and ensure high operational rigor.',
      budgetMonthlyCents: 5000,
    });

    // 2. Create CTO Agent
    const ctoAgent = await Agent.create({
      companyId,
      name: 'Marcus Brody (CTO)',
      role: 'CTO',
      reportsTo: ceoAgent._id,
      adapter: 'groq_llm',
      model: 'llama-3.3-70b-versatile',
      status: 'idle',
      instructionsMarkdown:
        '# CTO Directive\nYou lead engineering. Architect clean REST APIs, oversee database schemas, verify acceptance checklists, and supervise the Senior Engineer.',
      budgetMonthlyCents: 3500,
    });

    // 3. Create Senior Engineer Agent
    const engAgent = await Agent.create({
      companyId,
      name: 'Kaelen Voss (Senior Engineer)',
      role: 'Senior Engineer',
      reportsTo: ctoAgent._id,
      adapter: 'groq_llm',
      model: 'llama-3.3-70b-versatile',
      status: 'idle',
      instructionsMarkdown:
        '# Senior Engineer Directive\nImplement robust backend services, lock tickets with atomic checkout, write clean tests, and attach deliverables before submitting to In Review.',
      budgetMonthlyCents: 2500,
    });

    // 4. Create Growth Marketer Agent
    const mktAgent = await Agent.create({
      companyId,
      name: 'Sarah Connor (Growth Marketer)',
      role: 'Growth Marketer',
      reportsTo: ceoAgent._id,
      adapter: 'gemini_llm',
      model: 'gemini-2.5-flash',
      status: 'idle',
      instructionsMarkdown:
        '# Growth Marketer Directive\nCraft launch campaigns, write developer docs, analyze competitive positioning, and execute audience acquisition sprints.',
      budgetMonthlyCents: 2000,
    });

    const agents = [ceoAgent, ctoAgent, engAgent, mktAgent];

    // Create Initial Agent Config Revisions
    await Promise.all(
      agents.map((agent) =>
        AgentConfigRevision.create({
          agentId: agent._id,
          companyId,
          revisionNumber: 1,
          changedByUserId: req.user._id,
          instructionsMarkdown: agent.instructionsMarkdown,
          adapter: agent.adapter,
          model: agent.model,
          budgetMonthlyCents: agent.budgetMonthlyCents,
          snapshot: agent.toObject(),
          reason: 'Initial demo startup seed snapshot',
        })
      )
    );

    // 5. Create 2 Goals
    const goal1 = await Goal.create({
      companyId,
      title: 'Launch Paperclip MERN Autonomous AI Workforce MVP',
      description: 'Ship a production-grade multi-agent control plane on free-tier cloud with $0 budget.',
      status: 'active',
      createdByUserId: req.user._id,
      targetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    const goal2 = await Goal.create({
      companyId,
      title: 'Acquire First 50 Active Control Plane Workspaces',
      description: 'Execute launch campaign across developer communities and showcase 1-click demo automation.',
      status: 'active',
      createdByUserId: req.user._id,
      targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // 6. Create 3 Starter Issues with Atomic Issue Counter
    // Increment counter by 3
    const updatedCompany = await Company.findByIdAndUpdate(
      companyId,
      { $inc: { issueCounter: 3 } },
      { new: true }
    );
    const startCounter = updatedCompany.issueCounter - 3;
    const prefix = updatedCompany.issuePrefix;

    const issue1 = await Issue.create({
      companyId,
      goalId: goal1._id,
      issueNumber: startCounter + 1,
      issueKey: `${prefix}-${startCounter + 1}`,
      title: 'Architect zero-setup cloud AI adapters & atomic checkout lock',
      description: 'Implement Groq and Gemini adapters with 5-minute checkout lease and 409 conflict handling.',
      status: 'todo',
      priority: 'high',
      assigneeAgentId: ctoAgent._id,
      creatorUserId: req.user._id,
      acceptanceCriteria: [
        { id: 'ac1', text: 'Groq LLM adapter supports llama-3.3-70b JSON tool calls', completed: false },
        { id: 'ac2', text: 'Atomic findOneAndUpdate locks ticket with 5-minute TTL', completed: false },
        { id: 'ac3', text: 'Returns 409 Conflict if locked by concurrent run', completed: false },
      ],
      deliverables: [],
    });

    const issue2 = await Issue.create({
      companyId,
      goalId: goal1._id,
      issueNumber: startCounter + 2,
      issueKey: `${prefix}-${startCounter + 2}`,
      title: 'Implement Delta-Only Comment Hydration & 30s Watchdog',
      description: 'Only send unread comments to LLM prompt to save 70% tokens, and sweep stalled zombie runs.',
      status: 'backlog',
      priority: 'urgent',
      assigneeAgentId: engAgent._id,
      creatorUserId: req.user._id,
      acceptanceCriteria: [
        { id: 'ac1', text: 'Track lastHydratedCommentCount per ticket', completed: false },
        { id: 'ac2', text: 'Skip hydrated comments during prompt assembly', completed: false },
        { id: 'ac3', text: 'Watchdog resets expired running locks every 30 seconds', completed: false },
      ],
      deliverables: [],
    });

    const issue3 = await Issue.create({
      companyId,
      goalId: goal2._id,
      issueNumber: startCounter + 3,
      issueKey: `${prefix}-${startCounter + 3}`,
      title: 'Draft Product Launch Campaign & Demo Documentation',
      description: 'Prepare launch notes, screenshots of visual org chart, and 1-click setup instructions.',
      status: 'todo',
      priority: 'medium',
      assigneeAgentId: mktAgent._id,
      creatorUserId: req.user._id,
      acceptanceCriteria: [
        { id: 'ac1', text: 'Write launch summary highlighting $0 free-tier operation', completed: false },
        { id: 'ac2', text: 'Document AES-256 vault security & human governance gates', completed: false },
      ],
      deliverables: [],
    });

    await recordActivity({
      companyId,
      actorType: 'user',
      actorId: req.user._id,
      actorName: req.user.name,
      action: 'seed_demo_company',
      entityType: 'Company',
      entityId: companyId,
      details: {
        agentsCount: agents.length,
        goalsCount: 2,
        issuesCount: 3,
      },
      ip: req.ip || '',
    });

    return res.status(201).json({
      message: 'Demo company successfully seeded with 4 agents, 2 goals, and 3 starter issues',
      company: updatedCompany,
      agents,
      goals: [goal1, goal2],
      issues: [issue1, issue2, issue3],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to seed demo company', details: err.message });
  }
});

/**
 * @route   GET /api/companies/:cid/export
 * @desc    Export company workspace as JSON with secrets strictly scrubbed
 * @access  Private (Company Member)
 */
router.get('/:cid/export', requireCompanyMember, async (req, res) => {
  try {
    const companyId = req.company._id;

    const [agents, revisions, goals, issues, comments] = await Promise.all([
      Agent.find({ companyId }).lean(),
      AgentConfigRevision.find({ companyId }).lean(),
      Goal.find({ companyId }).lean(),
      Issue.find({ companyId }).lean(),
      IssueComment.find({ companyId }).lean(),
    ]);

    // Format export package with metadata
    const rawExport = {
      exportVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      company: req.company.toObject(),
      agents,
      revisions,
      goals,
      issues,
      comments,
    };

    // Strict security rule: scrub all potential secret keys
    const scrubbed = scrubSensitiveData(rawExport);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="paperclip-export-${req.company.issuePrefix}-${Date.now()}.json"`
    );

    return res.status(200).send(JSON.stringify(scrubbed, null, 2));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to export company data', details: err.message });
  }
});

/**
 * @route   POST /api/companies/import
 * @desc    Import company workspace from exported JSON
 * @access  Private
 */
router.post('/import', async (req, res) => {
  try {
    const importData = req.body;

    if (!importData || !importData.company || !importData.company.name) {
      return res.status(400).json({ error: 'Invalid import file format: missing company object' });
    }

    const { company: sourceCompany, agents = [], goals = [], issues = [], comments = [] } = importData;

    // Create new Company for the importing user
    const newCompany = await Company.create({
      name: `${sourceCompany.name} (Imported)`,
      description: sourceCompany.description || '',
      issuePrefix: sourceCompany.issuePrefix || 'IMP',
      budgetMonthlyCents: sourceCompany.budgetMonthlyCents || 10000,
      requireHireApproval: Boolean(sourceCompany.requireHireApproval),
      ownerUserId: req.user._id,
      members: [{ userId: req.user._id, role: 'owner' }],
    });

    const companyId = newCompany._id;
    const idMap = new Map();

    // 1. Import Agents & map old _id -> new _id
    for (const a of agents) {
      const created = await Agent.create({
        companyId,
        name: a.name,
        role: a.role,
        avatar: a.avatar || '',
        reportsTo: null, // will link in second pass
        adapter: a.adapter || 'groq_llm',
        model: a.model || 'llama-3.3-70b-versatile',
        instructionsMarkdown: a.instructionsMarkdown || '',
        budgetMonthlyCents: a.budgetMonthlyCents || 2500,
        status: 'idle',
      });
      idMap.set(a._id.toString(), created._id);
    }

    // Link reportsTo for Org Chart hierarchy
    for (const a of agents) {
      if (a.reportsTo && idMap.has(a.reportsTo.toString())) {
        const newAgentId = idMap.get(a._id.toString());
        const newReportsTo = idMap.get(a.reportsTo.toString());
        await Agent.findByIdAndUpdate(newAgentId, { reportsTo: newReportsTo });
      }
    }

    // 2. Import Goals
    for (const g of goals) {
      let targetDateVal = null;
      if (g.targetDate && (typeof g.targetDate === 'string' || g.targetDate instanceof Date)) {
        const parsed = new Date(g.targetDate);
        if (!isNaN(parsed.getTime())) targetDateVal = parsed;
      }

      const created = await Goal.create({
        companyId,
        title: g.title,
        description: g.description || '',
        status: g.status || 'active',
        targetDate: targetDateVal,
        createdByUserId: req.user._id,
      });
      idMap.set(g._id.toString(), created._id);
    }

    // 3. Import Issues
    let maxIssueNumber = 0;
    for (const iss of issues) {
      const issueNum = iss.issueNumber || 1;
      if (issueNum > maxIssueNumber) maxIssueNumber = issueNum;

      const created = await Issue.create({
        companyId,
        goalId: iss.goalId && idMap.has(iss.goalId.toString()) ? idMap.get(iss.goalId.toString()) : null,
        issueNumber: issueNum,
        issueKey: `${newCompany.issuePrefix}-${issueNum}`,
        title: iss.title,
        description: iss.description || '',
        status: iss.status || 'backlog',
        priority: iss.priority || 'medium',
        assigneeAgentId:
          iss.assigneeAgentId && idMap.has(iss.assigneeAgentId.toString())
            ? idMap.get(iss.assigneeAgentId.toString())
            : null,
        creatorUserId: req.user._id,
        acceptanceCriteria: iss.acceptanceCriteria || [],
        deliverables: iss.deliverables || [],
      });
      idMap.set(iss._id.toString(), created._id);
    }

    // Update issueCounter to maxIssueNumber
    if (maxIssueNumber > 0) {
      await Company.findByIdAndUpdate(companyId, { issueCounter: maxIssueNumber });
    }

    await recordActivity({
      companyId,
      actorType: 'user',
      actorId: req.user._id,
      actorName: req.user.name,
      action: 'import_company',
      entityType: 'Company',
      entityId: companyId,
      details: {
        importedAgents: agents.length,
        importedGoals: goals.length,
        importedIssues: issues.length,
      },
      ip: req.ip || '',
    });

    return res.status(201).json({
      message: 'Company workspace successfully imported. Note: API keys scrubbed; configure in Secrets Vault.',
      company: newCompany,
      counts: {
        agents: agents.length,
        goals: goals.length,
        issues: issues.length,
      },
    });
  } catch (err) {
    console.error('[Import Error]:', err);
    return res.status(500).json({ error: 'Failed to import company data', details: err.message });
  }
});

/**
 * @route   GET /api/companies/:cid/audit
 * @desc    List the company's recent immutable activity audit entries
 * @access  Private (Company Member)
 */
router.get('/:cid/audit', requireCompanyMember, async (req, res) => {
  try {
    const logs = await ActivityLog.find({ companyId: req.company._id })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return res.status(200).json({ logs });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch audit log', details: err.message });
  }
});

/**
 * @route   GET /api/companies/:cid/audit/export
 * @desc    Export company audit trail as RFC 4180 CSV
 * @access  Private (Company Member)
 */
router.get('/:cid/audit/export', requireCompanyMember, async (req, res) => {
  try {
    const logs = await ActivityLog.find({ companyId: req.company._id }).sort({ createdAt: -1 });

    const csvData = generateAuditCSV(logs);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-log-${req.company.issuePrefix}-${Date.now()}.csv"`
    );

    return res.status(200).send(csvData);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to export audit log CSV', details: err.message });
  }
});

module.exports = router;
