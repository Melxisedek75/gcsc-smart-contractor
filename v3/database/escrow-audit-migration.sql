-- ============================================================================
-- GCSC Escrow Audit & Amount Tracking — Database Migration
-- ============================================================================
-- Apply this migration to add:
--   1. milestone_audit_log table
--   2. released_amount column to milestones
--   3. Indexes for performance
--
-- Run: psql -d gcsc_db -f escrow-audit-migration.sql
-- ============================================================================

-- ============================================================================
-- 1. Audit Log Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS milestone_audit_log (
    id SERIAL PRIMARY KEY,
    escrow_id INTEGER NOT NULL REFERENCES escrow_contracts(id) ON DELETE CASCADE,
    milestone_index INTEGER NOT NULL DEFAULT -1,
    -- -1 means escrow-level action (not specific milestone)
    
    action VARCHAR(50) NOT NULL,
    -- 'completed', 'approved', 'dispute_opened', 'escrow_completed', etc.
    
    performed_by INTEGER NOT NULL REFERENCES users(id),
    -- Who did the action
    
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    -- State before and after
    
    notes TEXT,
    -- Human-readable details
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 2. Indexes for Audit Log
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_escrow 
    ON milestone_audit_log(escrow_id);

CREATE INDEX IF NOT EXISTS idx_audit_milestone 
    ON milestone_audit_log(escrow_id, milestone_index);

CREATE INDEX IF NOT EXISTS idx_audit_action 
    ON milestone_audit_log(action);

CREATE INDEX IF NOT EXISTS idx_audit_created 
    ON milestone_audit_log(created_at DESC);

-- ============================================================================
-- 3. Add released_amount to milestones
-- ============================================================================

ALTER TABLE milestones 
    ADD COLUMN IF NOT EXISTS released_amount INTEGER DEFAULT 0;

-- ============================================================================
-- 4. Backfill released_amount for already-released milestones
-- ============================================================================

UPDATE milestones 
SET released_amount = amount 
WHERE status = 'released' AND released_amount = 0;

-- ============================================================================
-- 5. Verify
-- ============================================================================

SELECT 
    'milestone_audit_log table' as check_item,
    COUNT(*) as row_count 
FROM milestone_audit_log;

SELECT 
    'milestones with released_amount' as check_item,
    COUNT(*) as count,
    SUM(released_amount) as total_released
FROM milestones 
WHERE released_amount > 0;

-- ============================================================================
-- Done. Escrow audit system ready.
-- ============================================================================
