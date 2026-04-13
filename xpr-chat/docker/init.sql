-- XPR Chat — PostgreSQL schema
-- Runs on first container start

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for text search

-- ─── Push tokens ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_tokens (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    xpr_account VARCHAR(12) NOT NULL,
    push_token  TEXT NOT NULL,
    platform    VARCHAR(10) CHECK (platform IN ('ios', 'android', 'web')),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (xpr_account, push_token)
);

CREATE INDEX idx_push_tokens_account ON push_tokens (xpr_account);

-- ─── Notification log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_log (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    recipient   VARCHAR(12) NOT NULL,
    type        VARCHAR(32) NOT NULL,
    payload     JSONB,
    sent_at     TIMESTAMPTZ DEFAULT NOW(),
    success     BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_notif_log_recipient ON notification_log (recipient, sent_at DESC);

-- ─── Session nonces (for XPR auth login) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_nonces (
    xpr_account VARCHAR(12) PRIMARY KEY,
    nonce       UUID NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Rate limiting state ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_state (
    key         TEXT PRIMARY KEY,
    count       INTEGER DEFAULT 0,
    window_start TIMESTAMPTZ DEFAULT NOW()
);

-- ─── User presence (online/offline) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_presence (
    xpr_account VARCHAR(12) PRIMARY KEY,
    is_online   BOOLEAN DEFAULT FALSE,
    last_seen   TIMESTAMPTZ DEFAULT NOW(),
    socket_id   TEXT
);

CREATE INDEX idx_presence_online ON user_presence (is_online) WHERE is_online = TRUE;

-- Clean up expired nonces periodically
CREATE OR REPLACE FUNCTION cleanup_expired_nonces()
RETURNS void LANGUAGE sql AS $$
    DELETE FROM auth_nonces WHERE expires_at < NOW();
$$;
