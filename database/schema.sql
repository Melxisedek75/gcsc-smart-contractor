-- ============================================================================
-- GCSC Smart Contractor v2.0 - PostgreSQL Database Schema
-- ============================================================================
-- A secure, normalized schema for a P2P construction marketplace.
-- Features: JWT session management, XPR blockchain integration, escrow support,
-- role-based access, and comprehensive audit timestamps.
--
-- Security Principles:
--   - No sensitive cryptographic material stored in the database.
--     Encrypted private keys are stored on Google Drive; only file references
--     are kept here.
--   - All status and role fields use CHECK constraints to prevent invalid data.
--   - Foreign keys use ON DELETE CASCADE where ownership semantics apply.
--   - TIMESTAMPTZ is used throughout for timezone-safe audit trails.
--   - Indexes are placed on all lookup-heavy columns.
-- ============================================================================

-- Enable UUID extension for potential future use (e.g., public IDs)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for cryptographic functions if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. USERS TABLE
-- ============================================================================
-- Core identity table for both homeowners and contractors.
-- Authentication is handled via JWT (sessions table). XPR public keys are
-- stored for blockchain escrow interactions. No private keys are stored here.
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    -- Primary key: internal auto-incrementing ID (never exposed to clients)
    id                  SERIAL          PRIMARY KEY,

    -- Email address used for login and OTP verification.
    -- Max 254 chars per RFC 5321, must be unique and non-null.
    email               VARCHAR(254)    UNIQUE NOT NULL,

    -- Role discriminator: either 'homeowner' or 'contractor'.
    -- CHECK constraint ensures data integrity at the database level.
    role                VARCHAR(20)     NOT NULL CHECK (role IN ('homeowner', 'contractor')),

    -- XPR blockchain account name (12 characters max, chars a-z and 1-5).
    -- This is the user's on-chain identity for escrow transactions.
    xpr_account         VARCHAR(16)     UNIQUE NOT NULL,

    -- XPR/EOS-format public key (53 chars). Used to verify blockchain
    -- signatures. The corresponding private key is encrypted and stored on
    -- Google Drive — it is NEVER stored in this database.
    xpr_public_key      VARCHAR(53)     NOT NULL,

    -- Reference to the user's Google Drive folder where their encrypted
    -- private key file is stored. Managed by the backend Google Drive API.
    google_drive_folder_id  VARCHAR(100),

    -- File ID of the encrypted private key blob within the user's Google
    -- Drive folder. The file content is AES-encrypted before upload.
    encrypted_key_file_id   VARCHAR(100),

    -- Email verification status. Set to TRUE after successful OTP validation.
    is_verified         BOOLEAN         DEFAULT FALSE,

    -- Audit timestamps: creation and last-update time in UTC.
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW()
);

-- Add table comment for documentation
COMMENT ON TABLE users IS
    'Core user identities for the GCSC marketplace. Stores public blockchain data only; private keys live encrypted on Google Drive.';

COMMENT ON COLUMN users.id IS
    'Internal surrogate key. Never exposed to API clients.';
COMMENT ON COLUMN users.email IS
    'Unique email address for login and communications. Max 254 chars per RFC 5321.';
COMMENT ON COLUMN users.role IS
    'User role: homeowner (posts projects) or contractor (places bids). Enforced by CHECK constraint.';
COMMENT ON COLUMN users.xpr_account IS
    'XPR blockchain account name (up to 12 chars: a-z, 1-5). Used for escrow smart contract interactions.';
COMMENT ON COLUMN users.xpr_public_key IS
    'EOS-format public key (53 characters). Used to verify on-chain signatures. Private key is NOT stored here.';
COMMENT ON COLUMN users.google_drive_folder_id IS
    'Google Drive folder ID where user-specific files (including encrypted key) are stored.';
COMMENT ON COLUMN users.encrypted_key_file_id IS
    'Google Drive file ID of the AES-encrypted private key. File is decrypted only in-memory during active sessions.';
COMMENT ON COLUMN users.is_verified IS
    'Whether the user has completed email OTP verification. Must be TRUE to create projects or place bids.';

-- ============================================================================
-- 2. SESSIONS TABLE
-- ============================================================================
-- JWT session tracking for token blacklisting and multi-device logout.
-- Each row represents an active (or recently-revoked) JWT token instance.
-- The jti (JWT ID) claim allows precise revocation of individual tokens.
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    -- Primary key: internal auto-incrementing ID
    id                  SERIAL          PRIMARY KEY,

    -- Reference to the owning user. CASCADE: deleting a user invalidates
    -- all their sessions automatically.
    user_id             INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- JWT ID (jti claim): a unique UUID or random string generated at token
    -- creation. Indexed for fast token-validation lookups.
    jti                 VARCHAR(64)     UNIQUE NOT NULL,

    -- Token expiration timestamp. After this time, the token is considered
    -- invalid regardless of the is_revoked flag.
    expires_at          TIMESTAMPTZ     NOT NULL,

    -- Row creation timestamp (not the same as token issue time, though close).
    created_at          TIMESTAMPTZ     DEFAULT NOW(),

    -- Revocation flag. Set to TRUE when user logs out or token is invalidated
    -- by an admin/security event. Checked on every authenticated request.
    is_revoked          BOOLEAN         DEFAULT FALSE
);

COMMENT ON TABLE sessions IS
    'JWT session tracking for secure authentication. Enables per-token revocation and multi-device session management.';

COMMENT ON COLUMN sessions.jti IS
    'JWT ID (jti claim) — unique per token. Used for blacklist checks on every API request.';
COMMENT ON COLUMN sessions.expires_at IS
    'Token expiry time. Tokens past this time are rejected even if not explicitly revoked.';
COMMENT ON COLUMN sessions.is_revoked IS
    'Explicit revocation flag. Set TRUE on logout or security breach. Prevents token replay.';

-- ============================================================================
-- 3. OTP VERIFICATIONS TABLE
-- ============================================================================
-- Stores hashed One-Time Passwords for email verification and password-reset
-- flows. The OTP itself is hashed (not plaintext) before storage.
-- Each row represents a single OTP delivery attempt.
-- ============================================================================
CREATE TABLE IF NOT EXISTS otp_verifications (
    -- Primary key: internal auto-incrementing ID
    id                  SERIAL          PRIMARY KEY,

    -- Email address the OTP was sent to. Not a foreign key because the user
    -- may not exist yet (registration flow).
    email               VARCHAR(254)    NOT NULL,

    -- Hashed OTP value. The plaintext OTP is sent to the user via email;
    -- only its hash (SHA-256 or bcrypt) is stored here for verification.
    -- Never store plaintext OTPs.
    otp_hash            VARCHAR(64)     NOT NULL,

    -- Role the user is registering as. Required to pre-populate the users
    -- table after successful verification.
    role                VARCHAR(20)     NOT NULL,

    -- Expiration timestamp. OTPs are short-lived (typically 10 minutes).
    expires_at          TIMESTAMPTZ     NOT NULL,

    -- Number of failed verification attempts. After a threshold (e.g., 3),
    -- the OTP is considered invalid even before expiry.
    attempts            INTEGER         DEFAULT 0 CHECK (attempts >= 0),

    -- Whether this OTP has already been successfully used.
    is_used             BOOLEAN         DEFAULT FALSE,

    -- Audit timestamp
    created_at          TIMESTAMPTZ     DEFAULT NOW()
);

COMMENT ON TABLE otp_verifications IS
    'Hashed OTP storage for email verification and password reset. OTPs are single-use and time-bound.';

COMMENT ON COLUMN otp_verifications.otp_hash IS
    'SHA-256 hash of the OTP. Plaintext OTP is never stored. Verified by comparing hashes.';
COMMENT ON COLUMN otp_verifications.attempts IS
    'Failed verification attempts. Enforced max via application logic to prevent brute-force.';
COMMENT ON COLUMN otp_verifications.is_used IS
    'TRUE once the OTP has been successfully consumed. Prevents replay attacks.';

-- ============================================================================
-- 4. PROJECTS TABLE
-- ============================================================================
-- Construction projects posted by homeowners. Contractors browse open projects
-- and submit bids. The status field drives the project lifecycle.
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
    -- Primary key: internal auto-incrementing ID
    id                  SERIAL          PRIMARY KEY,

    -- Reference to the homeowner who posted this project.
    -- CASCADE: if the homeowner account is deleted, their projects are removed.
    homeowner_id        INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Project title displayed in listings and search results.
    title               VARCHAR(200)    NOT NULL,

    -- Construction category (e.g., 'kitchen_renovation', 'roofing', 'plumbing').
    -- Free-form VARCHAR allows extensibility; application layer can normalize.
    category            VARCHAR(50)     NOT NULL,

    -- Human-readable project location (city, state, or full address).
    location            VARCHAR(200)    NOT NULL,

    -- Detailed project description. TEXT type allows long-form content.
    description         TEXT            NOT NULL,

    -- Budget range in USD (whole dollars, no cents). NULL means unspecified.
    -- Using INTEGER (cents) would be more precise, but the spec calls for USD.
    budget_min          INTEGER         CHECK (budget_min >= 0),
    budget_max          INTEGER         CHECK (budget_max >= 0),

    -- Project lifecycle status. CHECK constraint enforces valid state transitions
    -- at the application layer; the database ensures only valid values are stored.
    status              VARCHAR(20)     DEFAULT 'open'
                                        CHECK (status IN ('open', 'bidding', 'in_progress', 'completed', 'cancelled')),

    -- Audit timestamps
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW()
);

COMMENT ON TABLE projects IS
    'Construction projects posted by homeowners. Lifecycle managed by status field: open -> bidding -> in_progress -> completed/cancelled.';

COMMENT ON COLUMN projects.homeowner_id IS
    'Foreign key to the posting homeowner. CASCADE delete removes projects when the user is deleted.';
COMMENT ON COLUMN projects.budget_min IS
    'Minimum budget in USD. NULL if not specified by homeowner. Must be non-negative.';
COMMENT ON COLUMN projects.budget_max IS
    'Maximum budget in USD. Must be >= budget_min if both are specified (enforced at app layer).';
COMMENT ON COLUMN projects.status IS
    'Project lifecycle: open (new), bidding (contractors bidding), in_progress (contractor selected), completed, or cancelled.';

-- ============================================================================
-- 5. BIDS TABLE
-- ============================================================================
-- Bids placed by contractors on projects. A contractor can place at most one
-- active bid per project (enforced by UNIQUE partial index below).
-- The status field tracks whether a bid is pending, accepted, rejected, or withdrawn.
-- ============================================================================
CREATE TABLE IF NOT EXISTS bids (
    -- Primary key: internal auto-incrementing ID
    id                  SERIAL          PRIMARY KEY,

    -- Reference to the project being bid on. CASCADE: project deletion removes
    -- all associated bids.
    project_id          INTEGER         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Reference to the contractor placing the bid. CASCADE: contractor account
    -- deletion removes their bids.
    contractor_id       INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Bid amount in USD (whole dollars). Must be positive.
    amount              INTEGER         NOT NULL CHECK (amount > 0),

    -- Estimated timeline to completion in calendar days. Must be positive.
    timeline_days       INTEGER         NOT NULL CHECK (timeline_days > 0),

    -- Optional detailed description of the bid (scope of work, materials, etc.)
    description         TEXT,

    -- Bid status. 'accepted' status triggers escrow contract creation.
    status              VARCHAR(20)     DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),

    -- Audit timestamps
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW()
);

COMMENT ON TABLE bids IS
    'Contractor bids on construction projects. One active bid per contractor per project enforced at app layer.';

COMMENT ON COLUMN bids.project_id IS
    'The project this bid is for. CASCADE delete removes bids when the project is deleted.';
COMMENT ON COLUMN bids.contractor_id IS
    'The contractor submitting this bid. Must reference a user with role = contractor.';
COMMENT ON COLUMN bids.amount IS
    'Total bid amount in USD. Must be greater than zero.';
COMMENT ON COLUMN bids.timeline_days IS
    'Estimated project duration in days. Must be greater than zero.';
COMMENT ON COLUMN bids.status IS
    'pending (awaiting decision), accepted (triggers escrow), rejected (by homeowner), withdrawn (by contractor).';

-- ============================================================================
-- 6. ESCROW CONTRACTS TABLE
-- ============================================================================
-- On-chain escrow records linking accepted bids to funded XPR blockchain escrow
-- contracts. This table bridges off-chain project/bid data with on-chain
-- escrow smart contract state.
-- ============================================================================
CREATE TABLE IF NOT EXISTS escrow_contracts (
    -- Primary key: internal auto-incrementing ID
    id                  SERIAL          PRIMARY KEY,

    -- Reference to the parent project. CASCADE: project deletion removes
    -- the escrow record.
    project_id          INTEGER         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Reference to the accepted bid that triggered this escrow. CASCADE:
    -- bid deletion removes the escrow record.
    bid_id              INTEGER         NOT NULL REFERENCES bids(id) ON DELETE CASCADE,

    -- Denormalized reference to the homeowner for quick lookup.
    -- CASCADE: homeowner deletion removes escrow records.
    homeowner_id        INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Denormalized reference to the contractor for quick lookup.
    -- CASCADE: contractor deletion removes escrow records.
    contractor_id       INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Escrow amount in USD. Matches the accepted bid amount at creation.
    amount              INTEGER         NOT NULL CHECK (amount > 0),

    -- XPR blockchain transaction ID for the escrow funding transaction.
    -- NULL until the homeowner funds the escrow on-chain.
    xpr_transaction_id  VARCHAR(64),

    -- Escrow lifecycle status. Mirrors on-chain escrow smart contract state.
    status              VARCHAR(20)     DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'funded', 'released', 'disputed', 'refunded')),

    -- Audit timestamps
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW()
);

COMMENT ON TABLE escrow_contracts IS
    'XPR blockchain escrow records. Bridges off-chain project data with on-chain escrow smart contract state.';

COMMENT ON COLUMN escrow_contracts.project_id IS
    'The project this escrow is for. CASCADE delete removes escrow when the project is deleted.';
COMMENT ON COLUMN escrow_contracts.bid_id IS
    'The accepted bid that triggered this escrow. UNIQUE constraint ensures one escrow per bid.';
COMMENT ON COLUMN escrow_contracts.xpr_transaction_id IS
    'XPR blockchain transaction ID for the escrow funding tx. NULL until funded.';
COMMENT ON COLUMN escrow_contracts.status IS
    'pending (created, awaiting funding), funded (homeowner deposited), released (work completed, paid), disputed, refunded.';

-- ============================================================================
-- UNIQUE CONSTRAINTS
-- ============================================================================

-- One escrow contract per bid (a bid can only be escrowed once)
ALTER TABLE escrow_contracts
    ADD CONSTRAINT unique_bid_escrow UNIQUE (bid_id);

-- One active escrow per project at a time (only one bid accepted per project)
ALTER TABLE escrow_contracts
    ADD CONSTRAINT unique_project_escrow UNIQUE (project_id);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- All indexes are placed on columns used in WHERE, JOIN, and ORDER BY clauses.
-- Using B-tree (default) for equality and range queries.

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_xpr_account ON users(xpr_account);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Sessions table indexes
CREATE INDEX IF NOT EXISTS idx_sessions_jti ON sessions(jti);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- OTP verifications indexes
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at);

-- Projects table indexes
CREATE INDEX IF NOT EXISTS idx_projects_homeowner ON projects(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at);

-- Bids table indexes
CREATE INDEX IF NOT EXISTS idx_bids_project ON bids(project_id);
CREATE INDEX IF NOT EXISTS idx_bids_contractor ON bids(contractor_id);
CREATE INDEX IF NOT EXISTS idx_bids_status ON bids(status);

-- Escrow contracts table indexes
CREATE INDEX IF NOT EXISTS idx_escrow_project ON escrow_contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow_contracts(status);
CREATE INDEX IF NOT EXISTS idx_escrow_homeowner ON escrow_contracts(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_escrow_contractor ON escrow_contracts(contractor_id);

-- ============================================================================
-- TRIGGERS: Auto-update updated_at timestamp
-- ============================================================================
-- A single reusable function that sets updated_at = NOW() on row update.

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to all tables with an updated_at column
CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_bids_updated_at
    BEFORE UPDATE ON bids
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_escrow_updated_at
    BEFORE UPDATE ON escrow_contracts
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Enable RLS on all tables for defense-in-depth. Application-layer access
-- control is primary; RLS acts as a safety net if queries are miswritten.
-- Policies are permissive (allow all) by default when RLS is first enabled
-- because the app uses a service-account connection model.

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Enable RLS on sessions table
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Enable RLS on otp_verifications table
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;

-- Enable RLS on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Enable RLS on bids table
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

-- Enable RLS on escrow_contracts table
ALTER TABLE escrow_contracts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SCHEMA VERSION TRACKING
-- ============================================================================
-- Simple table to track which schema version is installed.
-- Useful for migration tooling and debugging.

CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER         PRIMARY KEY,
    applied_at  TIMESTAMPTZ     DEFAULT NOW(),
    description TEXT
);

-- Insert current schema version
INSERT INTO schema_version (version, description)
VALUES (1, 'GCSC Smart Contractor v2.0 initial schema')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
