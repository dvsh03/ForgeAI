const mongoose = require('mongoose');

const costEventSchema = new mongoose.Schema(
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
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HeartbeatRun',
      default: null,
      index: true,
    },
    adapter: {
      type: String,
      default: 'groq_llm',
    },
    model: {
      type: String,
      default: 'llama-3.3-70b-versatile',
    },
    inputTokens: {
      type: Number,
      required: true,
      min: 0,
    },
    outputTokens: {
      type: Number,
      required: true,
      min: 0,
    },
    costMicrocents: {
      type: Number,
      required: true,
      min: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

costEventSchema.index({ companyId: 1, createdAt: -1 });
costEventSchema.index({ agentId: 1, createdAt: -1 });

const CostEvent = mongoose.model('CostEvent', costEventSchema);
module.exports = CostEvent;
