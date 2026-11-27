const mongoose = require('mongoose');

const runLogSchema = new mongoose.Schema(
  {
    ts: {
      type: Date,
      default: Date.now,
    },
    level: {
      type: String,
      enum: ['info', 'warn', 'error', 'system', 'thought', 'tool', 'budget'],
      default: 'info',
    },
    message: {
      type: String,
      required: true,
      maxlength: [1000, 'Log message capped at 1000 characters'],
    },
  },
  { _id: false }
);

const heartbeatRunSchema = new mongoose.Schema(
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
    targetIssueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Issue',
      default: null,
    },
    wakeupQueueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WakeupQueue',
      default: null,
    },
    triggerType: {
      type: String,
      enum: ['manual', 'assignment', 'mention', 'cron', 'schedule', 'approval_resolved', 'dependency_resolved'],
      default: 'manual',
    },
    status: {
      type: String,
      enum: ['running', 'completed', 'stalled', 'failed', 'budget_stopped'],
      default: 'running',
      index: true,
    },
    lockExpiresAt: {
      type: Date,
      default: null,
    },
    stepCount: {
      type: Number,
      default: 0,
      max: [5, 'Capped at 5 tool steps per heartbeat'],
    },
    logs: {
      type: [runLogSchema],
      default: [],
      validate: [
        (val) => val.length <= 50,
        'Logs array is capped at 50 entries per run',
      ],
    },
    inputTokens: {
      type: Number,
      default: 0,
      min: 0,
    },
    outputTokens: {
      type: Number,
      default: 0,
      min: 0,
    },
    costMicrocents: {
      type: Number,
      default: 0,
      min: 0,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

heartbeatRunSchema.virtual('issueId').get(function () {
  return this.targetIssueId;
});

heartbeatRunSchema.virtual('finishedAt').get(function () {
  return this.endedAt;
});

// Indexes
heartbeatRunSchema.index({ companyId: 1, status: 1 });
heartbeatRunSchema.index({ agentId: 1, status: 1 });
heartbeatRunSchema.index({ status: 1, lockExpiresAt: 1 });

const HeartbeatRun = mongoose.model('HeartbeatRun', heartbeatRunSchema);
module.exports = HeartbeatRun;

