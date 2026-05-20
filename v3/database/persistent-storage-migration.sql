-- ============================================================================
-- GCSC In-Memory to Database Migration (MEDIUM Priority Fix)
-- ============================================================================
-- Converts in-memory storage in disputes.js, reviews.js, verification.js
-- to persistent PostgreSQL tables.
-- 
-- Run: psql -d gcsc_db -f v3/database/persistent-storage-migration.sql
-- ============================================================================

-- ============================================================================
-- 1. Disputes Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS disputes (
    id SERIAL PRIMARY KEY,
    escrow_id INTEGER NOT NULL REFERENCES escrow_contracts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    evidence JSONB DEFAULT '[]',
    requested_action VARCHAR(50) DEFAULT 'review',
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    -- 'open', 'under_review', 'resolved', 'rejected'
    resolution TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_escrow ON disputes(escrow_id);
CREATE INDEX IF NOT EXISTS idx_disputes_user ON disputes(user_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_created ON disputes(created_at DESC);

-- ============================================================================
-- 2. Reviews Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    reviewer_id INTEGER NOT NULL REFERENCES users(id),
    target_user_id INTEGER NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews(project_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews(target_user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);

-- ============================================================================
-- 3. Verifications Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS contractor_verifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    document_number VARCHAR(255) NOT NULL,
    document_image_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    -- 'pending', 'verified', 'rejected'
    verification_token VARCHAR(255) UNIQUE,
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verifications_user ON contractor_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_verifications_status ON contractor_verifications(status);
CREATE INDEX IF NOT EXISTS idx_verifications_token ON contractor_verifications(verification_token);

-- ============================================================================
-- 4. Constraints
-- ============================================================================

-- One review per project per reviewer
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique 
    ON reviews(project_id, reviewer_id);

-- One pending verification per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_verifications_pending_unique
    ON contractor_verifications(user_id) 
    WHERE status = 'pending';

-- ============================================================================
-- Note: Existing in-memory data is lost. This is expected for temp storage.
-- ============================================================================
