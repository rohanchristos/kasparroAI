/**
 * Kasparro AI Backend — Redis Cache Service
 *
 * Centralised cache helpers used by other services.
 */

const redis = require('../config/redis');

const CACHE_PREFIX = 'cache:';
const SESSION_PREFIX = 'session:';

/**
 * Get a cached JSON value.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
const getCache = async (key) => {
  try {
    const data = await redis.get(`${CACHE_PREFIX}${key}`);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('Redis GET error:', err.message);
    return null;
  }
};

/**
 * Set a JSON value in cache with TTL.
 * @param {string} key
 * @param {any}    value
 * @param {number} ttlSeconds
 */
const setCache = async (key, value, ttlSeconds) => {
  try {
    await redis.set(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify(value),
      'EX',
      ttlSeconds,
    );
  } catch (err) {
    console.error('Redis SET error:', err.message);
  }
};

/**
 * Delete one or more cache keys.
 * @param {...string} keys
 */
const deleteCache = async (...keys) => {
  try {
    const prefixed = keys.map((k) => `${CACHE_PREFIX}${k}`);
    if (prefixed.length > 0) {
      await redis.del(...prefixed);
    }
  } catch (err) {
    console.error('Redis DEL error:', err.message);
  }
};

/**
 * Delete all cache keys matching a pattern.
 * @param {string} pattern  e.g. "tickets:*"
 */
const deleteCachePattern = async (pattern) => {
  try {
    const keys = await redis.keys(`${CACHE_PREFIX}${pattern}`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.error('Redis pattern DEL error:', err.message);
  }
};

// ── Session helpers ─────────────────────────────────────────

/**
 * Store a user session in Redis.
 * @param {string} userId
 * @param {object} userData
 * @param {number} ttlSeconds  default 24 hours
 */
const setSession = async (userId, userData, ttlSeconds = 86_400) => {
  try {
    await redis.set(
      `${SESSION_PREFIX}${userId}`,
      JSON.stringify(userData),
      'EX',
      ttlSeconds,
    );
  } catch (err) {
    console.error('Redis session SET error:', err.message);
  }
};

/**
 * Get a user session from Redis.
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
const getSession = async (userId) => {
  try {
    const data = await redis.get(`${SESSION_PREFIX}${userId}`);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('Redis session GET error:', err.message);
    return null;
  }
};

/**
 * Delete a user session.
 * @param {string} userId
 */
const deleteSession = async (userId) => {
  try {
    await redis.del(`${SESSION_PREFIX}${userId}`);
  } catch (err) {
    console.error('Redis session DEL error:', err.message);
  }
};

// ── LLM Preference helpers ──────────────────────────────────

const LLM_PREFIX = 'user:llm:';

/**
 * Cache a user's LLM provider preference.
 * @param {string} userId
 * @param {string} provider  "grok" | "openai"
 * @param {number} ttlSeconds  default 24 hours
 */
const setUserLLMPreference = async (userId, provider, ttlSeconds = 86_400) => {
  try {
    await redis.set(`${LLM_PREFIX}${userId}`, provider, 'EX', ttlSeconds);
  } catch (err) {
    console.error('Redis LLM SET error:', err.message);
  }
};

/**
 * Get a user's cached LLM preference.
 * @param {string} userId
 * @returns {Promise<string|null>}  "grok" | "openai" | null
 */
const getUserLLMPreference = async (userId) => {
  try {
    return await redis.get(`${LLM_PREFIX}${userId}`);
  } catch (err) {
    console.error('Redis LLM GET error:', err.message);
    return null;
  }
};

/**
 * Delete a user's cached LLM preference.
 * @param {string} userId
 */
const deleteUserLLMPreference = async (userId) => {
  try {
    await redis.del(`${LLM_PREFIX}${userId}`);
  } catch (err) {
    console.error('Redis LLM DEL error:', err.message);
  }
};

module.exports = {
  getCache,
  setCache,
  deleteCache,
  deleteCachePattern,
  setSession,
  getSession,
  deleteSession,
  setUserLLMPreference,
  getUserLLMPreference,
  deleteUserLLMPreference,
};

