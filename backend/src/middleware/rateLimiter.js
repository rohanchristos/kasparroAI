/**
 * Kasparro AI Backend — Rate Limiter Middleware
 */

const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter — 100 requests per 15 minutes.
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again in a few minutes.',
    statusCode: 429,
  },
});

/**
 * Auth route rate limiter — 10 requests per 15 minutes.
 * Prevents brute-force login attempts.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts. Please try again later.',
    statusCode: 429,
  },
});

module.exports = { generalLimiter, authLimiter };
