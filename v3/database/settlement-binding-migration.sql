-- ============================================================================
-- GCSC Settlement Binding — Database Migration
-- ============================================================================
-- Adds per-milestone tracking + double-payout protection for the milestone
-- release -> Stripe Connect transfer binding (services/settlement.js).
--
-- Run: psql -d gcsc_db -f settlement-binding-migration.sql
-- ============================================================================

-- 1. Track which milestone a payout belongs to (NULL = legacy/whole-escrow payout)
ALTER TABLE stripe_payouts
    ADD COLUMN IF NOT EXISTS milestone_index INTEGER;

-- 2. Prevent two payouts for the same milestone (DB-level idempotency).
--    Partial index so legacy NULL rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payout_per_milestone
    ON stripe_payouts (escrow_id, milestone_index)
    WHERE milestone_index IS NOT NULL;

-- ============================================================================
-- Done. Settlement binding tracking ready.
-- ============================================================================
