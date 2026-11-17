const mongoose = require('mongoose');

const agentConfigRevisionSchema = new mongoose.Schema(
  {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      required: [true, 'Agent ID is required'],
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
    },
    revisionNumber: {
      type: Number,
      required: [true, 'Revision number is required'],
    },
    changedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    instructionsMarkdown: {
      type: String,
      default: '',
    },
    adapter: {
      type: String,
      default: 'groq_llm',
    },
    model: {
      type: String,
      default: 'llama-3.3-70b-versatile',
    },
    budgetMonthlyCents: {
      type: Number,
      default: 2500,
    },
    snapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// Fast lookup of latest revisions for an agent
agentConfigRevisionSchema.index({ agentId: 1, revisionNumber: -1 });
agentConfigRevisionSchema.index({ companyId: 1 });

const AgentConfigRevision = mongoose.model('AgentConfigRevision', agentConfigRevisionSchema);
module.exports = AgentConfigRevision;
