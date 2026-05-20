/**
 * Kasparro AI Backend — Tickets Service
 *
 * Business logic for ticket CRUD, approval workflow,
 * analytics, and audit trail.
 */

const { query } = require('../config/database');
const {
  getCache,
  setCache,
  deleteCache,
  deleteCachePattern,
} = require('./redis.service');
const agentService = require('./agent.service');

// ── Cache key builders ──────────────────────────────────────

const ticketCacheKey = (id) => `ticket:${id}`;
const ticketListCacheKey = (params) => `tickets:${JSON.stringify(params)}`;
const analyticsCacheKey = () => 'analytics:summary';

// ── List tickets (paginated + filtered) ─────────────────────

/**
 * Get paginated, filterable ticket list.
 *
 * @param {object} filters  { status, category, urgency, sentiment, page, limit }
 * @returns {Promise<{ tickets: Array, pagination: object }>}
 */
const getTickets = async (filters) => {
  const {
    status,
    category,
    urgency,
    sentiment,
    page = 1,
    limit = 20,
  } = filters;

  // Check cache
  const cacheKey = ticketListCacheKey(filters);
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  // Build dynamic WHERE
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`t.status = $${paramIndex++}`);
    params.push(status);
  }
  if (category) {
    conditions.push(`t.category = $${paramIndex++}`);
    params.push(category);
  }
  if (urgency) {
    conditions.push(`t.urgency = $${paramIndex++}`);
    params.push(urgency);
  }
  if (sentiment) {
    conditions.push(`t.sentiment = $${paramIndex++}`);
    params.push(sentiment);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countResult = await query(
    `SELECT COUNT(*) AS total FROM tickets t ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0].total, 10);

  // Fetch page
  const offset = (page - 1) * limit;
  const ticketsResult = await query(
    `SELECT
       t.id, t.customer_email, t.customer_name, t.subject,
       t.category, t.sentiment, t.urgency, t.status,
       t.ai_confidence_score, t.llm_provider_used,
       t.auto_resolved, t.created_at, t.updated_at,
       u_assigned.full_name AS assigned_to_name,
       u_approved.full_name AS approved_by_name
     FROM tickets t
     LEFT JOIN users u_assigned ON t.assigned_to = u_assigned.id
     LEFT JOIN users u_approved ON t.approved_by = u_approved.id
     ${whereClause}
     ORDER BY
       CASE t.urgency
         WHEN 'high'   THEN 1
         WHEN 'medium' THEN 2
         WHEN 'low'    THEN 3
         ELSE 4
       END,
       t.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, limit, offset],
  );

  const result = {
    tickets: ticketsResult.rows,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };

  // Cache for 30 seconds
  await setCache(cacheKey, result, 30);

  return result;
};

// ── Get single ticket ───────────────────────────────────────

/**
 * Get full ticket details by ID.
 *
 * @param {string} id  Ticket UUID
 * @returns {Promise<object>}
 */
const getTicketById = async (id) => {
  // Check cache
  const cached = await getCache(ticketCacheKey(id));
  if (cached) return cached;

  const result = await query(
    `SELECT
       t.*,
       u_assigned.full_name  AS assigned_to_name,
       u_assigned.email      AS assigned_to_email,
       u_approved.full_name  AS approved_by_name
     FROM tickets t
     LEFT JOIN users u_assigned ON t.assigned_to = u_assigned.id
     LEFT JOIN users u_approved ON t.approved_by = u_approved.id
     WHERE t.id = $1`,
    [id],
  );

  if (result.rows.length === 0) {
    const err = new Error('Ticket not found');
    err.statusCode = 404;
    err.code = 'TICKET_NOT_FOUND';
    throw err;
  }

  const ticket = result.rows[0];

  // Cache for 60 seconds
  await setCache(ticketCacheKey(id), ticket, 60);

  return ticket;
};

// ── Approve ticket ──────────────────────────────────────────

/**
 * Approve a ticket — send the reply via email FIRST, then update DB.
 * If email fails, ticket remains in current status (no false "sent").
 *
 * @param {string} ticketId     Ticket UUID
 * @param {string} userId       Approving user UUID
 * @param {string} editedReply  Optional edited reply text (null = use AI draft as-is)
 * @param {string} authToken    JWT for FastAPI call
 * @param {string} llmProvider  User's LLM preference
 * @returns {Promise<object>}   Updated ticket
 */
const approveTicket = async (ticketId, userId, editedReply, authToken, llmProvider) => {
  // 1. Get current ticket
  const current = await getTicketById(ticketId);

  if (current.status !== 'pending' && current.status !== 'auto_resolved') {
    const err = new Error(
      `Cannot approve ticket with status "${current.status}"`,
    );
    err.statusCode = 400;
    err.code = 'INVALID_STATUS_TRANSITION';
    throw err;
  }

  const finalReply = editedReply || current.ai_draft_reply;
  const wasEdited = editedReply && editedReply !== current.ai_draft_reply;

  if (!finalReply) {
    const err = new Error('No reply text available to send');
    err.statusCode = 400;
    err.code = 'NO_REPLY_TEXT';
    throw err;
  }

  // 2. If manager edited the reply, log the edit BEFORE sending
  if (wasEdited) {
    await query(
      `INSERT INTO audit_logs (ticket_id, action, performed_by, previous_value, new_value, notes)
       VALUES ($1, 'edited', $2, $3, $4, 'Manager edited AI draft before approving')`,
      [
        ticketId,
        userId,
        JSON.stringify({ ai_draft_reply: current.ai_draft_reply }),
        JSON.stringify({ edited_reply: editedReply }),
      ],
    );
  }

  // 3. Send email via FastAPI FIRST — ticket stays "pending" until success
  let emailSent = false;
  try {
    await agentService.sendEmail(
      {
        to: current.customer_email,
        subject: `Re: ${current.subject}`,
        body: finalReply,
        ticket_id: ticketId,
      },
      authToken,
      llmProvider,
    );
    emailSent = true;
  } catch (emailErr) {
    console.error('Email send failed:', emailErr.message);

    // Log the failure
    await query(
      `INSERT INTO audit_logs (ticket_id, action, performed_by, new_value, notes)
       VALUES ($1, 'email_failed', $2, $3, $4)`,
      [
        ticketId,
        userId,
        JSON.stringify({ error: emailErr.message }),
        `Email send failed: ${emailErr.message}. Ticket remains in "${current.status}" status.`,
      ],
    );

    const err = new Error(`Failed to send email: ${emailErr.message}`);
    err.statusCode = 502;
    err.code = 'EMAIL_SEND_FAILED';
    throw err;
  }

  // 4. Email succeeded — now update ticket to "sent"
  const updateResult = await query(
    `UPDATE tickets
     SET status          = 'sent',
         approved_by     = $1,
         approved_at     = NOW(),
         final_reply_sent = $2,
         updated_at      = NOW()
     WHERE id = $3
     RETURNING *`,
    [userId, finalReply, ticketId],
  );

  const updatedTicket = updateResult.rows[0];

  // 5. Insert approval audit log
  await query(
    `INSERT INTO audit_logs (ticket_id, action, performed_by, previous_value, new_value, notes)
     VALUES ($1, 'approved', $2, $3, $4, $5)`,
    [
      ticketId,
      userId,
      JSON.stringify({ status: current.status }),
      JSON.stringify({ status: 'sent', final_reply_sent: finalReply }),
      wasEdited
        ? 'Approved with edited reply — email sent to customer'
        : 'Approved with original AI draft — email sent to customer',
    ],
  );

  // 6. Clear caches
  await deleteCache(ticketCacheKey(ticketId));
  await deleteCachePattern('tickets:*');
  await deleteCache(analyticsCacheKey());

  return updatedTicket;
};

// ── Reject ticket ───────────────────────────────────────────

/**
 * Reject a ticket with a reason. No email sent to customer.
 *
 * @param {string} ticketId  Ticket UUID
 * @param {string} userId    Rejecting user UUID
 * @param {string} reason    Rejection reason (required)
 * @returns {Promise<object>} Updated ticket
 */
const rejectTicket = async (ticketId, userId, reason) => {
  const current = await getTicketById(ticketId);

  if (current.status !== 'pending' && current.status !== 'auto_resolved') {
    const err = new Error(
      `Cannot reject ticket with status "${current.status}"`,
    );
    err.statusCode = 400;
    err.code = 'INVALID_STATUS_TRANSITION';
    throw err;
  }

  if (!reason || !reason.trim()) {
    const err = new Error('Rejection reason is required');
    err.statusCode = 400;
    err.code = 'MISSING_REASON';
    throw err;
  }

  const updateResult = await query(
    `UPDATE tickets
     SET status     = 'rejected',
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [ticketId],
  );

  // Audit log with full reason
  await query(
    `INSERT INTO audit_logs (ticket_id, action, performed_by, previous_value, new_value, notes)
     VALUES ($1, 'rejected', $2, $3, '{"status": "rejected"}'::jsonb, $4)`,
    [
      ticketId,
      userId,
      JSON.stringify({ status: current.status }),
      reason.trim(),
    ],
  );

  // Clear caches
  await deleteCache(ticketCacheKey(ticketId));
  await deleteCachePattern('tickets:*');
  await deleteCache(analyticsCacheKey());

  return updateResult.rows[0];
};

// ── Regenerate AI draft ─────────────────────────────────────

/**
 * Call the AI agent to regenerate a draft reply.
 * Persists the new draft + confidence score to the DB.
 *
 * @param {string} ticketId    Ticket UUID
 * @param {string} authToken   JWT for FastAPI call
 * @param {string} llmProvider User's LLM preference
 * @returns {Promise<object>}  Updated ticket with new draft
 */
const regenerateDraft = async (ticketId, authToken, llmProvider) => {
  const ticket = await getTicketById(ticketId);

  if (ticket.status !== 'pending' && ticket.status !== 'auto_resolved') {
    const err = new Error(
      `Cannot regenerate draft for ticket with status "${ticket.status}"`,
    );
    err.statusCode = 400;
    err.code = 'INVALID_STATUS_TRANSITION';
    throw err;
  }

  const aiResponse = await agentService.generateDraft(
    {
      ticket_id: ticketId,
      message: ticket.original_email_body,
      context: [
        {
          role: 'system',
          content: `Category: ${ticket.category}. Sentiment: ${ticket.sentiment}. Urgency: ${ticket.urgency}.`,
        },
      ],
    },
    authToken,
    llmProvider,
  );

  // Extract new draft + confidence from AI response (EmailAnalysisResponse format)
  const newDraft = aiResponse.ai_draft_reply || aiResponse.response || aiResponse.draft_reply || aiResponse.draft || '';
  const newConfidence = aiResponse.ai_confidence_score ?? aiResponse.confidence ?? ticket.ai_confidence_score;
  const newAction = aiResponse.ai_suggested_action || ticket.ai_suggested_action;

  // Persist new draft to DB
  const updateResult = await query(
    `UPDATE tickets
     SET ai_draft_reply       = $1,
         ai_confidence_score  = $2,
         ai_suggested_action  = $3,
         llm_provider_used    = $4,
         updated_at           = NOW()
     WHERE id = $5
     RETURNING *`,
    [newDraft, newConfidence, newAction, llmProvider || 'grok', ticketId],
  );

  const updatedTicket = updateResult.rows[0];

  // Audit log
  await query(
    `INSERT INTO audit_logs (ticket_id, action, performed_by, previous_value, new_value, notes)
     VALUES ($1, 'regenerated', $2, $3, $4, $5)`,
    [
      ticketId,
      null, // system action (no specific user for regen in audit)
      JSON.stringify({
        ai_draft_reply: ticket.ai_draft_reply?.substring(0, 100) + '...',
        ai_confidence_score: ticket.ai_confidence_score,
      }),
      JSON.stringify({
        ai_draft_reply: newDraft.substring(0, 100) + '...',
        ai_confidence_score: newConfidence,
      }),
      `Draft regenerated via ${llmProvider || 'grok'}`,
    ],
  );

  // Clear caches
  await deleteCache(ticketCacheKey(ticketId));
  await deleteCachePattern('tickets:*');

  return updatedTicket;
};

// ── Analytics summary ───────────────────────────────────────

/**
 * Get comprehensive analytics using optimized CTE queries.
 * Cached for 5 minutes in Redis.
 *
 * @returns {Promise<object>}
 */
const getAnalyticsSummary = async () => {
  // Check cache (5 min TTL)
  const cached = await getCache(analyticsCacheKey());
  if (cached) return cached;

  // Single CTE-based query for all metrics
  const result = await query(`
    WITH status_counts AS (
      SELECT
        COUNT(*)::int                                                     AS total,
        COUNT(*) FILTER (WHERE status = 'pending')::int                   AS pending,
        COUNT(*) FILTER (WHERE status = 'auto_resolved')::int             AS auto_resolved,
        COUNT(*) FILTER (WHERE status IN ('approved','sent'))::int        AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')::int                  AS rejected,
        COUNT(*) FILTER (WHERE status = 'escalated')::int                 AS escalated,
        ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60)
              FILTER (WHERE status IN ('sent','approved','auto_resolved')), 1)
                                                                          AS avg_resolution_time_minutes
      FROM tickets
    ),
    category_counts AS (
      SELECT category, COUNT(*)::int AS count
      FROM tickets WHERE category IS NOT NULL
      GROUP BY category ORDER BY count DESC
    ),
    sentiment_counts AS (
      SELECT sentiment, COUNT(*)::int AS count
      FROM tickets WHERE sentiment IS NOT NULL
      GROUP BY sentiment ORDER BY count DESC
    ),
    urgency_counts AS (
      SELECT urgency, COUNT(*)::int AS count
      FROM tickets WHERE urgency IS NOT NULL
      GROUP BY urgency ORDER BY count DESC
    ),
    llm_counts AS (
      SELECT llm_provider_used AS provider, COUNT(*)::int AS count
      FROM tickets WHERE llm_provider_used IS NOT NULL
      GROUP BY llm_provider_used
    ),
    top_issues AS (
      SELECT
        category,
        COUNT(*)::int AS count,
        ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60), 1)
          AS avg_resolution_time
      FROM tickets
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
      LIMIT 5
    ),
    yesterday_count AS (
      SELECT COUNT(*)::int AS total
      FROM tickets
      WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
        AND created_at < CURRENT_DATE
    )
    SELECT
      row_to_json(sc)   AS overview,
      (SELECT json_agg(cc) FROM category_counts cc)   AS categories,
      (SELECT json_agg(snc) FROM sentiment_counts snc) AS sentiments,
      (SELECT json_agg(uc) FROM urgency_counts uc)     AS urgency,
      (SELECT json_agg(lc) FROM llm_counts lc)         AS llm_usage,
      (SELECT json_agg(ti) FROM top_issues ti)         AS top_issues,
      (SELECT total FROM yesterday_count)              AS yesterday_total
    FROM status_counts sc
  `);

  const row = result.rows[0] || {};
  const overview = row.overview || {};
  const total = overview.total || 0;

  // Compute rates
  overview.auto_resolve_rate = total > 0
    ? parseFloat(((overview.auto_resolved / total) * 100).toFixed(1))
    : 0;
  overview.manager_approval_rate = total > 0
    ? parseFloat(((overview.approved / total) * 100).toFixed(1))
    : 0;

  // Trend data from analytics_daily
  const trendResult = await query(
    `SELECT
       date,
       total_tickets    AS total,
       auto_resolved_count AS auto_resolved,
       manager_approved_count AS approved,
       rejected_count   AS rejected,
       avg_resolution_time_minutes
     FROM analytics_daily
     WHERE date >= CURRENT_DATE - INTERVAL '6 days'
     ORDER BY date ASC`,
  );

  // Build category/sentiment/urgency as objects
  const toObj = (arr) => (arr || []).reduce((o, r) => {
    o[r.category || r.sentiment || r.urgency || r.provider] = r.count;
    return o;
  }, {});

  const summary = {
    overview,
    trends: { last_7_days: trendResult.rows },
    categories: toObj(row.categories),
    sentiments: toObj(row.sentiments),
    urgency: toObj(row.urgency),
    llm_usage: toObj(row.llm_usage),
    top_issues: row.top_issues || [],
    yesterday_total: row.yesterday_total || 0,
    // Keep old format for backward compat
    counts: overview,
    daily_trend: trendResult.rows,
    category_breakdown: row.categories || [],
    sentiment_breakdown: row.sentiments || [],
  };

  // Cache for 5 minutes
  await setCache(analyticsCacheKey(), summary, 300);

  return summary;
};

// ── Audit Logs ──────────────────────────────────────────────

/**
 * Get paginated audit logs with optional filters.
 *
 * @param {object} filters  { action, ticketId, page, limit, startDate, endDate }
 * @returns {Promise<{ logs: Array, pagination: object }>}
 */
const getAuditLogs = async (filters = {}) => {
  const {
    action,
    ticketId,
    page = 1,
    limit = 25,
    startDate,
    endDate,
  } = filters;

  const conditions = [];
  const params = [];
  let idx = 1;

  if (action) {
    conditions.push(`a.action = $${idx++}`);
    params.push(action);
  }
  if (ticketId) {
    conditions.push(`a.ticket_id = $${idx++}`);
    params.push(ticketId);
  }
  if (startDate) {
    conditions.push(`a.created_at >= $${idx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`a.created_at <= $${idx++}`);
    params.push(endDate);
  }

  const where = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  // Count
  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM audit_logs a ${where}`,
    params,
  );
  const total = countResult.rows[0]?.total || 0;

  // Fetch page
  const offset = (page - 1) * limit;
  const logsResult = await query(
    `SELECT
       a.id, a.ticket_id, a.action, a.performed_by,
       a.previous_value, a.new_value, a.notes, a.created_at,
       u.full_name AS performed_by_name,
       t.subject AS ticket_subject,
       t.customer_email
     FROM audit_logs a
     LEFT JOIN users u ON a.performed_by = u.id
     LEFT JOIN tickets t ON a.ticket_id = t.id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );

  return {
    logs: logsResult.rows,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

module.exports = {
  getTickets,
  getTicketById,
  approveTicket,
  rejectTicket,
  regenerateDraft,
  getAnalyticsSummary,
  getAuditLogs,
};

