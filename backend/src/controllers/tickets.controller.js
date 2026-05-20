/**
 * Kasparro AI Backend — Tickets Controller
 *
 * Handles HTTP request/response for ticket endpoints.
 * Delegates business logic to tickets.service.js.
 */

const { validationResult } = require('express-validator');
const ticketsService = require('../services/tickets.service');

/**
 * GET /api/tickets
 */
const getTickets = async (req, res, next) => {
  try {
    const {
      status,
      category,
      urgency,
      sentiment,
      page = 1,
      limit = 20,
    } = req.query;

    const result = await ticketsService.getTickets({
      status,
      category,
      urgency,
      sentiment,
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10) || 20, 100), // cap at 100
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tickets/analytics/summary
 *
 * NOTE: This route is defined BEFORE /:id so Express doesn't
 * treat "analytics" as a ticket ID.
 */
const getAnalyticsSummary = async (_req, res, next) => {
  try {
    const summary = await ticketsService.getAnalyticsSummary();
    res.json(summary);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tickets/:id
 */
const getTicketById = async (req, res, next) => {
  try {
    const ticket = await ticketsService.getTicketById(req.params.id);
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/tickets/:id/approve
 */
const approveTicket = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        statusCode: 400,
        details: errors.array(),
      });
    }

    const { edited_reply } = req.body;
    const ticket = await ticketsService.approveTicket(
      req.params.id,
      req.user.id,
      edited_reply,
      req.token,
      req.user.llm_preference,
    );

    res.json({
      message: 'Ticket approved and reply sent',
      ticket,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/tickets/:id/reject
 */
const rejectTicket = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        statusCode: 400,
        details: errors.array(),
      });
    }

    const { reason } = req.body;
    const ticket = await ticketsService.rejectTicket(
      req.params.id,
      req.user.id,
      reason,
    );

    res.json({
      message: 'Ticket rejected',
      ticket,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/tickets/:id/regenerate
 */
const regenerateDraft = async (req, res, next) => {
  try {
    const updatedTicket = await ticketsService.regenerateDraft(
      req.params.id,
      req.token,
      req.user.llm_preference,
    );

    res.json({
      message: 'AI draft regenerated',
      ticket: updatedTicket,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getTickets,
  getTicketById,
  approveTicket,
  rejectTicket,
  regenerateDraft,
  getAnalyticsSummary,
};
