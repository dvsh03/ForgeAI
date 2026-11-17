const express = require('express');
const crypto = require('crypto');
const { authenticateJWT } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateJWT);

/**
 * @route   POST /api/uploads/sign
 * @desc    Generates signed Cloudinary upload credentials so client can upload directly to Cloudinary Free
 * @access  Private
 */
router.post('/sign', async (req, res) => {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = req.body.folder || 'paperclip_deliverables';

    if (!cloudName || !apiKey || !apiSecret) {
      // In development / demo mode without live Cloudinary keys configured yet,
      // return a deterministic mock signed payload so frontend can test cleanly without crashing
      const fallbackSignature = crypto
        .createHash('sha1')
        .update(`folder=${folder}&timestamp=${timestamp}dummy_secret`)
        .digest('hex');

      return res.status(200).json({
        mock: true,
        message: 'Cloudinary credentials not configured in server env; running in mock signature mode',
        cloudName: cloudName || 'demo-cloud',
        apiKey: apiKey || 'mock-api-key',
        timestamp,
        folder,
        signature: fallbackSignature,
      });
    }

    // Try requiring cloudinary SDK if installed
    let signature;
    try {
      const cloudinary = require('cloudinary').v2;
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      signature = cloudinary.utils.api_sign_request(
        { timestamp, folder },
        apiSecret
      );
    } catch {
      // Standard Cloudinary SHA1 signature formula: sorted params string + api_secret
      const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
      signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');
    }

    return res.status(200).json({
      cloudName,
      apiKey,
      timestamp,
      folder,
      signature,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to generate signed upload credentials',
      details: err.message,
    });
  }
});

module.exports = router;
