const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const authRoutes = require('./routes/auth');
const companyRoutes = require('./routes/companies');
const secretRoutes = require('./routes/secrets');
const uploadRoutes = require('./routes/uploads');
const agentRoutes = require('./routes/agents');
const approvalRoutes = require('./routes/approvals');
const budgetIncidentRoutes = require('./routes/budgetIncidents');
const { auditLogMiddleware } = require('./middleware/auditLog');

const app = express();

// Security HTTP headers
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true,
  })
);

// Body parsing with safe size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging (exclude in test runs)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Global Activity Audit Log middleware for mutating operations
app.use(auditLogMiddleware);

// Health check endpoint (used by Cron-job.org and keep-alive monitors)
app.get('/api/health', (req, res) => {
  return res.status(200).json({
    status: 'ok',
    service: 'paperclip-mern-backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/companies/:cid/secrets', secretRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/budget-incidents', budgetIncidentRoutes);
app.use('/api/uploads', uploadRoutes);

// Catch 404 for undefined routes
app.use((req, res) => {
  return res.status(404).json({ error: `Cannot ${req.method} ${req.originalUrl}` });
});

// Centralized Error Handling Middleware
// Security rule: Never leak raw API keys, internal stack traces, or credentials in production
app.use((err, req, res, next) => {
  console.error(`[Express Error] ${err.name}: ${err.message}`);

  const statusCode = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  // Sanitize error message to ensure no API keys or credentials leak
  let safeMessage = err.message || 'An unexpected internal server error occurred';
  if (/gsk_|AIzaSy|sk-|bearer/i.test(safeMessage)) {
    safeMessage = 'A credential error occurred. Details redacted for security.';
  }

  return res.status(statusCode).json({
    error: safeMessage,
    ...(isProd ? {} : { stack: err.stack }),
  });
});

module.exports = app;

