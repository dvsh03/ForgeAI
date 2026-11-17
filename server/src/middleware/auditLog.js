const ActivityLog = require('../models/ActivityLog');
const { scrubSensitiveData } = require('../services/vault');

/**
 * Middleware that automatically records successful mutating operations into ActivityLog.
 */
const auditLogMiddleware = (req, res, next) => {
  const mutatingMethods = ['POST', 'PATCH', 'PUT', 'DELETE'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  // Hook into response completion
  res.on('finish', async () => {
    // Only log successful operations (2xx / 3xx)
    if (res.statusCode >= 400) return;

    try {
      const companyId =
        req.company?._id ||
        req.params.cid ||
        req.params.companyId ||
        req.headers['x-company-id'] ||
        req.body?.companyId;

      if (!companyId) return;

      const actorType = req.user ? 'user' : 'system';
      const actorId = req.user ? req.user._id : null;
      const actorName = req.user ? req.user.name : 'System';

      const action = `${req.method.toLowerCase()}_${req.baseUrl?.replace('/api/', '') || req.path.split('/')[2] || 'resource'}`;
      const entityType = req.baseUrl?.split('/')[2] || 'Resource';

      const sanitizedBody = scrubSensitiveData(req.body);

      await ActivityLog.create({
        companyId,
        actorType,
        actorId,
        actorName,
        action,
        entityType,
        entityId: req.params.id || req.params.cid || null,
        details: {
          path: req.originalUrl,
          method: req.method,
          statusCode: res.statusCode,
          bodySummary: sanitizedBody,
        },
        ip: req.ip || req.headers['x-forwarded-for'] || '',
      });
    } catch (err) {
      // Never crash the request if audit logging fails
      console.error('[AuditLog] Failed to record activity:', err.message);
    }
  });

  next();
};

/**
 * Manual programmatic helper to record explicit domain events in ActivityLog.
 */
const recordActivity = async ({
  companyId,
  actorType = 'user',
  actorId = null,
  actorName = 'System',
  action,
  entityType,
  entityId = null,
  details = {},
  ip = '',
}) => {
  try {
    const cleanDetails = scrubSensitiveData(details);
    return await ActivityLog.create({
      companyId,
      actorType,
      actorId,
      actorName,
      action,
      entityType,
      entityId,
      details: cleanDetails,
      ip,
    });
  } catch (err) {
    console.error('[AuditLog] Programmatic log error:', err.message);
    return null;
  }
};

module.exports = {
  auditLogMiddleware,
  recordActivity,
};
