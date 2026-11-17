const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      maxlength: [100, 'Company name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    issuePrefix: {
      type: String,
      required: [true, 'Issue prefix is required'],
      trim: true,
      uppercase: true,
      minlength: [2, 'Issue prefix must be at least 2 characters'],
      maxlength: [6, 'Issue prefix cannot exceed 6 characters'],
      match: [/^[A-Z0-9]+$/, 'Issue prefix must contain only alphanumeric uppercase characters'],
    },
    issueCounter: {
      type: Number,
      default: 0,
      min: 0,
    },
    budgetMonthlyCents: {
      type: Number,
      default: 10000, // $100.00
      min: 0,
    },
    spentMonthlyMicrocents: {
      type: Number,
      default: 0, // Microcents: 1 cent = 10,000 microcents
      min: 0,
    },
    requireHireApproval: {
      type: Boolean,
      default: false,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner user ID is required'],
    },
    members: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        role: {
          type: String,
          enum: ['owner', 'admin', 'member'],
          default: 'member',
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
companySchema.index({ ownerUserId: 1 });
companySchema.index({ 'members.userId': 1 });

const Company = mongoose.model('Company', companySchema);
module.exports = Company;
