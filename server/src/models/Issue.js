const mongoose = require('mongoose');

const acceptanceCriterionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    completed: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const deliverableSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['url', 'markdown', 'file'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    contentOrUrl: {
      type: String,
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const issueSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
      index: true,
    },
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Goal',
      default: null,
      index: true,
    },
    issueNumber: {
      type: Number,
      required: [true, 'Issue number is required'],
      min: 1,
    },
    issueKey: {
      type: String,
      required: [true, 'Issue key is required'],
      trim: true,
      uppercase: true,
    },
    title: {
      type: String,
      required: [true, 'Issue title is required'],
      trim: true,
      maxlength: [250, 'Title cannot exceed 250 characters'],
    },
    description: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done'],
      default: 'backlog',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    assigneeAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      default: null,
      index: true,
    },
    creatorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    parentIssueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Issue',
      default: null,
      index: true,
    },
    acceptanceCriteria: {
      type: [acceptanceCriterionSchema],
      default: [],
    },
    deliverables: {
      type: [deliverableSchema],
      default: [],
    },
    lockedByRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HeartbeatRun',
      default: null,
      index: true,
    },
    lockExpiresAt: {
      type: Date,
      default: null,
    },
    lastHydratedCommentCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
issueSchema.index({ companyId: 1, issueKey: 1 }, { unique: true });
issueSchema.index({ companyId: 1, status: 1 });
issueSchema.index({ companyId: 1, issueNumber: 1 });
issueSchema.index({ companyId: 1, assigneeAgentId: 1 });
issueSchema.index({ companyId: 1, goalId: 1 });
issueSchema.index({ lockedByRunId: 1, lockExpiresAt: 1 });

const Issue = mongoose.model('Issue', issueSchema);
module.exports = Issue;
