const mongoose = require('mongoose');

const approvalSchema = new mongoose.Schema(
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
    requestedByAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      default: null,
    },
    type: {
      type: String,
      enum: ['hire_agent', 'strategy_plan', 'budget_override'],
      required: [true, 'Approval type is required'],
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Approval payload is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    decisionNote: {
      type: String,
      default: '',
      trim: true,
    },
    decidedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

approvalSchema.pre('validate', function (next) {
  if (!this.agentId && this.requestedByAgentId) {
    this.agentId = this.requestedByAgentId;
  }
  if (!this.requestedByAgentId && this.agentId) {
    this.requestedByAgentId = this.agentId;
  }
  next();
});

approvalSchema.index({ companyId: 1, status: 1 });

const Approval = mongoose.model('Approval', approvalSchema);
module.exports = Approval;

