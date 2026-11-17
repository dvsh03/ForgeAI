/**
 * Safely escapes a value for CSV output following RFC 4180 standard.
 */
const escapeCSV = (value) => {
  if (value === null || value === undefined) return '""';
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // If value contains comma, quotes, or newlines, quote it and escape internal quotes
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return `"${stringValue}"`;
};

/**
 * Converts an array of ActivityLog documents into a standard CSV string.
 */
const generateAuditCSV = (logs) => {
  const headers = [
    'Timestamp',
    'ActorType',
    'ActorName',
    'Action',
    'EntityType',
    'EntityId',
    'Details',
    'IP',
  ];

  const rows = logs.map((log) => [
    escapeCSV(log.createdAt ? new Date(log.createdAt).toISOString() : ''),
    escapeCSV(log.actorType || ''),
    escapeCSV(log.actorName || ''),
    escapeCSV(log.action || ''),
    escapeCSV(log.entityType || ''),
    escapeCSV(log.entityId ? log.entityId.toString() : ''),
    escapeCSV(log.details || {}),
    escapeCSV(log.ip || ''),
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
};

module.exports = {
  escapeCSV,
  generateAuditCSV,
};
