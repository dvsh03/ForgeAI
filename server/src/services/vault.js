const crypto = require('crypto');
const CompanySecret = require('../models/CompanySecret');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

/**
 * Derives a reliable 32-byte Buffer from the environment ENCRYPTION_KEY.
 * Accepts 64-char hex, 32-char utf8, or hashes arbitrary length key with sha256.
 */
const getKeyBuffer = () => {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY environment variable is strictly required in production');
    }
    // Dev fallback key: 32 bytes
    return crypto.createHash('sha256').update('paperclip_default_dev_encryption_key_32b').digest();
  }

  // If 64 hex characters (32 bytes in hex)
  if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }

  // If already exactly 32 bytes in utf8
  if (Buffer.byteLength(envKey, 'utf8') === 32) {
    return Buffer.from(envKey, 'utf8');
  }

  // Hash arbitrary length strings to 32 bytes
  return crypto.createHash('sha256').update(envKey).digest();
};

/**
 * Generates masked preview string (e.g. gsk_••••9a2f)
 */
const generateMaskedPreview = (plainText) => {
  if (!plainText || typeof plainText !== 'string') return '••••';
  if (plainText.length <= 8) {
    return '••••••••';
  }
  const prefix = plainText.slice(0, 4);
  const suffix = plainText.slice(-4);
  return `${prefix}••••${suffix}`;
};

/**
 * Encrypts a plaintext secret string using AES-256-GCM.
 */
const encryptSecret = (plainText) => {
  if (typeof plainText !== 'string' || !plainText.trim()) {
    throw new Error('Secret plaintext must be a non-empty string');
  }

  const key = getKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encryptedValue: encrypted,
    iv: iv.toString('hex'),
    authTag,
    maskedPreview: generateMaskedPreview(plainText),
  };
};

/**
 * Decrypts an AES-256-GCM encrypted secret.
 */
const decryptSecret = (encryptedValue, ivHex, authTagHex) => {
  if (!encryptedValue || !ivHex || !authTagHex) {
    throw new Error('encryptedValue, iv, and authTag are all required for decryption');
  }

  const key = getKeyBuffer();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedValue, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * Stores or updates a secret in the database for a company.
 */
const storeSecret = async (companyId, keyName, plainText, userId = null) => {
  const normalizedKey = keyName.trim().toUpperCase();
  const { encryptedValue, iv, authTag, maskedPreview } = encryptSecret(plainText);

  const secretDoc = await CompanySecret.findOneAndUpdate(
    { companyId, key: normalizedKey },
    {
      $set: {
        encryptedValue,
        iv,
        authTag,
        maskedPreview,
        createdByUserId: userId,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  return {
    _id: secretDoc._id,
    companyId: secretDoc.companyId,
    key: secretDoc.key,
    maskedPreview: secretDoc.maskedPreview,
    createdAt: secretDoc.createdAt,
    updatedAt: secretDoc.updatedAt,
  };
};

/**
 * Returns all secrets for a company with masked previews.
 * Never includes raw plaintext or encrypted payloads.
 */
const getMaskedSecrets = async (companyId) => {
  return CompanySecret.find({ companyId })
    .select('_id companyId key maskedPreview createdAt updatedAt')
    .sort({ key: 1 })
    .lean();
};

/**
 * Fetches and decrypts a specific secret in-memory for backend AI adapters.
 * Never expose the result of this function in an API response or log!
 */
const getDecryptedSecret = async (companyId, keyName) => {
  const normalizedKey = keyName.trim().toUpperCase();
  const secretDoc = await CompanySecret.findOne({ companyId, key: normalizedKey })
    .select('+encryptedValue +iv +authTag')
    .lean();

  if (!secretDoc) {
    return null;
  }

  return decryptSecret(secretDoc.encryptedValue, secretDoc.iv, secretDoc.authTag);
};

/**
 * Deletes a secret from the company vault.
 */
const deleteSecret = async (companyId, keyName) => {
  const normalizedKey = keyName.trim().toUpperCase();
  return CompanySecret.findOneAndDelete({ companyId, key: normalizedKey });
};

/**
 * Recursively scrubs secret/sensitive keys from an object before export or logging.
 * Preserves Dates, ObjectIds, Buffers, and primitives.
 */
const scrubSensitiveData = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;

  if (obj instanceof Date) {
    return obj;
  }

  if (Buffer.isBuffer(obj)) {
    return obj;
  }

  if (obj.constructor && obj.constructor.name === 'ObjectId') {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(scrubSensitiveData);
  }

  const sensitiveKeyPatterns = [/password/i, /secret/i, /encrypted/i, /authtag/i, /^iv$/i, /token/i, /api_?key/i];
  const scrubbed = {};

  for (const [k, v] of Object.entries(obj)) {
    const isSensitive = sensitiveKeyPatterns.some((pattern) => pattern.test(k));
    if (isSensitive) {
      scrubbed[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !(v instanceof Date) && (v.constructor?.name !== 'ObjectId')) {
      scrubbed[k] = scrubSensitiveData(v);
    } else {
      scrubbed[k] = v;
    }
  }

  return scrubbed;
};

module.exports = {
  encryptSecret,
  decryptSecret,
  storeSecret,
  getMaskedSecrets,
  getDecryptedSecret,
  deleteSecret,
  generateMaskedPreview,
  scrubSensitiveData,
};
