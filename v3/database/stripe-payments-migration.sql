-- ============================================================================
-- Stripe Payment Intents Table — Database Migration (MEDIUM-1 Fix)
-- ============================================================================
-- Replaces in-memory storage in stripe-payments.js with persistent database table
-- Run: psql -d gcsc_db -f stripe-payments-migration.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS stripe_payment_intents (
    id SERIAL PRIMARY KEY,
    escrow_id INTEGER NOT NULL REFERENCES escrow_contracts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    payment_intent_id VARCHAR(255) NOT NULL UNIQUE,
    amount_usd INTEGER NOT NULL, -- cents
    currency VARCHAR(3) DEFAULT 'usd',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- 'pending', 'succeeded', 'failed', 'cancelled'
    
    stripe_mode VARCHAR(20) DEFAULT 'test_mock',
    -- 'test_mock', 'test_live', 'production'
    
    client_secret VARCHAR(255),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stripe_payment_user 
    ON stripe_payment_intents(user_id);

CREATE INDEX IF NOT EXISTS idx_stripe_payment_escrow 
    ON stripe_payment_intents(escrow_id);

CREATE INDEX IF NOT EXISTS idx_stripe_payment_status 
    ON stripe_payment_intents(status);

CREATE INDEX IF NOT EXISTS idx_stripe_payment_created 
    ON stripe_payment_intents(created_at DESC);

-- Backfill: If any in-memory payments existed before deploy,
-- they are lost. This is expected — in-memory was temp only.

-- ============================================================================
-- Done. Stripe payment intents now persistent.
-- ============================================================================
