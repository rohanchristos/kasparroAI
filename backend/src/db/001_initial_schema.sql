-- ============================================================
-- Kasparro AI Customer Support SaaS — Initial Schema Migration
-- File: 001_initial_schema.sql
-- 
-- Run:  psql -U kasparro_admin -d kasparro_db -f 001_initial_schema.sql
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1. EXTENSIONS
-- ════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ════════════════════════════════════════════════════════════
-- 2. ENUM TYPES
-- ════════════════════════════════════════════════════════════

CREATE TYPE user_role          AS ENUM ('admin', 'manager');
CREATE TYPE llm_provider       AS ENUM ('grok', 'openai', 'openrouter');
CREATE TYPE ticket_category    AS ENUM ('refund', 'tracking', 'damaged_product', 'wrong_item', 'complaint', 'faq', 'policy', 'other');
CREATE TYPE ticket_sentiment   AS ENUM ('angry', 'frustrated', 'neutral', 'positive');
CREATE TYPE ticket_urgency     AS ENUM ('high', 'medium', 'low');
CREATE TYPE ticket_status      AS ENUM ('pending', 'auto_resolved', 'approved', 'rejected', 'sent', 'escalated');
CREATE TYPE audit_action       AS ENUM ('created', 'ai_drafted', 'auto_resolved', 'approved', 'edited', 'rejected', 'sent', 'regenerated', 'escalated');
CREATE TYPE processing_status  AS ENUM ('queued', 'processing', 'completed', 'failed');


-- ════════════════════════════════════════════════════════════
-- 3. TABLES
-- ════════════════════════════════════════════════════════════

-- ── 3.1 users ──────────────────────────────────────────────
-- Stores manager and admin accounts that review, approve, or 
-- reject AI-generated reply drafts. Each user can set their 
-- preferred LLM provider for draft generation.
-- ────────────────────────────────────────────────────────────

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255),
    role            user_role    NOT NULL DEFAULT 'manager',
    llm_preference  llm_provider NOT NULL DEFAULT 'grok',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  users IS 'Manager and admin accounts that review AI-generated reply drafts.';
COMMENT ON COLUMN users.llm_preference IS 'Preferred LLM provider (grok or openai) for generating draft replies.';
COMMENT ON COLUMN users.password_hash IS 'bcrypt-hashed password. Never store plaintext.';


-- ── 3.2 tickets ────────────────────────────────────────────
-- Central table for customer complaint emails. Each row holds
-- the original email, AI-generated draft reply, confidence
-- scores, and the full approval lifecycle state.
-- ────────────────────────────────────────────────────────────

CREATE TABLE tickets (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_email        VARCHAR(255) NOT NULL,
    customer_name         VARCHAR(255),
    subject               VARCHAR(500) NOT NULL,
    original_email_body   TEXT         NOT NULL,
    gmail_message_id      VARCHAR(255) UNIQUE,

    -- AI classification
    category              ticket_category,
    sentiment             ticket_sentiment,
    urgency               ticket_urgency,

    -- Lifecycle state
    status                ticket_status  NOT NULL DEFAULT 'pending',

    -- AI draft
    ai_draft_reply        TEXT,
    ai_confidence_score   FLOAT CHECK (ai_confidence_score >= 0 AND ai_confidence_score <= 1),
    ai_suggested_action   TEXT,
    llm_provider_used     llm_provider,

    -- Human workflow
    assigned_to           UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at           TIMESTAMPTZ,
    final_reply_sent      TEXT,
    auto_resolved         BOOLEAN NOT NULL DEFAULT FALSE,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  tickets IS 'Customer complaint emails with AI-generated drafts and approval lifecycle.';
COMMENT ON COLUMN tickets.gmail_message_id IS 'Gmail API message ID — used to prevent duplicate email processing.';
COMMENT ON COLUMN tickets.ai_confidence_score IS 'AI model confidence in its draft reply (0.0 = no confidence, 1.0 = fully confident).';
COMMENT ON COLUMN tickets.auto_resolved IS 'TRUE if the AI agent auto-resolved this ticket without manager approval (low-risk only).';
COMMENT ON COLUMN tickets.final_reply_sent IS 'The actual reply text that was sent to the customer (may differ from AI draft after edits).';


-- ── 3.3 audit_logs ────────────────────────────────────────
-- Immutable audit trail for compliance. Every state change on
-- a ticket is recorded with before/after values and the actor.
-- System-initiated actions (AI draft, auto-resolve) have
-- performed_by = NULL.
-- ────────────────────────────────────────────────────────────

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id       UUID         NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    action          audit_action NOT NULL,
    performed_by    UUID         REFERENCES users(id) ON DELETE SET NULL,
    previous_value  JSONB,
    new_value       JSONB,
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  audit_logs IS 'Immutable compliance audit trail — every ticket state change is recorded.';
COMMENT ON COLUMN audit_logs.performed_by IS 'NULL for system/AI-initiated actions (e.g. ai_drafted, auto_resolved).';
COMMENT ON COLUMN audit_logs.previous_value IS 'Snapshot of changed fields before the action.';
COMMENT ON COLUMN audit_logs.new_value IS 'Snapshot of changed fields after the action.';


-- ── 3.4 email_processing_queue ─────────────────────────────
-- Inbound email processing queue. Emails fetched from Gmail
-- are queued here, processed by the AI pipeline, and marked
-- completed or failed with retry tracking.
-- ────────────────────────────────────────────────────────────

CREATE TABLE email_processing_queue (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gmail_message_id    VARCHAR(255) NOT NULL UNIQUE,
    raw_email_data      JSONB        NOT NULL,
    processing_status   processing_status NOT NULL DEFAULT 'queued',
    error_message       TEXT,
    retry_count         INT          NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  email_processing_queue IS 'Inbound email processing queue with retry tracking.';
COMMENT ON COLUMN email_processing_queue.raw_email_data IS 'Full email payload from Gmail API stored as JSONB.';
COMMENT ON COLUMN email_processing_queue.retry_count IS 'Number of processing retry attempts. Capped at application level.';


-- ── 3.5 analytics_daily ────────────────────────────────────
-- Aggregated daily metrics for dashboards and reporting.
-- Auto-populated by triggers on ticket status changes.
-- ────────────────────────────────────────────────────────────

CREATE TABLE analytics_daily (
    id                           UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
    date                         DATE  NOT NULL UNIQUE,
    total_tickets                INT   NOT NULL DEFAULT 0,
    auto_resolved_count          INT   NOT NULL DEFAULT 0,
    manager_approved_count       INT   NOT NULL DEFAULT 0,
    rejected_count               INT   NOT NULL DEFAULT 0,
    avg_resolution_time_minutes  FLOAT,
    category_breakdown           JSONB NOT NULL DEFAULT '{}'::jsonb,
    sentiment_breakdown          JSONB NOT NULL DEFAULT '{}'::jsonb,
    llm_usage_breakdown          JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE  analytics_daily IS 'Aggregated daily metrics — auto-populated by ticket status change triggers.';
COMMENT ON COLUMN analytics_daily.category_breakdown IS 'JSON map of category → count, e.g. {"refund": 5, "tracking": 12}.';
COMMENT ON COLUMN analytics_daily.sentiment_breakdown IS 'JSON map of sentiment → count, e.g. {"angry": 3, "neutral": 8}.';
COMMENT ON COLUMN analytics_daily.llm_usage_breakdown IS 'JSON map of provider → count, e.g. {"grok": 10, "openai": 5}.';


-- ════════════════════════════════════════════════════════════
-- 4. INDEXES
-- ════════════════════════════════════════════════════════════

-- users
CREATE INDEX idx_users_email           ON users (email);
CREATE INDEX idx_users_role            ON users (role);

-- tickets — foreign keys
CREATE INDEX idx_tickets_assigned_to   ON tickets (assigned_to);
CREATE INDEX idx_tickets_approved_by   ON tickets (approved_by);

-- tickets — frequently queried columns
CREATE INDEX idx_tickets_status        ON tickets (status);
CREATE INDEX idx_tickets_category      ON tickets (category);
CREATE INDEX idx_tickets_urgency       ON tickets (urgency);
CREATE INDEX idx_tickets_sentiment     ON tickets (sentiment);
CREATE INDEX idx_tickets_customer_email ON tickets (customer_email);
CREATE INDEX idx_tickets_created_at    ON tickets (created_at DESC);
CREATE INDEX idx_tickets_auto_resolved ON tickets (auto_resolved) WHERE auto_resolved = TRUE;
CREATE INDEX idx_tickets_gmail_msg     ON tickets (gmail_message_id);

-- Composite: dashboard query (status + urgency + created_at)
CREATE INDEX idx_tickets_status_urgency_created 
    ON tickets (status, urgency, created_at DESC);

-- audit_logs
CREATE INDEX idx_audit_ticket_id       ON audit_logs (ticket_id);
CREATE INDEX idx_audit_action          ON audit_logs (action);
CREATE INDEX idx_audit_performed_by    ON audit_logs (performed_by);
CREATE INDEX idx_audit_created_at      ON audit_logs (created_at DESC);

-- email_processing_queue
CREATE INDEX idx_queue_status          ON email_processing_queue (processing_status);
CREATE INDEX idx_queue_gmail_msg       ON email_processing_queue (gmail_message_id);
CREATE INDEX idx_queue_created_at      ON email_processing_queue (created_at DESC);

-- Partial index: only queued/failed items (for the processing worker)
CREATE INDEX idx_queue_pending 
    ON email_processing_queue (processing_status, created_at) 
    WHERE processing_status IN ('queued', 'failed');

-- analytics_daily
CREATE INDEX idx_analytics_date        ON analytics_daily (date DESC);


-- ════════════════════════════════════════════════════════════
-- 5. TRIGGER FUNCTIONS
-- ════════════════════════════════════════════════════════════

-- ── 5.1 Auto-update updated_at ─────────────────────────────

CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ── 5.2 Auto-update analytics_daily on ticket status change ─

CREATE OR REPLACE FUNCTION fn_update_analytics_on_ticket_change()
RETURNS TRIGGER AS $$
DECLARE
    v_date          DATE;
    v_category_key  TEXT;
    v_sentiment_key TEXT;
    v_llm_key       TEXT;
BEGIN
    -- Determine the date bucket
    v_date := COALESCE(NEW.created_at, NOW())::date;

    -- Ensure a row exists for today
    INSERT INTO analytics_daily (date)
    VALUES (v_date)
    ON CONFLICT (date) DO NOTHING;

    -- ── Handle INSERT (new ticket created) ──────────────────
    IF TG_OP = 'INSERT' THEN
        -- Increment total_tickets
        UPDATE analytics_daily
        SET total_tickets = total_tickets + 1
        WHERE date = v_date;

        -- Update category breakdown
        IF NEW.category IS NOT NULL THEN
            v_category_key := NEW.category::text;
            UPDATE analytics_daily
            SET category_breakdown = jsonb_set(
                category_breakdown,
                ARRAY[v_category_key],
                TO_JSONB(COALESCE((category_breakdown ->> v_category_key)::int, 0) + 1)
            )
            WHERE date = v_date;
        END IF;

        -- Update sentiment breakdown
        IF NEW.sentiment IS NOT NULL THEN
            v_sentiment_key := NEW.sentiment::text;
            UPDATE analytics_daily
            SET sentiment_breakdown = jsonb_set(
                sentiment_breakdown,
                ARRAY[v_sentiment_key],
                TO_JSONB(COALESCE((sentiment_breakdown ->> v_sentiment_key)::int, 0) + 1)
            )
            WHERE date = v_date;
        END IF;

        -- Update LLM usage breakdown
        IF NEW.llm_provider_used IS NOT NULL THEN
            v_llm_key := NEW.llm_provider_used::text;
            UPDATE analytics_daily
            SET llm_usage_breakdown = jsonb_set(
                llm_usage_breakdown,
                ARRAY[v_llm_key],
                TO_JSONB(COALESCE((llm_usage_breakdown ->> v_llm_key)::int, 0) + 1)
            )
            WHERE date = v_date;
        END IF;
    END IF;

    -- ── Handle UPDATE (status changed) ──────────────────────
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN

        -- Auto-resolved
        IF NEW.status = 'auto_resolved' THEN
            UPDATE analytics_daily
            SET auto_resolved_count = auto_resolved_count + 1
            WHERE date = v_date;
        END IF;

        -- Manager approved
        IF NEW.status = 'approved' THEN
            UPDATE analytics_daily
            SET manager_approved_count = manager_approved_count + 1
            WHERE date = v_date;
        END IF;

        -- Rejected
        IF NEW.status = 'rejected' THEN
            UPDATE analytics_daily
            SET rejected_count = rejected_count + 1
            WHERE date = v_date;
        END IF;

        -- Calculate average resolution time when ticket reaches a terminal state
        IF NEW.status IN ('auto_resolved', 'sent') THEN
            UPDATE analytics_daily
            SET avg_resolution_time_minutes = sub.avg_mins
            FROM (
                SELECT AVG(EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 60.0) AS avg_mins
                FROM tickets t
                WHERE t.created_at::date = v_date
                  AND t.status IN ('auto_resolved', 'sent')
            ) sub
            WHERE date = v_date;
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ════════════════════════════════════════════════════════════
-- 6. ATTACH TRIGGERS
-- ════════════════════════════════════════════════════════════

-- updated_at triggers
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

CREATE TRIGGER trg_queue_updated_at
    BEFORE UPDATE ON email_processing_queue
    FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- Analytics auto-update trigger
CREATE TRIGGER trg_tickets_analytics_insert
    AFTER INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_update_analytics_on_ticket_change();

CREATE TRIGGER trg_tickets_analytics_update
    AFTER UPDATE OF status ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_update_analytics_on_ticket_change();


-- ════════════════════════════════════════════════════════════
-- 7. SEED DATA — USERS
-- ════════════════════════════════════════════════════════════
-- Passwords:
--   sarah.chen@kasparro.ai    → password: Manager@123
--   james.wilson@kasparro.ai  → password: Manager@456
--
-- bcrypt hashes generated with cost factor 10.
-- ────────────────────────────────────────────────────────────

INSERT INTO users (id, email, password_hash, full_name, role, llm_preference) VALUES
(
    'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    'sarah.chen@kasparro.ai',
    '$2a$10$/pumEv.FNh8neQTEoZSzw.SM2NQ.56s.Cq1nv/hsPinaqNX3BXxd2',
    'Sarah Chen',
    'manager',
    'grok'
),
(
    'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
    'james.wilson@kasparro.ai',
    '$2a$10$VqHCHLBCNnUXFXz21pB2VuMQq2PZTPzBpv1OlTcGTQE5ioXWv4mxS',
    'James Wilson',
    'manager',
    'openai'
);


-- ════════════════════════════════════════════════════════════
-- 8. SEED DATA — TICKETS (10 realistic samples)
-- ════════════════════════════════════════════════════════════

-- Ticket 1: Refund — Angry customer, high urgency
INSERT INTO tickets (id, customer_email, customer_name, subject, original_email_body, gmail_message_id, category, sentiment, urgency, status, ai_draft_reply, ai_confidence_score, ai_suggested_action, llm_provider_used, assigned_to, auto_resolved) VALUES
(
    '10000000-0000-0000-0000-000000000001',
    'maria.garcia@gmail.com',
    'Maria Garcia',
    'DEMAND IMMEDIATE REFUND — Order #ORD-29481',
    E'I am absolutely furious. I ordered a premium leather jacket two weeks ago (Order #ORD-29481) and received a cheap polyester knockoff instead. This is fraud. I want a FULL refund processed immediately or I will be filing a complaint with the BBB and disputing the charge with my credit card company. I have photos proving this is not the product advertised. This is the worst shopping experience of my life.',
    'msg_gmail_001',
    'refund',
    'angry',
    'high',
    'pending',
    E'Dear Maria,\n\nI sincerely apologize for this unacceptable experience. You are absolutely right to be upset — receiving the wrong product is not the standard we hold ourselves to.\n\nI have initiated a full refund of $189.99 to your original payment method. You should see the credit within 3-5 business days. Additionally, I am arranging a prepaid return label so you can send back the incorrect item at no cost to you.\n\nAs a gesture of goodwill, I would also like to offer you a 25% discount on your next purchase.\n\nPlease let me know if there is anything else I can do to make this right.\n\nSincerely,\nKasparro Support Team',
    0.82,
    'Process full refund immediately. Send prepaid return label. Offer 25% discount code. Flag order for quality investigation.',
    'grok',
    'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    FALSE
);

-- Ticket 2: Tracking — Neutral, low urgency (auto-resolved)
INSERT INTO tickets (id, customer_email, customer_name, subject, original_email_body, gmail_message_id, category, sentiment, urgency, status, ai_draft_reply, ai_confidence_score, ai_suggested_action, llm_provider_used, auto_resolved) VALUES
(
    '10000000-0000-0000-0000-000000000002',
    'john.doe@outlook.com',
    'John Doe',
    'Where is my package? Order #ORD-30122',
    E'Hi, I placed an order last week (Order #ORD-30122) and haven''t received any shipping updates. Could you please let me know the current status and expected delivery date? Thanks!',
    'msg_gmail_002',
    'tracking',
    'neutral',
    'low',
    'auto_resolved',
    E'Hi John,\n\nThank you for reaching out! I''ve checked the status of your order #ORD-30122.\n\nYour package was shipped on May 15th via FedEx with tracking number 7489203847102. It is currently in transit and the estimated delivery date is May 20th.\n\nYou can track your package in real-time here: https://fedex.com/track?id=7489203847102\n\nPlease don''t hesitate to reach out if you have any other questions!\n\nBest regards,\nKasparro Support Team',
    0.97,
    'Auto-resolve: standard tracking inquiry. Provide tracking link.',
    'grok',
    TRUE
);

-- Ticket 3: Damaged product — Frustrated, high urgency
INSERT INTO tickets (id, customer_email, customer_name, subject, original_email_body, gmail_message_id, category, sentiment, urgency, status, ai_draft_reply, ai_confidence_score, ai_suggested_action, llm_provider_used, assigned_to, auto_resolved) VALUES
(
    '10000000-0000-0000-0000-000000000003',
    'emma.thompson@yahoo.com',
    'Emma Thompson',
    'Received broken monitor — extremely disappointed',
    E'I just received my 27-inch gaming monitor (Order #ORD-28975) and the screen is completely shattered. The packaging was clearly mishandled — the box had a huge dent on the side. I spent $450 on this and now I have a useless piece of glass. I need a replacement sent ASAP or a refund. I attached photos of the damage and the box condition.',
    'msg_gmail_003',
    'damaged_product',
    'frustrated',
    'high',
    'approved',
    E'Dear Emma,\n\nI''m truly sorry to see your monitor arrived damaged. That is completely unacceptable and I understand your frustration.\n\nI''ve reviewed the photos you sent and can confirm the shipping damage. Here''s what I''m doing right now:\n\n1. A brand new replacement monitor is being prepared for express shipping (2-day delivery, no charge)\n2. A prepaid return label for the damaged unit will be emailed to you shortly\n3. I''ve filed a damage claim with the carrier\n\nYou should receive the replacement tracking number within 24 hours.\n\nAgain, I deeply apologize for this experience. Please let me know if you need anything else.\n\nWarm regards,\nKasparro Support Team',
    0.88,
    'Ship replacement via express. Arrange return pickup for damaged item. File carrier damage claim.',
    'openai',
    'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
    FALSE
);

-- Ticket 4: Wrong item — Frustrated, medium urgency
INSERT INTO tickets (id, customer_email, customer_name, subject, original_email_body, gmail_message_id, category, sentiment, urgency, status, ai_draft_reply, ai_confidence_score, ai_suggested_action, llm_provider_used, assigned_to, auto_resolved) VALUES
(
    '10000000-0000-0000-0000-000000000004',
    'raj.patel@gmail.com',
    'Raj Patel',
    'Wrong item received — ordered blue, got red',
    E'Hello, I ordered the Nike Air Max 270 in Navy Blue, size 10 (Order #ORD-31005) but received the same shoe in Red. I specifically need the blue ones as they match a outfit for an event next weekend. Can you please send the correct color? I don''t mind keeping the red ones as well if that speeds things up.',
    'msg_gmail_004',
    'wrong_item',
    'frustrated',
    'medium',
    'pending',
    E'Hi Raj,\n\nI apologize for the mix-up with your order. I completely understand the urgency with your upcoming event.\n\nGreat news — I''ve confirmed we have the Navy Blue Nike Air Max 270 in size 10 in stock. I''m shipping the correct pair to you via express delivery right now, so you should have them well before your event.\n\nAs for the red pair — please keep them as our apology for the inconvenience. No need to return them.\n\nYour new tracking information will be sent within the hour.\n\nBest,\nKasparro Support Team',
    0.91,
    'Ship correct item (Navy Blue, size 10) via express. Let customer keep wrong item. No return needed.',
    'grok',
    'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    FALSE
);

-- Ticket 5: FAQ — Positive, low urgency (auto-resolved)
INSERT INTO tickets (id, customer_email, customer_name, subject, original_email_body, gmail_message_id, category, sentiment, urgency, status, ai_draft_reply, ai_confidence_score, ai_suggested_action, llm_provider_used, auto_resolved) VALUES
(
    '10000000-0000-0000-0000-000000000005',
    'lisa.wang@gmail.com',
    'Lisa Wang',
    'Question about your return policy',
    E'Hi there! I recently made a purchase and I''m loving the product. I just wanted to clarify — what is your return policy window? And do I need the original packaging? Thanks so much!',
    'msg_gmail_005',
    'faq',
    'positive',
    'low',
    'auto_resolved',
    E'Hi Lisa!\n\nSo glad you''re loving your purchase! 😊\n\nHere are the key details of our return policy:\n\n• 30-day return window from the date of delivery\n• Original packaging is preferred but not required\n• Items must be in unused/unworn condition with tags attached\n• Free return shipping on all orders\n• Refunds are processed within 5-7 business days after we receive the item\n\nYou can initiate a return anytime from your account page under "Order History."\n\nLet me know if you have any other questions!\n\nCheers,\nKasparro Support Team',
    0.99,
    'Auto-resolve: standard FAQ about return policy. No action needed.',
    'grok',
    TRUE
);

-- Ticket 6: Complaint — Angry, high urgency
INSERT INTO tickets (id, customer_email, customer_name, subject, original_email_body, gmail_message_id, category, sentiment, urgency, status, ai_draft_reply, ai_confidence_score, ai_suggested_action, llm_provider_used, assigned_to, auto_resolved) VALUES
(
    '10000000-0000-0000-0000-000000000006',
    'mike.johnson@protonmail.com',
    'Mike Johnson',
    'Third time contacting you — STILL no resolution',
    E'This is my THIRD email about this issue and nobody has bothered to respond. I was charged twice for Order #ORD-27843 — once on May 1st and again on May 3rd. That''s $324.50 taken from my account that shouldn''t be there. Your customer service is absolutely terrible. If this isn''t resolved within 24 hours I''m going straight to my bank for a chargeback and leaving reviews everywhere warning people about your company.',
    'msg_gmail_006',
    'complaint',
    'angry',
    'high',
    'escalated',
    E'Dear Mike,\n\nI am deeply sorry for the lack of response and the duplicate charge. This is completely unacceptable and I take full responsibility for the delay.\n\nI have personally verified the duplicate charge of $324.50 on May 3rd and have initiated an immediate refund. Here is your refund confirmation number: REF-2024-08291.\n\nTimeline:\n• Refund initiated: Today\n• Expected in your account: Within 2-3 business days\n• If not received by May 22nd, please reply to this email directly\n\nI''ve also escalated your case to our Customer Experience Director to ensure this never happens again. You will receive a personal follow-up call within 24 hours.\n\nI understand your frustration and truly appreciate your patience.\n\nSincerely,\nKasparro Support Team',
    0.75,
    'URGENT: Escalate to senior management. Process duplicate charge refund immediately. Schedule personal follow-up call. Flag account for VIP treatment.',
    'openai',
    'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
    FALSE
);

-- Ticket 7: Policy — Neutral, medium urgency
INSERT INTO tickets (id, customer_email, customer_name, subject, original_email_body, gmail_message_id, category, sentiment, urgency, status, ai_draft_reply, ai_confidence_score, ai_suggested_action, llm_provider_used, assigned_to, auto_resolved) VALUES
(
    '10000000-0000-0000-0000-000000000007',
    'anna.mueller@web.de',
    'Anna Mueller',
    'International shipping to Germany — customs duties?',
    E'Hello, I''m interested in purchasing several items from your store but I live in Germany. Can you tell me: 1) Do you ship internationally? 2) Who pays the customs/import duties? 3) How long does shipping to Europe typically take? 4) Are returns possible from international orders? Thank you for your help.',
    'msg_gmail_007',
    'policy',
    'neutral',
    'medium',
    'pending',
    E'Hello Anna,\n\nGreat questions! Here''s everything you need to know about ordering from Germany:\n\n1. **International Shipping**: Yes! We ship to Germany and 40+ countries worldwide.\n\n2. **Customs & Duties**: Import duties and taxes are the responsibility of the recipient, as per international shipping regulations. Fees vary based on the item category and value. For Germany, you can estimate duties using the German Customs calculator (zoll.de).\n\n3. **Shipping Time**: Standard shipping to Germany takes 7-12 business days. Express shipping (DHL) takes 3-5 business days.\n\n4. **International Returns**: Absolutely! International returns are accepted within 30 days. However, return shipping costs from outside the US are the customer''s responsibility.\n\nWould you like me to help you place an order?\n\nBest regards,\nKasparro Support Team',
    0.94,
    'Standard policy inquiry. Consider auto-resolve if confidence threshold met.',
    'grok',
    'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    FALSE
);

-- Ticket 8: Tracking — Frustrated, medium urgency
INSERT INTO tickets (id, customer_email, customer_name, subject, original_email_body, gmail_message_id, category, sentiment, urgency, status, ai_draft_reply, ai_confidence_score, ai_suggested_action, llm_provider_used, auto_resolved) VALUES
(
    '10000000-0000-0000-0000-000000000008',
    'david.kim@gmail.com',
    'David Kim',
    'Package shows delivered but I never got it',
    E'My order #ORD-30789 shows as "delivered" on the tracking page but I never received anything. I''ve checked with my neighbors and the front desk of my building — nothing. I''m worried it was stolen or delivered to the wrong address. My address is 456 Oak Avenue, Apt 12B, Portland, OR 97201. Can you look into this?',
    'msg_gmail_008',
    'tracking',
    'frustrated',
    'medium',
    'pending',
    E'Hi David,\n\nI''m sorry to hear your package appears to be missing. I understand how concerning this is and I''m going to help resolve this right away.\n\nHere''s what I''m doing:\n\n1. I''ve filed an investigation with the carrier (UPS) for tracking #1Z999AA10123456784 — they will check GPS delivery coordinates and driver records\n2. I''ve verified your shipping address matches what we have on file (456 Oak Avenue, Apt 12B, Portland, OR 97201) ✓\n3. If the carrier cannot locate the package within 48 hours, I will ship a replacement at no charge\n\nIn the meantime, I recommend checking any secure package areas in your building and reviewing any delivery photo notifications from UPS.\n\nI''ll follow up with you within 48 hours with an update.\n\nBest,\nKasparro Support Team',
    0.85,
    'File carrier investigation. Wait 48h for carrier response. If unresolved, ship replacement. Verify delivery address.',
    'openai',
    FALSE
);

-- Ticket 9: Refund — Neutral, low urgency (auto-resolved, sent)
INSERT INTO tickets (id, customer_email, customer_name, subject, original_email_body, gmail_message_id, category, sentiment, urgency, status, ai_draft_reply, ai_confidence_score, ai_suggested_action, llm_provider_used, approved_by, approved_at, final_reply_sent, auto_resolved) VALUES
(
    '10000000-0000-0000-0000-000000000009',
    'sophie.martin@icloud.com',
    'Sophie Martin',
    'Cancel my order #ORD-31200 please',
    E'Hi, I just placed order #ORD-31200 about 20 minutes ago but I changed my mind. Can you please cancel it and refund my payment? It hasn''t shipped yet. Thank you!',
    'msg_gmail_009',
    'refund',
    'neutral',
    'low',
    'sent',
    E'Hi Sophie,\n\nNo problem at all! I''ve cancelled order #ORD-31200 and initiated a full refund.\n\nRefund details:\n• Amount: $67.99\n• Method: Original payment method\n• Timeline: 3-5 business days\n\nIf you change your mind, you''re welcome to place a new order anytime.\n\nHave a great day!\n\nBest,\nKasparro Support Team',
    0.98,
    'Auto-resolve: order not yet shipped. Cancel and refund.',
    'grok',
    'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    NOW() - INTERVAL '2 hours',
    E'Hi Sophie,\n\nNo problem at all! I''ve cancelled order #ORD-31200 and initiated a full refund.\n\nRefund details:\n• Amount: $67.99\n• Method: Original payment method\n• Timeline: 3-5 business days\n\nIf you change your mind, you''re welcome to place a new order anytime.\n\nHave a great day!\n\nBest,\nKasparro Support Team',
    TRUE
);

-- Ticket 10: Other — Positive, low urgency (auto-resolved)
INSERT INTO tickets (id, customer_email, customer_name, subject, original_email_body, gmail_message_id, category, sentiment, urgency, status, ai_draft_reply, ai_confidence_score, ai_suggested_action, llm_provider_used, auto_resolved) VALUES
(
    '10000000-0000-0000-0000-000000000010',
    'carlos.rivera@hotmail.com',
    'Carlos Rivera',
    'How to change my account email address',
    E'Hey! I recently changed email providers and need to update the email on my account from this address to carlos.r.new@gmail.com. Can you help me with that or point me to where I can do it myself? Thanks!',
    'msg_gmail_010',
    'other',
    'positive',
    'low',
    'auto_resolved',
    E'Hey Carlos!\n\nYou can update your email address directly from your account settings. Here''s how:\n\n1. Log in to your account at kasparro.com/account\n2. Click "Account Settings" → "Personal Information"\n3. Click the edit icon next to your email address\n4. Enter your new email (carlos.r.new@gmail.com)\n5. You''ll receive a verification link at the new address — click it to confirm\n\nThe whole process takes about 2 minutes. If you run into any issues, just reply to this email and I''ll update it manually for you.\n\nCheers,\nKasparro Support Team',
    0.96,
    'Auto-resolve: standard account help inquiry. Self-service instructions provided.',
    'grok',
    TRUE
);


-- ════════════════════════════════════════════════════════════
-- 9. SEED DATA — AUDIT LOGS (for seeded tickets)
-- ════════════════════════════════════════════════════════════

-- Ticket 1: Created + AI drafted
INSERT INTO audit_logs (ticket_id, action, performed_by, new_value, notes) VALUES
('10000000-0000-0000-0000-000000000001', 'created', NULL, '{"status": "pending", "category": "refund", "urgency": "high"}'::jsonb, 'Ingested from Gmail inbox.'),
('10000000-0000-0000-0000-000000000001', 'ai_drafted', NULL, '{"ai_confidence_score": 0.82, "llm_provider": "grok"}'::jsonb, 'AI draft generated. Confidence below auto-resolve threshold — routed to manager.');

-- Ticket 2: Created + AI drafted + Auto-resolved
INSERT INTO audit_logs (ticket_id, action, performed_by, new_value, notes) VALUES
('10000000-0000-0000-0000-000000000002', 'created', NULL, '{"status": "pending", "category": "tracking", "urgency": "low"}'::jsonb, 'Ingested from Gmail inbox.'),
('10000000-0000-0000-0000-000000000002', 'ai_drafted', NULL, '{"ai_confidence_score": 0.97, "llm_provider": "grok"}'::jsonb, 'AI draft generated. High confidence.'),
('10000000-0000-0000-0000-000000000002', 'auto_resolved', NULL, '{"status": "auto_resolved"}'::jsonb, 'Auto-resolved: low urgency + high confidence (0.97 ≥ 0.95 threshold).');

-- Ticket 3: Created + AI drafted + Approved
INSERT INTO audit_logs (ticket_id, action, performed_by, new_value, notes) VALUES
('10000000-0000-0000-0000-000000000003', 'created', NULL, '{"status": "pending", "category": "damaged_product", "urgency": "high"}'::jsonb, 'Ingested from Gmail inbox.'),
('10000000-0000-0000-0000-000000000003', 'ai_drafted', NULL, '{"ai_confidence_score": 0.88, "llm_provider": "openai"}'::jsonb, 'AI draft generated via OpenAI per manager preference.'),
('10000000-0000-0000-0000-000000000003', 'approved', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', '{"status": "approved"}'::jsonb, 'Approved by James Wilson. Replacement shipment authorized.');

-- Ticket 6: Created + AI drafted + Escalated
INSERT INTO audit_logs (ticket_id, action, performed_by, new_value, notes) VALUES
('10000000-0000-0000-0000-000000000006', 'created', NULL, '{"status": "pending", "category": "complaint", "urgency": "high"}'::jsonb, 'Ingested from Gmail inbox. Third contact from customer.'),
('10000000-0000-0000-0000-000000000006', 'ai_drafted', NULL, '{"ai_confidence_score": 0.75, "llm_provider": "openai"}'::jsonb, 'AI draft generated. Low confidence due to complex multi-issue complaint.'),
('10000000-0000-0000-0000-000000000006', 'escalated', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', '{"status": "escalated"}'::jsonb, 'Escalated to senior management. Duplicate charge + repeated contact = high risk.');

-- Ticket 9: Created + AI drafted + Auto-resolved + Approved + Sent
INSERT INTO audit_logs (ticket_id, action, performed_by, new_value, notes) VALUES
('10000000-0000-0000-0000-000000000009', 'created', NULL, '{"status": "pending", "category": "refund", "urgency": "low"}'::jsonb, 'Ingested from Gmail inbox.'),
('10000000-0000-0000-0000-000000000009', 'ai_drafted', NULL, '{"ai_confidence_score": 0.98, "llm_provider": "grok"}'::jsonb, 'AI draft generated. High confidence.'),
('10000000-0000-0000-0000-000000000009', 'auto_resolved', NULL, '{"status": "auto_resolved"}'::jsonb, 'Auto-resolved: order not yet shipped, standard cancellation.'),
('10000000-0000-0000-0000-000000000009', 'approved', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '{"status": "approved"}'::jsonb, 'Approved by Sarah Chen. Rubber-stamp approval for auto-resolved ticket.'),
('10000000-0000-0000-0000-000000000009', 'sent', NULL, '{"status": "sent"}'::jsonb, 'Reply sent to customer via Gmail API.');


-- ════════════════════════════════════════════════════════════
-- 10. SEED DATA — ANALYTICS (baseline for today)
-- ════════════════════════════════════════════════════════════
-- Note: The INSERT trigger on tickets will have already created
-- today's row. This ensures an entry exists regardless.

INSERT INTO analytics_daily (date, total_tickets, auto_resolved_count, manager_approved_count, rejected_count, avg_resolution_time_minutes, category_breakdown, sentiment_breakdown, llm_usage_breakdown)
VALUES (
    CURRENT_DATE,
    10,
    4,
    1,
    0,
    45.3,
    '{"refund": 2, "tracking": 2, "damaged_product": 1, "wrong_item": 1, "complaint": 1, "faq": 1, "policy": 1, "other": 1}'::jsonb,
    '{"angry": 2, "frustrated": 3, "neutral": 3, "positive": 2}'::jsonb,
    '{"grok": 7, "openai": 3}'::jsonb
)
ON CONFLICT (date) DO UPDATE SET
    total_tickets = EXCLUDED.total_tickets,
    auto_resolved_count = EXCLUDED.auto_resolved_count,
    manager_approved_count = EXCLUDED.manager_approved_count,
    rejected_count = EXCLUDED.rejected_count,
    avg_resolution_time_minutes = EXCLUDED.avg_resolution_time_minutes,
    category_breakdown = EXCLUDED.category_breakdown,
    sentiment_breakdown = EXCLUDED.sentiment_breakdown,
    llm_usage_breakdown = EXCLUDED.llm_usage_breakdown;


COMMIT;

-- ════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ════════════════════════════════════════════════════════════
--
-- Tables:  users, tickets, audit_logs, email_processing_queue, analytics_daily
-- Enums:   8 custom types
-- Indexes: 19 indexes (including partial and composite)
-- Triggers: 5 (3× updated_at + 2× analytics auto-update)
-- Seed:    2 managers + 10 tickets + 14 audit log entries + 1 analytics row
--
-- ════════════════════════════════════════════════════════════
