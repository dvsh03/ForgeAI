const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Agent name is required'],
      trim: true,
      maxlength: [100, 'Agent name cannot exceed 100 characters'],
    },
    title: {
      type: String,
      default: '',
      trim: true,
      maxlength: [100, 'Agent title cannot exceed 100 characters'],
    },
    role: {
      type: String,
      required: [true, 'Agent role is required'],
      trim: true,
      maxlength: [100, 'Agent role cannot exceed 100 characters'],
    },
    avatar: {
      type: String,
      default: '',
      trim: true,
    },
    reportsTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      default: null,
      index: true,
    },
    adapter: {
      type: String,
      enum: ['groq_llm', 'gemini_llm', 'http_webhook'],
      default: 'groq_llm',
    },
    model: {
      type: String,
      default: 'llama-3.3-70b-versatile',
      trim: true,
    },
    webhookUrl: {
      type: String,
      default: '',
      trim: true,
    },
    heartbeatCron: {
      type: String,
      default: '',
      trim: true,
    },
    autoHeartbeatEnabled: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['idle', 'running', 'paused', 'budget_stopped'],
      default: 'idle',
      index: true,
    },
    instructionsMarkdown: {
      type: String,
      default: '',
    },
    budgetMonthlyCents: {
      type: Number,
      default: 2500, // $25.00
      min: 0,
    },
    spentMonthlyMicrocents: {
      type: Number,
      default: 0, // Microcents: 1 cent = 10,000 microcents
      min: 0,
    },
    lastActiveAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast tenant filtering & org chart lookups
agentSchema.index({ companyId: 1, status: 1 });
agentSchema.index({ companyId: 1, reportsTo: 1 });

const Agent = mongoose.model('Agent', agentSchema);
module.exports = Agent;

