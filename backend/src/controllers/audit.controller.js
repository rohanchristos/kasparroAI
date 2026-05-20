/**
 * Kasparro AI Backend — Audit Controller
 *
 * Handles audit log retrieval and CSV export.
 */

const ticketsService = require('../services/tickets.service');

/**
 * GET /api/audit
 */
const getAuditLogs = async (req, res, next) => {
  try {
    const { action, ticket_id, start_date, end_date, page = 1, limit = 25 } = req.query;

    const result = await ticketsService.getAuditLogs({
      action,
      ticketId: ticket_id,
      startDate: start_date,
      endDate: end_date,
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10) || 25, 100),
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/audit/export
 * Returns CSV of audit logs.
 */
const exportAuditLogs = async (req, res, next) => {
  try {
    const { action, ticket_id, start_date, end_date } = req.query;

    const result = await ticketsService.getAuditLogs({
      action,
      ticketId: ticket_id,
      startDate: start_date,
      endDate: end_date,
      page: 1,
      limit: 10000,
    });

    const header = 'Time,Ticket Subject,Customer,Action,Performed By,Notes\n';
    const rows = result.logs.map((log) => {
      const time = new Date(log.created_at).toISOString();
      const subject = (log.ticket_subject || '').replace(/,/g, ';');
      const customer = (log.customer_email || '').replace(/,/g, ';');
      const action = log.action || '';
      const performer = (log.performed_by_name || 'System').replace(/,/g, ';');
      const notes = (log.notes || '').replace(/,/g, ';').replace(/\n/g, ' ');
      return `${time},"${subject}","${customer}",${action},"${performer}","${notes}"`;
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=kasparro_audit_${Date.now()}.csv`);
    res.send(header + rows);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/health
 * Returns service health status.
 */
const getHealth = async (_req, res) => {
  const { query: dbQuery } = require('../config/database');
  const redis = require('../config/redis');
  const agentService = require('../services/agent.service');

  const checks = {};

  // PostgreSQL
  try {
    await dbQuery('SELECT 1');
    checks.postgres = { status: 'connected', latency: 'ok' };
  } catch {
    checks.postgres = { status: 'disconnected' };
  }

  // Redis
  try {
    await redis.ping();
    checks.redis = { status: 'connected' };
  } catch (err) {
    checks.redis = { status: 'disconnected', error: err.message };
  }

  // FastAPI
  try {
    const axios = require('axios');
    const resp = await axios.get(`${process.env.AGENT_API_URL || 'http://fastapi:8000'}/health`, {
      timeout: 3000,
    });
    checks.fastapi = { status: resp.status === 200 ? 'connected' : 'degraded' };
  } catch (err) {
    checks.fastapi = { status: 'disconnected', error: err.message };
  }

  // Node.js is obviously running
  checks.nodejs = { status: 'connected', uptime: Math.floor(process.uptime()) + 's' };

  res.json({
    status: Object.values(checks).every((c) => c.status === 'connected') ? 'healthy' : 'degraded',
    services: checks,
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  getAuditLogs,
  exportAuditLogs,
  getHealth,
};
