/**
 * Kasparro AI Backend — Agent Service
 *
 * HTTP client for the FastAPI AI agent microservice.
 * Includes timeout, retry logic, and structured error handling.
 */

const axios = require('axios');

const AGENT_URL = process.env.AGENT_SERVICE_URL || 'http://fastapi:8000';
const TIMEOUT = 30_000; // 30 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY = 1_000; // 1 second

/**
 * Axios instance pre-configured for the FastAPI agent.
 */
const agentClient = axios.create({
  baseURL: AGENT_URL,
  timeout: TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Sleep helper for retry delays.
 * @param {number} ms
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute a request with automatic retry on transient failures.
 *
 * @param {Function} requestFn  Async function that returns an axios response
 * @param {number}   retries    Number of retries remaining
 * @returns {Promise<any>}      Response data
 */
const withRetry = async (requestFn, retries = MAX_RETRIES) => {
  try {
    const response = await requestFn();
    return response.data;
  } catch (err) {
    const isRetryable =
      !err.response || // network error
      err.code === 'ECONNABORTED' || // timeout
      (err.response && err.response.status >= 500); // server error

    if (isRetryable && retries > 0) {
      console.warn(
        `⚠️  Agent request failed (${err.message}). Retrying in ${RETRY_DELAY}ms … (${retries} left)`,
      );
      await sleep(RETRY_DELAY);
      return withRetry(requestFn, retries - 1);
    }

    // Build a friendly error
    const status = err.response?.status || 502;
    const message =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message ||
      'AI agent service unavailable';

    const agentError = new Error(message);
    agentError.statusCode = status;
    agentError.code = 'AGENT_ERROR';
    throw agentError;
  }
};

// ── Public API ──────────────────────────────────────────────

/**
 * Send an email via the FastAPI email service.
 *
 * @param {object} params
 * @param {string} params.to         Recipient email
 * @param {string} params.subject    Email subject
 * @param {string} params.body       Email body
 * @param {string} params.ticket_id  Related ticket ID
 * @param {string} authToken         JWT for auth header
 * @returns {Promise<{ success: boolean, message_id?: string, error?: string }>}
 */
const sendEmail = async ({ to, subject, body, ticket_id }, authToken, llmProvider) => {
  return withRetry(() =>
    agentClient.post(
      '/api/email/send',
      { to, subject, body, ticket_id },
      { headers: {
        Authorization: `Bearer ${authToken}`,
        'X-LLM-Provider': llmProvider || 'grok',
      } },
    ),
  );
};

/**
 * Generate an AI draft reply for a ticket.
 *
 * @param {object} params
 * @param {string} params.ticket_id   Ticket UUID
 * @param {string} params.message     The customer's email body
 * @param {Array}  params.context     Prior conversation context
 * @param {string} authToken          JWT for auth header
 * @returns {Promise<{ ticket_id, response, confidence, suggested_actions, sources }>}
 */
const generateDraft = async ({ ticket_id, message, context }, authToken, llmProvider) => {
  return withRetry(() =>
    agentClient.post(
      '/api/agent/regenerate',
      {
        ticket_id,
        original_email: message,
        llm_provider: llmProvider || 'grok',
        manager_feedback: null,
      },
      { headers: {
        Authorization: `Bearer ${authToken}`,
        'X-LLM-Provider': llmProvider || 'grok',
      } },
    ),
  );
};

/**
 * Summarize a ticket conversation.
 *
 * @param {string} ticket_id
 * @param {Array}  messages   Array of { role, content }
 * @param {string} authToken
 * @returns {Promise<{ ticket_id, summary }>}
 */
const summarizeTicket = async (ticket_id, messages, authToken, llmProvider) => {
  return withRetry(() =>
    agentClient.post(
      '/api/agent/summarize',
      { ticket_id, messages },
      { headers: {
        Authorization: `Bearer ${authToken}`,
        'X-LLM-Provider': llmProvider || 'grok',
      } },
    ),
  );
};

module.exports = { sendEmail, generateDraft, summarizeTicket };
