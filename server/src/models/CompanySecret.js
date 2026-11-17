const mongoose = require('mongoose');

const companySecretSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
      index: true,
    },
    key: {
      type: String,
      required: [true, 'Secret key name is required'],
      trim: true,
      uppercase: true,
      maxlength: [100, 'Secret key name cannot exceed 100 characters'],
    },
    encryptedValue: {
      type: String,
      required: [true, 'Encrypted value is required'],
      select: false, // Strict zero-leak rule: Never selected in queries by default
    },
    iv: {
      type: String,
      required: [true, 'IV is required'],
      select: false, // 12-byte hex for AES-256-GCM
    },
    authTag: {
      type: String,
      required: [true, 'Auth tag is required'],
      select: false, // 16-byte hex
    },
    maskedPreview: {
      type: String,
      required: [true, 'Masked preview is required'],
      trim: true,
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Enforce unique secret key per company
companySecretSchema.index({ companyId: 1, key: 1 }, { unique: true });

// Always strip encryptedValue, iv, authTag on JSON serialization
companySecretSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.encryptedValue;
  delete obj.iv;
  delete obj.authTag;
  return obj;
};

const CompanySecret = mongoose.model('CompanySecret', companySecretSchema);
module.exports = CompanySecret;
