/**
 * Kasparro AI Backend — Audit Routes
 *
 * GET  /api/audit          — paginated audit logs
 * GET  /api/audit/export   — CSV export
 * GET  /api/health         — service health check
 */

const { Router } = require('express');
const { query } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
const auditController = require('../controllers/audit.controller');

const router = Router();

// Health endpoint — no auth required
router.get('/health', auditController.getHealth);

// All audit routes require auth
router.use(verifyToken);

router.get(
  '/',
  [
    query('action').optional().isString(),
    query('ticket_id').optional().isUUID(),
    query('start_date').optional().isISO8601(),
    query('end_date').optional().isISO8601(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  auditController.getAuditLogs,
);

router.get('/export', auditController.exportAuditLogs);

module.exports = router;
