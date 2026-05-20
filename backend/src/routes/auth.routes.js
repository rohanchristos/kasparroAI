/**
 * Kasparro AI Backend — Auth Routes
 *
 * POST /api/auth/login
 * POST /api/auth/logout
 * GET  /api/auth/me
 * PATCH /api/auth/llm-preference
 */

const { Router } = require('express');
const { body } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/auth.controller');

const router = Router();

// ── POST /login ─────────────────────────────────────────────
router.post(
  '/login',
  authLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Valid email is required')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
  ],
  authController.login,
);

// ── POST /logout ────────────────────────────────────────────
router.post('/logout', verifyToken, authController.logout);

// ── GET /me ─────────────────────────────────────────────────
router.get('/me', verifyToken, authController.getMe);

// ── PATCH /llm-preference ───────────────────────────────────
router.patch(
  '/llm-preference',
  verifyToken,
  [
    body('provider')
      .isIn(['grok', 'openai', 'openrouter'])
      .withMessage('Provider must be "grok", "openai", or "openrouter"'),
  ],
  authController.updateLlmPreference,
);

module.exports = router;
