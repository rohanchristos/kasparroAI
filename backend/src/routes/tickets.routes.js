/**
 * Kasparro AI Backend — Ticket Routes
 *
 * GET    /api/tickets                     — list (paginated + filtered)
 * GET    /api/tickets/analytics/summary   — dashboard analytics
 * GET    /api/tickets/:id                 — single ticket
 * PATCH  /api/tickets/:id/approve         — approve + send email
 * PATCH  /api/tickets/:id/reject          — reject with reason
 * PATCH  /api/tickets/:id/regenerate      — regenerate AI draft
 */

const { Router } = require('express');
const { body, param, query } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
const ticketsController = require('../controllers/tickets.controller');

const router = Router();

// All ticket routes require authentication
router.use(verifyToken);

// ── Validation helpers ──────────────────────────────────────
const uuidParam = param('id').isUUID().withMessage('Invalid ticket ID format');

const validStatuses = [
  'pending',
  'auto_resolved',
  'approved',
  'rejected',
  'sent',
  'escalated',
];
const validCategories = [
  'refund',
  'tracking',
  'damaged_product',
  'wrong_item',
  'complaint',
  'faq',
  'policy',
  'other',
];
const validUrgencies = ['high', 'medium', 'low'];
const validSentiments = ['angry', 'frustrated', 'neutral', 'positive'];

// ── GET /analytics/summary ──────────────────────────────────
// IMPORTANT: Defined before /:id so "analytics" isn't captured as a UUID
router.get('/analytics/summary', ticketsController.getAnalyticsSummary);

// ── GET / ───────────────────────────────────────────────────
router.get(
  '/',
  [
    query('status')
      .optional()
      .isIn(validStatuses)
      .withMessage(`Status must be one of: ${validStatuses.join(', ')}`),
    query('category')
      .optional()
      .isIn(validCategories)
      .withMessage(`Category must be one of: ${validCategories.join(', ')}`),
    query('urgency')
      .optional()
      .isIn(validUrgencies)
      .withMessage(`Urgency must be one of: ${validUrgencies.join(', ')}`),
    query('sentiment')
      .optional()
      .isIn(validSentiments)
      .withMessage(`Sentiment must be one of: ${validSentiments.join(', ')}`),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  ticketsController.getTickets,
);

// ── GET /:id ────────────────────────────────────────────────
router.get('/:id', [uuidParam], ticketsController.getTicketById);

// ── PATCH /:id/approve ──────────────────────────────────────
router.patch(
  '/:id/approve',
  [
    uuidParam,
    body('edited_reply')
      .optional()
      .isString()
      .isLength({ min: 1, max: 10000 })
      .withMessage('Edited reply must be between 1 and 10000 characters'),
  ],
  ticketsController.approveTicket,
);

// ── PATCH /:id/reject ───────────────────────────────────────
router.patch(
  '/:id/reject',
  [
    uuidParam,
    body('reason')
      .notEmpty()
      .withMessage('Rejection reason is required')
      .isLength({ min: 5, max: 2000 })
      .withMessage('Reason must be between 5 and 2000 characters'),
  ],
  ticketsController.rejectTicket,
);

// ── PATCH /:id/regenerate ───────────────────────────────────
router.patch('/:id/regenerate', [uuidParam], ticketsController.regenerateDraft);

module.exports = router;
