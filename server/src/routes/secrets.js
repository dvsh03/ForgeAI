const express = require('express');
const { authenticateJWT, requireCompanyMember } = require('../middleware/auth');
const vaultService = require('../services/vault');
const { recordActivity } = require('../middleware/auditLog');

const router = express.Router({ mergeParams: true });

// All secret routes require valid JWT and company workspace membership
router.use(authenticateJWT);
router.use(requireCompanyMember);

/**
 * @route   GET /api/companies/:cid/secrets
 * @desc    List all stored API keys / secrets with masked previews (e.g. gsk_••••9a2f)
 * @access  Private (Company Member)
 */
router.get('/', async (req, res) => {
  try {
    const secrets = await vaultService.getMaskedSecrets(req.company._id);
    return res.status(200).json({ secrets });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to retrieve company vault secrets',
      details: err.message,
    });
  }
});

/**
 * @route   POST /api/companies/:cid/secrets
 * @desc    Securely encrypt (AES-256-GCM) and store or update an API key in the vault
 * @access  Private (Company Member)
 */
router.post('/', async (req, res) => {
  try {
    const { key, value } = req.body;

    if (!key || typeof key !== 'string' || !key.trim()) {
      return res.status(400).json({ error: 'Secret key name is required (e.g. GROQ_API_KEY)' });
    }

    if (!value || typeof value !== 'string' || !value.trim()) {
      return res.status(400).json({ error: 'Secret value is required' });
    }

    const normalizedKey = key.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,64}$/.test(normalizedKey)) {
      return res.status(400).json({
        error: 'Key must consist of uppercase alphanumeric characters and underscores (2-64 chars)',
      });
    }

    const storedSecret = await vaultService.storeSecret(
      req.company._id,
      normalizedKey,
      value.trim(),
      req.user._id
    );

    // Audit log without leaking value
    await recordActivity({
      companyId: req.company._id,
      actorType: 'user',
      actorId: req.user._id,
      actorName: req.user.name,
      action: 'store_vault_secret',
      entityType: 'CompanySecret',
      entityId: storedSecret._id,
      details: {
        key: normalizedKey,
        maskedPreview: storedSecret.maskedPreview,
      },
      ip: req.ip || '',
    });

    return res.status(201).json({
      message: `Secret ${normalizedKey} securely stored in AES-256-GCM vault`,
      secret: storedSecret,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to encrypt and store secret in vault',
      details: err.message,
    });
  }
});

/**
 * @route   DELETE /api/companies/:cid/secrets/:key
 * @desc    Remove an API key from the company vault
 * @access  Private (Company Member)
 */
router.delete('/:key', async (req, res) => {
  try {
    const keyName = req.params.key.trim().toUpperCase();
    const deleted = await vaultService.deleteSecret(req.company._id, keyName);

    if (!deleted) {
      return res.status(404).json({ error: `Secret ${keyName} not found in vault` });
    }

    await recordActivity({
      companyId: req.company._id,
      actorType: 'user',
      actorId: req.user._id,
      actorName: req.user.name,
      action: 'delete_vault_secret',
      entityType: 'CompanySecret',
      entityId: deleted._id,
      details: { key: keyName },
      ip: req.ip || '',
    });

    return res.status(200).json({
      message: `Secret ${keyName} successfully deleted from vault`,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to delete secret from vault',
      details: err.message,
    });
  }
});

module.exports = router;

