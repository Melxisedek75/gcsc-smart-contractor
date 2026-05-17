-- ============================================================================
-- GCSC Smart Contractor v3.0 - Schema Migration (from v2.0)
-- ============================================================================
-- Run this AFTER the v2.0 schema has been applied.
-- Adds tables for: milestones, Stripe payments, escrow disputes,
-- XPR transactions, and additional columns.
--
-- Usage: psql -d gcsc_v3 -f database/schema_v3_migration.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ALTER EXISTING TABLES
-- ============================================================================

-- Add timeline_days to projects (if not exists)
DO $$ BEGIN
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS timeline_days INTEGER CHECK (timeline_days >= 1 AND timeline_days <= 3650);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Add images JSON to projects (if not exists)
DO $$ BEGIN
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS images JSON;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Add stripe_payment_intent_id to projects for tracking
DO $$ BEGIN
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(100);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ============================================================================
-- 2. MILESTONES TABLE
-- ============================================================================
-- Tracks individual milestones within an escrow contract.
CREATE TABLE IF NOT EXISTS milestones (
    id                  SERIAL          PRIMARY KEY,
    escrow_id           INTEGER         NOT NULL REFERENCES escrow_contracts(id) ON DELETE CASCADE,
    milestone_index     INTEGER         NOT NULL,
    description         TEXT            NOT NULL,
    amount              INTEGER         NOT NULL CHECK (amount >= 0),
    status              VARCHAR(20)     DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'completed', 'released', 'cancelled')),
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW(),
    UNIQUE(escrow_id, milestone_index)
);

CREATE INDEX IF NOT EXISTS idx_milestones_escrow ON milestones(escrow_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);

CREATE TRIGGER set_milestones_updated_at
    BEFORE UPDATE ON milestones
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE milestones IS
    'Individual milestones within an escrow contract. Tracked for phased payment release.';

-- ============================================================================
-- 3. STRIPE CUSTOMERS TABLE
-- ============================================================================
-- Maps GCSC users to Stripe Customer objects.
CREATE TABLE IF NOT EXISTS stripe_customers (
    id                  SERIAL          PRIMARY KEY,
    user_id             INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id  VARCHAR(100)    NOT NULL,
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_user ON stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe_id ON stripe_customers(stripe_customer_id);

COMMENT ON TABLE stripe_customers IS
    'Maps GCSC users to Stripe Customer IDs for payment processing.';

-- ============================================================================
-- 4. STRIPE PAYMENT INTENTS TABLE
-- ============================================================================
-- Tracks Stripe PaymentIntents for escrow funding.
CREATE TABLE IF NOT EXISTS stripe_payment_intents (
    id                  SERIAL          PRIMARY KEY,
    payment_intent_id   VARCHAR(100)    UNIQUE NOT NULL,
    project_id          INTEGER         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id             INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents        INTEGER         NOT NULL CHECK (amount_cents > 0),
    status              VARCHAR(30)     NOT NULL,
    milestone_id        INTEGER,
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spi_project ON stripe_payment_intents(project_id);
CREATE INDEX IF NOT EXISTS idx_spi_user ON stripe_payment_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_spi_status ON stripe_payment_intents(status);

COMMENT ON TABLE stripe_payment_intents IS
    'Tracks Stripe PaymentIntents for escrow funding transactions.';

-- ============================================================================
-- 5. STRIPE CONNECT ACCOUNTS TABLE
-- ============================================================================
-- Stores contractor Stripe Connect account IDs for payouts.
CREATE TABLE IF NOT EXISTS stripe_connect_accounts (
    id                  SERIAL          PRIMARY KEY,
    user_id             INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_account_id   VARCHAR(100)    NOT NULL,
    status              VARCHAR(20)     DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'restricted')),
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_sca_user ON stripe_connect_accounts(user_id);

COMMENT ON TABLE stripe_connect_accounts IS
    'Contractor Stripe Connect account IDs for receiving payouts.';

-- ============================================================================
-- 6. STRIPE PAYOUTS TABLE
-- ============================================================================
-- Records payouts to contractors via Stripe Connect.
CREATE TABLE IF NOT EXISTS stripe_payouts (
    id                  SERIAL          PRIMARY KEY,
    payout_id           VARCHAR(100)    NOT NULL,
    escrow_id           INTEGER         NOT NULL REFERENCES escrow_contracts(id) ON DELETE CASCADE,
    contractor_id       INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents        INTEGER         NOT NULL CHECK (amount_cents > 0),
    status              VARCHAR(30)     NOT NULL,
    created_at          TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_escrow ON stripe_payouts(escrow_id);
CREATE INDEX IF NOT EXISTS idx_sp_contractor ON stripe_payouts(contractor_id);

COMMENT ON TABLE stripe_payouts IS
    'Records contractor payouts via Stripe Connect.';

-- ============================================================================
-- 7. ESCROW DISPUTES TABLE
-- ============================================================================
-- Tracks disputes opened on escrow contracts.
CREATE TABLE IF NOT EXISTS escrow_disputes (
    id                  SERIAL          PRIMARY KEY,
    escrow_id           INTEGER         NOT NULL REFERENCES escrow_contracts(id) ON DELETE CASCADE,
    opened_by           INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason              TEXT            NOT NULL,
    evidence            JSON,
    status              VARCHAR(20)     DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved_homeowner', 'resolved_contractor', 'split', 'dismissed')),
    resolution          TEXT,
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ed_escrow ON escrow_disputes(escrow_id);
CREATE INDEX IF NOT EXISTS idx_ed_status ON escrow_disputes(status);

COMMENT ON TABLE escrow_disputes IS
    'Tracks disputes on escrow contracts for moderator review and resolution.';

-- ============================================================================
-- 8. XPR TRANSACTIONS TABLE
-- ============================================================================
-- Records transactions pushed to the XPR Network.
CREATE TABLE IF NOT EXISTS xpr_transactions (
    id                  SERIAL          PRIMARY KEY,
    tx_id               VARCHAR(64)     NOT NULL,
    account             VARCHAR(16)     NOT NULL,
    actions             JSON,
    status              VARCHAR(20)     DEFAULT 'pushed' CHECK (status IN ('pushed', 'confirmed', 'failed', 'irreversible')),
    created_at          TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xt_tx_id ON xpr_transactions(tx_id);
CREATE INDEX IF NOT EXISTS idx_xt_account ON xpr_transactions(account);

COMMENT ON TABLE xpr_transactions IS
    'Records transactions pushed to the XPR Network for audit trail.';

-- ============================================================================
-- 9. ENABLE RLS ON NEW TABLES
-- ============================================================================

ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_connect_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE xpr_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 10. SCHEMA VERSION TRACKING
-- ============================================================================

INSERT INTO schema_version (version, description)
VALUES (2, 'GCSC Smart Contractor v3.0 migration: milestones, stripe, disputes, xpr transactions')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
