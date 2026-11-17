const mongoose = require('mongoose');

const wakeupQueueSchema = new mongoose.Schema(
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
    triggerType: {
      type: String,
      enum: ['manual', 'assignment', 'mention', 'schedule', 'dependency_resolved'],
      required: [true, 'Trigger type is required'],
    },
    targetIssueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Issue',
      default: null,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'cancelled', 'failed'],
      default: 'queued',
      index: true,
    },
    coalescedCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: false,
  }
);

// TTL Index: automatically auto-cleanup wakeups after 7 days (604800 seconds)
wakeupQueueSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

// Compound index for coalescing and worker queue fetching
wakeupQueueSchema.index({ companyId: 1, agentId: 1, status: 1 });
wakeupQueueSchema.index({ companyId: 1, status: 1, createdAt: 1 });

const WakeupQueue = mongoose.model('WakeupQueue', wakeupQueueSchema);
module.exports = WakeupQueue;
