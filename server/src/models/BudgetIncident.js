const mongoose = require('mongoose');

const budgetIncidentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
      index: true,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      required: [true, 'Agent ID is required'],
      index: true,
    },
    threshold: {
      type: Number,
      default: 100, // 100% hard stop
    },
    spentMonthlyMicrocents: {
      type: Number,
      required: true,
      min: 0,
    },
    budgetMonthlyCents: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['open', 'resolved'],
      default: 'open',
      index: true,
    },
    resolutionNote: {
      type: String,
      default: '',
      trim: true,
    },
    resolvedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

budgetIncidentSchema.index({ companyId: 1, status: 1 });
budgetIncidentSchema.index({ agentId: 1, status: 1 });

const BudgetIncident = mongoose.model('BudgetIncident', budgetIncidentSchema);
module.exports = BudgetIncident;
