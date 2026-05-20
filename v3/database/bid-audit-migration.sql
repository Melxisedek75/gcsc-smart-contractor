-- ============================================================================
-- GCSC Bid Audit Log — Database Migration (MEDIUM-3 Fix)
-- ============================================================================
-- Adds audit logging for bid lifecycle events:
--   - Bid created
--   - Bid updated
--   - Bid accepted (→ escrow created)
--   - Bid rejected
--   - Bid withdrawn
-- ============================================================================

CREATE TABLE IF NOT EXISTS bid_audit_log (
    id SERIAL PRIMARY KEY,
    bid_id INTEGER NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    
    action VARCHAR(50) NOT NULL,
    -- 'bid_created', 'bid_updated', 'bid_accepted', 'bid_rejected', 'bid_withdrawn'
    
    performed_by INTEGER NOT NULL REFERENCES users(id),
    -- Who did the action (contractor or homeowner)
    
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    -- State before and after (e.g., 'pending' → 'accepted')
    
    details JSONB,
    -- Flexible details: { amount, timeline_days, escrow_id, etc. }
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bid_audit_bid 
    ON bid_audit_log(bid_id);

CREATE INDEX IF NOT EXISTS idx_bid_audit_project 
    ON bid_audit_log(project_id);

CREATE INDEX IF NOT EXISTS idx_bid_audit_action 
    ON bid_audit_log(action);

CREATE INDEX IF NOT EXISTS idx_bid_audit_created 
    ON bid_audit_log(created_at DESC);

-- ============================================================================
-- Done. Bid audit system ready.
-- ============================================================================
