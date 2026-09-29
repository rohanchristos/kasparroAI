/**
 * Kasparro AI Backend — Auth Service
 *
 * Business logic for authentication: login, session, profile.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { setSession, getSession, deleteSession, setUserLLMPreference } = require('./redis.service');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Authenticate user by email + password.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ token: string, user: object }>}
 */
const login = async (email, password) => {
  // 1. Find user
  const result = await query(
    `SELECT id, email, password_hash, full_name, role, llm_preference
     FROM users
     WHERE email = $1`,
    [email.toLowerCase().trim()],
  );

  if (result.rows.length === 0) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const user = result.rows[0];

  // 2. Verify password
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  // 3. Build JWT payload (no sensitive data)
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    llm_preference: user.llm_preference,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  // 4. Store session + LLM preference in Redis (24h)
  await setSession(user.id, payload, 86_400);
  await setUserLLMPreference(user.id, user.llm_preference);

  // 5. Return token + user (strip password_hash)
  const { password_hash, ...safeUser } = user;
  return { token, user: safeUser };
};

/**
 * Get current user — checks Redis session first, falls back to DB.
 *
 * @param {string} userId
 * @returns {Promise<object>}
 */
const getCurrentUser = async (userId) => {
  // 1. Try Redis session
  const cached = await getSession(userId);
  if (cached) return cached;

  // 2. Fall back to DB
  const result = await query(
    `SELECT id, email, full_name, role, llm_preference, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [userId],
  );

  if (result.rows.length === 0) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const user = result.rows[0];

  // Re-cache
  await setSession(userId, user, 86_400);

  return user;
};

/**
 * Invalidate session — delete from Redis.
 *
 * @param {string} userId
 */
const logout = async (userId) => {
  await deleteSession(userId);
};

/**
 * Update user LLM preference.
 *
 * @param {string} userId
 * @param {string} provider  "grok" | "openai"
 * @returns {Promise<object>}  Updated user
 */
const updateLlmPreference = async (userId, provider) => {
  const result = await query(
    `UPDATE users
     SET llm_preference = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, email, full_name, role, llm_preference, created_at, updated_at`,
    [provider, userId],
  );

  if (result.rows.length === 0) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const user = result.rows[0];

  // Update Redis session + dedicated LLM cache
  await setSession(userId, user, 86_400);
  await setUserLLMPreference(userId, provider);

  return user;
};

/**
 * Register a new user account.
 *
 * @param {string} email
 * @param {string} password
 * @param {string} fullName
 * @returns {Promise<{ token: string, user: object }>}
 */
const register = async (email, password, fullName) => {
  // 1. Check if email already exists
  const existing = await query(
    `SELECT id FROM users WHERE email = $1`,
    [email.toLowerCase().trim()],
  );

  if (existing.rows.length > 0) {
    const err = new Error('An account with this email already exists');
    err.statusCode = 409;
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  // 2. Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // 3. Insert new user
  const result = await query(
    `INSERT INTO users (email, password_hash, full_name, role, llm_preference)
     VALUES ($1, $2, $3, 'manager', 'grok')
     RETURNING id, email, full_name, role, llm_preference, created_at, updated_at`,
    [email.toLowerCase().trim(), passwordHash, fullName.trim()],
  );

  const user = result.rows[0];

  // 4. Build JWT payload
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    llm_preference: user.llm_preference,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  // 5. Store session in Redis (24h)
  await setSession(user.id, payload, 86_400);
  await setUserLLMPreference(user.id, user.llm_preference);

  return { token, user };
};

module.exports = { login, register, getCurrentUser, logout, updateLlmPreference };
