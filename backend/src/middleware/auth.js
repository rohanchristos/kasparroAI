/**
 * Kasparro AI Backend — JWT Authentication Middleware
 *
 * Verifies the Bearer token on every request and checks
 * the Redis blacklist for invalidated tokens (logout).
 */

const jwt = require('jsonwebtoken');
const redis = require('../config/redis');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME';
const BLACKLIST_PREFIX = 'bl:';

/**
 * Express middleware — verifies JWT and rejects blacklisted tokens.
 */
const verifyToken = async (req, res, next) => {
  try {
    // 1. Extract token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization header',
        statusCode: 401,
      });
    }

    const token = authHeader.split(' ')[1];

    // 2. Check Redis blacklist (logged-out tokens)
    const isBlacklisted = await redis.get(`${BLACKLIST_PREFIX}${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        error: 'TOKEN_REVOKED',
        message: 'Token has been revoked. Please log in again.',
        statusCode: 401,
      });
    }

    // 3. Verify signature + expiry
    const decoded = jwt.verify(token, JWT_SECRET);

    // 4. Attach user payload to request
    req.user = decoded;
    req.token = token;

    // 5. Attach LLM preference (Redis-first, DB fallback)
    try {
      const { getUserLLMPreference } = require('../services/redis.service');
      const cached = await getUserLLMPreference(decoded.id);
      if (cached) {
        req.user.llm_preference = cached;
      } else if (!decoded.llm_preference) {
        // Fallback: query DB if not in JWT payload or Redis
        const { query } = require('../config/database');
        const result = await query(
          'SELECT llm_preference FROM users WHERE id = $1',
          [decoded.id],
        );
        if (result.rows.length > 0) {
          req.user.llm_preference = result.rows[0].llm_preference;
          // Re-cache for next request
          const { setUserLLMPreference } = require('../services/redis.service');
          await setUserLLMPreference(decoded.id, result.rows[0].llm_preference);
        }
      }
    } catch (llmErr) {
      // Non-fatal — default from JWT payload or 'grok'
      req.user.llm_preference = decoded.llm_preference || 'grok';
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Token has expired. Please log in again.',
        statusCode: 401,
      });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid token.',
        statusCode: 401,
      });
    }
    next(err);
  }
};

/**
 * Blacklist a token in Redis until its natural expiry.
 *
 * @param {string} token  Raw JWT string
 */
const blacklistToken = async (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return;

    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redis.set(`${BLACKLIST_PREFIX}${token}`, '1', 'EX', ttl);
    }
  } catch (err) {
    console.error('Failed to blacklist token:', err.message);
  }
};

module.exports = { verifyToken, blacklistToken };
