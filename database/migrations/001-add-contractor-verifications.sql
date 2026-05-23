-- Migration: Add contractor_verifications table
-- Date: 2026-05-22
-- For existing databases (schema already initialized)

CREATE TABLE IF NOT EXISTS contractor_verifications (
    id                  SERIAL          PRIMARY KEY,
    user_id             INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name           VARCHAR(255),
    document_type       VARCHAR(50)     CHECK (document_type IN ('general','specialty','electrical','plumbing')),
    document_number     VARCHAR(50)     NOT NULL,
    bond_amount         INTEGER         CHECK (bond_amount > 0),
    insurance_provider  VARCHAR(255),
    insurance_policy    VARCHAR(100),
    status              VARCHAR(20)     DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'verified', 'rejected')),
    verified_by         INTEGER         REFERENCES users(id),
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW()
);

-- Remove partial unique if it exists (for migration safety)
-- Note: this creates a regular index, not a unique constraint, to avoid conflicts
-- with existing data. Apply the unique constraint manually after data cleanup.
CREATE INDEX IF NOT EXISTS idx_contractor_verifications_user ON contractor_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_contractor_verifications_status ON contractor_verifications(status);

COMMENT ON TABLE contractor_verifications IS
    'Contractor license and insurance verification submissions. Admin approval required.';
