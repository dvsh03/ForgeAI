const express = require('express');
const mongoose = require('mongoose');
const Approval = require('../models/Approval');
const Agent = require('../models/Agent');
const Company = require('../models/Company');
const Goal = require('../models/Goal');
const { authenticateJWT, requireCompanyMember } = require('../middleware/auth');
const { recordActivity } = require('../middleware/auditLog');

const router = express.Router();

const loadApproval = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.approvalId)) {
      return res.status(400).json({ error: 'Invalid approval ID format' });
    }
    const approval = await Approval.findById(req.params.approvalId);
    if (!approval) return res.status(404).json({ error: 'Approval not found' });
    req.approval = approval;
    req.companyId = approval.companyId;
    req.params.cid = approval.companyId.toString();
    return next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load approval', details: err.message });
  }
};

router.use(authenticateJWT);
router.use('/:approvalId', loadApproval, requireCompanyMember);

router.post('/:approvalId/decide', async (req, res) => {
  try {
    const { decision, decisionNote = '' } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected' });
    }
    if (typeof decisionNote !== 'string' || decisionNote.length > 2000) {
      return res.status(400).json({ error: 'Decision note must be a string of at most 2000 characters' });
    }
    if (req.approval.status !== 'pending') {
      return res.status(409).json({ error: 'This approval has already been decided' });
    }

    let result = null;
    if (decision === 'approved' && req.approval.type === 'hire_agent') {
      const payload = req.approval.payload || {};
      if (typeof payload.name !== 'string' || !payload.name.trim() || typeof payload.role !== 'string' || !payload.role.trim()) {
        return res.status(400).json({ error: 'Hire approval must include an agent name and role' });
      }
      const managerId = payload.reportsTo || req.approval.agentId;
      if (managerId) {
        const manager = await Agent.findOne({ _id: managerId, companyId: req.approval.companyId });
        if (!manager) return res.status(400).json({ error: 'Hire approval references an invalid manager agent' });
      }
      result = await Agent.create({
        companyId: req.approval.companyId,
        name: payload.name.trim(),
        title: typeof payload.title === 'string' ? payload.title.trim() : '',
        role: payload.role.trim(),
        reportsTo: managerId || null,
        adapter: ['groq_llm', 'gemini_llm', 'http_webhook'].includes(payload.adapterType) ? payload.adapterType : 'groq_llm',
        model: typeof payload.model === 'string' && payload.model.trim() ? payload.model.trim() : 'llama-3.3-70b-versatile',
        budgetMonthlyCents: Number.isFinite(payload.budgetMonthlyCents) && payload.budgetMonthlyCents >= 0
          ? payload.budgetMonthlyCents
          : 250,
        status: 'idle',
      });
    }

    if (decision === 'approved' && req.approval.type === 'budget_override') {
      const payload = req.approval.payload || {};
      const newBudget = payload.budgetMonthlyCents ?? payload.newBudgetMonthlyCents;
      if (!Number.isFinite(newBudget) || newBudget < 0) {
        return res.status(400).json({ error: 'Budget approval must include a non-negative budgetMonthlyCents value' });
      }
      if (payload.agentId) {
        const agent = await Agent.findOne({ _id: payload.agentId, companyId: req.approval.companyId });
        if (!agent) return res.status(400).json({ error: 'Budget approval references an invalid agent' });
        if (newBudget * 10000 <= agent.spentMonthlyMicrocents) {
          return res.status(400).json({ error: "Approved budget must exceed the agent's current monthly spend" });
        }
        agent.budgetMonthlyCents = newBudget;
        if (agent.status === 'budget_stopped' && agent.spentMonthlyMicrocents < newBudget * 10000) {
          agent.status = 'idle';
        }
        await agent.save();
      } else {
        const company = await Company.findById(req.approval.companyId);
        if (!company) return res.status(404).json({ error: 'Company not found' });
        if (newBudget * 10000 <= company.spentMonthlyMicrocents) {
          return res.status(400).json({ error: "Approved budget must exceed the company's current monthly spend" });
        }
        company.budgetMonthlyCents = newBudget;
        await company.save();
      }
    }

    if (decision === 'approved' && req.approval.type === 'strategy_plan') {
      const payload = req.approval.payload || {};
      const title = payload.objective || payload.title;
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Strategy approval must include an objective or title' });
      }
      let targetDate = null;
      if (payload.targetDate) {
        targetDate = new Date(payload.targetDate);
        if (Number.isNaN(targetDate.getTime())) {
          return res.status(400).json({ error: 'Strategy target date is invalid' });
        }
      }
      result = await Goal.create({
        companyId: req.approval.companyId,
        title: title.trim().slice(0, 200),
        description: typeof payload.description === 'string' ? payload.description.slice(0, 2000) : '',
        targetDate,
        createdByUserId: req.user._id,
      });
    }

    req.approval.status = decision;
    req.approval.decisionNote = decisionNote.trim();
    req.approval.decidedByUserId = req.user._id;
    req.approval.decidedAt = new Date();
    await req.approval.save();

    await recordActivity({
      companyId: req.approval.companyId,
      actorId: req.user._id,
      actorName: req.user.name,
      action: `approval_${decision}`,
      entityType: 'Approval',
      entityId: req.approval._id,
      details: { type: req.approval.type, decisionNote: req.approval.decisionNote },
      ip: req.ip || '',
    });

    return res.status(200).json({
      approval: req.approval,
      result: result ? { _id: result._id, name: result.name, title: result.title } : null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to decide approval', details: err.message });
  }
});

module.exports = router;
