/**
 * Kasparro AI Backend — Auth Controller
 *
 * Handles HTTP request/response for authentication endpoints.
 * Delegates business logic to auth.service.js.
 */

const { validationResult } = require('express-validator');
const authService = require('../services/auth.service');
const { blacklistToken } = require('../middleware/auth');

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        statusCode: 400,
        details: errors.array(),
      });
    }

    const { email, password } = req.body;
    const result = await authService.login(email, password);

    res.json({
      message: 'Login successful',
      token: result.token,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  try {
    // Blacklist the token in Redis
    await blacklistToken(req.token);

    // Delete session
    await authService.logout(req.user.id);

    res.json({
      message: 'Logged out successfully',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user.id);

    res.json({ user });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/auth/llm-preference
 */
const updateLlmPreference = async (req, res, next) => {
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

    const { provider } = req.body;
    const user = await authService.updateLlmPreference(req.user.id, provider);

    res.json({
      message: 'LLM preference updated',
      user,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, logout, getMe, updateLlmPreference };
