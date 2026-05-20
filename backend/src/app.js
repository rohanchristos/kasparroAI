/**
 * Kasparro AI Backend — Application Entry Point
 *
 * Express server with PostgreSQL, Redis, JWT auth, and
 * reverse-proxy integration to the FastAPI AI agent.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const { pool } = require('./config/database');
const redis = require('./config/redis');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');
const authRoutes = require('./routes/auth.routes');
const ticketRoutes = require('./routes/tickets.routes');
const auditRoutes = require('./routes/audit.routes');

const app = express();
app.set('trust proxy', 1); // Trust first proxy (NGINX)
const PORT = parseInt(process.env.PORT, 10) || 5000;

// ── Security ────────────────────────────────────────────────
app.use(helmet());

// ── CORS ────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Logging ─────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Body parsing ────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Compression ─────────────────────────────────────────────
app.use(compression());

// ── Rate limiting (global) ──────────────────────────────────
app.use(generalLimiter);

// ── Health check ────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/audit', auditRoutes);

// ── 404 + Error handling ────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start server ────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀  Kasparro backend running on port ${PORT}`);
  console.log(`    Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`    Health      : http://localhost:${PORT}/health\n`);
});

// ── Graceful shutdown ───────────────────────────────────────
const shutdown = async (signal) => {
  console.log(`\n⏳  ${signal} received — shutting down gracefully …`);

  server.close(async () => {
    try {
      await pool.end();
      console.log('   ✔ PostgreSQL pool closed');
    } catch (err) {
      console.error('   ✖ Error closing PostgreSQL pool:', err.message);
    }

    try {
      await redis.quit();
      console.log('   ✔ Redis connection closed');
    } catch (err) {
      console.error('   ✖ Error closing Redis:', err.message);
    }

    console.log('   ✔ Server stopped\n');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('   ✖ Forced shutdown (10s timeout)');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
