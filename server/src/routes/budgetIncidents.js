const express = require('express');
const mongoose = require('mongoose');
const BudgetIncident = require('../models/BudgetIncident');
const Agent = require('../models/Agent');
const { authenticateJWT, requireCompanyMember } = require('../middleware/auth');
const { recordActivity } = require('../middleware/auditLog');

const router = express.Router();

const loadIncident = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.incidentId)) {
      return res.status(400).json({ error: 'Invalid budget incident ID format' });
    }
    const incident = await BudgetIncident.findById(req.params.incidentId);
    if (!incident) return res.status(404).json({ error: 'Budget incident not found' });
    req.incident = incident;
    req.companyId = incident.companyId;
    req.params.cid = incident.companyId.toString();
    return next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load budget incident', details: err.message });
  }
};

router.use(authenticateJWT);
router.use('/:incidentId', loadIncident, requireCompanyMember);

router.post('/:incidentId/resolve', async (req, res) => {
  try {
    const { newBudgetMonthlyCents, resolutionNote = '' } = req.body;
    if (!Number.isFinite(newBudgetMonthlyCents) || newBudgetMonthlyCents < 0) {
      return res.status(400).json({ error: 'New monthly budget must be a non-negative number of cents' });
    }
    if (typeof resolutionNote !== 'string' || resolutionNote.length > 2000) {
      return res.status(400).json({ error: 'Resolution note must be a string of at most 2000 characters' });
    }
    if (req.incident.status !== 'open') {
      return res.status(409).json({ error: 'Budget incident has already been resolved' });
    }
    if (newBudgetMonthlyCents * 10000 <= req.incident.spentMonthlyMicrocents) {
      return res.status(400).json({ error: "New budget must exceed the agent's current monthly spend" });
    }

    const agent = await Agent.findOne({
      _id: req.incident.agentId,
      companyId: req.incident.companyId,
    });
    if (!agent) return res.status(404).json({ error: 'Budget incident agent not found' });

    agent.budgetMonthlyCents = newBudgetMonthlyCents;
    if (agent.status === 'budget_stopped') agent.status = 'idle';
    await agent.save();

    req.incident.budgetMonthlyCents = newBudgetMonthlyCents;
    req.incident.status = 'resolved';
    req.incident.resolutionNote = resolutionNote.trim();
    req.incident.resolvedByUserId = req.user._id;
    req.incident.resolvedAt = new Date();
    await req.incident.save();

    await recordActivity({
      companyId: req.incident.companyId,
      actorId: req.user._id,
      actorName: req.user.name,
      action: 'resolve_budget_incident',
      entityType: 'BudgetIncident',
      entityId: req.incident._id,
      details: { agentId: agent._id, newBudgetMonthlyCents, resolutionNote: req.incident.resolutionNote },
      ip: req.ip || '',
    });

    return res.status(200).json({ incident: req.incident, agent });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve budget incident', details: err.message });
  }
});

module.exports = router;
