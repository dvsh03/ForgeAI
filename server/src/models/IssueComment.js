const mongoose = require('mongoose');

const issueCommentSchema = new mongoose.Schema(
  {
    issueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Issue',
      required: [true, 'Issue ID is required'],
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
    },
    authorType: {
      type: String,
      enum: ['user', 'agent', 'system'],
      required: [true, 'Author type is required'],
    },
    authorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    authorAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      default: null,
    },
    content: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
    },
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// Crucial index for Delta-Only Comment Hydration (.skip(issue.lastHydratedCommentCount))
issueCommentSchema.index({ issueId: 1, createdAt: 1 });
issueCommentSchema.index({ companyId: 1 });

const IssueComment = mongoose.model('IssueComment', issueCommentSchema);
module.exports = IssueComment;
