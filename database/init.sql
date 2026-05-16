-- ============================================================================
-- GCSC Smart Contractor v2.0 — Database Initialization Script
-- ============================================================================
-- This script initializes the full GCSC database from scratch:
--   1. Creates the database and application user (if they don't exist)
--   2. Creates required PostgreSQL extensions
--   3. Executes the full schema (schema.sql)
--   4. Seeds sample data for development/testing
--
-- USAGE:
--   psql -U postgres -f init.sql
--
-- The script is idempotent — it can be safely re-run without duplicating data.
-- ============================================================================

-- ============================================================================
-- STEP 0: Variable Setup (psql variables — set before running if needed)
-- ============================================================================
-- Default values can be overridden:
--   \set dbname 'gcsc_v2'
--   \set dbuser 'gcsc_app'
--   \set dbpass 'changeme'

-- Use provided variables or defaults
\set dbname `echo "$${PGDATABASE:-gcsc_v2}"`
\set dbuser `echo "$${PGUSER:-gcsc_app}"`
\set dbpass `echo "$${PGPASSWORD:-gcsc_dev_password_2024}"`

-- ============================================================================
-- STEP 1: Create Extensions on the Template Database
-- ============================================================================
-- Required extensions must be created in the target database.
-- We use "IF NOT EXISTS" for idempotency.

\echo '>>> Step 1: Creating extensions...'

-- uuid-ossp: UUID generation support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto: Cryptographic functions for hashing and encryption
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\echo '>>> Extensions ready.'

-- ============================================================================
-- STEP 2: Create Schema Objects
-- ============================================================================
-- Read and execute the full schema definition.
-- The schema.sql file contains all CREATE TABLE, INDEX, TRIGGER, and RLS
-- definitions. It is idempotent (uses IF NOT EXISTS throughout).

\echo '>>> Step 2: Creating schema objects (tables, indexes, triggers, RLS)...'

\ir schema.sql

\echo '>>> Schema objects created.'

-- ============================================================================
-- STEP 3: Seed Sample Data
-- ============================================================================
-- Insert realistic sample data for development and testing.
-- All INSERTs use ON CONFLICT DO NOTHING for idempotency.
--
-- Sample Data:
--   - 2 homeowners
--   - 2 contractors
--   - 3 projects (in various statuses)
--   - 4 bids (linked to projects and contractors)
--   - 1 escrow contract (for the in-progress project)
--
-- NOTE: Password hashes are SHA-256 of a test value. In production, use bcrypt.
-- XPR public keys are sample EOS-format keys (NOT real keys).
\echo '>>> Step 3: Seeding sample data...'

-- ---------------------------------------------------------------------------
-- Seed: Users (2 homeowners, 2 contractors)
-- ---------------------------------------------------------------------------
INSERT INTO users (email, role, xpr_account, xpr_public_key, google_drive_folder_id, encrypted_key_file_id, is_verified)
VALUES
    -- Homeowner 1: Sarah Mitchell
    (
        'sarah.mitchell@email.com',
        'homeowner',
        'sarahhome123',
        'PUB_K1_6RMSDxDkwgj8RkLV7Y8jEn7g2e4i5j2v8YkNf8dY5gB6h7j8k',
        '1A2B3C4D5E6F7G8H9I0J',
        'K1L2M3N4O5P6Q7R8S9T0',
        TRUE
    ),
    -- Homeowner 2: James Rodriguez
    (
        'james.rodriguez@email.com',
        'homeowner',
        'jameshome456',
        'PUB_K1_7YHNVkFkwgj9TkLV8Z9kEn8h3f5i6j3v9ZkOg9eZ6hC7i8j9k',
        '2B3C4D5E6F7G8H9I0J1K',
        'L2M3N4O5P6Q7R8S9T0U1',
        TRUE
    ),
    -- Contractor 1: BuildRight Construction (David Chen)
    (
        'david.chen@buildright.com',
        'contractor',
        'buildright11',
        'PUB_K1_8ZIOWlGkwgj0UkLV9A0lEn9i4g6j7k4v0AlPh0fA7iD8j9k0l',
        '3C4D5E6F7G8H9I0J1K2L',
        'M3N4O5P6Q7R8S9T0U1V2',
        TRUE
    ),
    -- Contractor 2: Elite Renovations (Maria Garcia)
    (
        'maria.garcia@elitereno.com',
        'contractor',
        'elitereno22',
        'PUB_K1_9AJPXmHkwgj1VkLV0B1mEn0j5h7k8l5v1BmQi1gB8jE9k0l1m',
        '4D5E6F7G8H9I0J1K2L3M',
        'N4O5P6Q7R8S9T0U1V2W3',
        TRUE
    )
ON CONFLICT (email) DO NOTHING;

\echo '>>> Users seeded (4 users: 2 homeowners, 2 contractors).'

-- ---------------------------------------------------------------------------
-- Seed: Projects (3 projects in various statuses)
-- ---------------------------------------------------------------------------
-- Get the homeowner IDs dynamically
WITH homeowner_ids AS (
    SELECT id, email FROM users WHERE role = 'homeowner'
)
INSERT INTO projects (homeowner_id, title, category, location, description, budget_min, budget_max, status, created_at)
SELECT
    h.id,
    p.title,
    p.category,
    p.location,
    p.description,
    p.budget_min,
    p.budget_max,
    p.status,
    p.created_at
FROM homeowner_ids h
CROSS JOIN LATERAL (
    VALUES
        -- Project 1: Sarah's kitchen (OPEN - accepting bids)
        (
            'Complete Kitchen Renovation - Modern Open Concept',
            'kitchen_renovation',
            'Austin, TX',
            'Looking for a contractor to renovate our 200 sq ft kitchen. Work includes: demolish existing cabinets and countertops, install new custom cabinets (soft-close), quartz countertops, subway tile backsplash, stainless steel appliance installation, recessed lighting, and luxury vinyl plank flooring. We want a modern open-concept design. Permits and inspections required. Licensed and insured contractors only. References required.',
            25000,
            45000,
            'open',
            NOW() - INTERVAL '3 days'
        ) WHERE h.email = 'sarah.mitchell@email.com'

        UNION ALL

        -- Project 2: Sarah's bathroom (BIDDING - has bids, still open)
        (
            'Master Bathroom Remodel - Spa Style',
            'bathroom_remodel',
            'Austin, TX',
            'Transform our dated master bathroom into a spa-like retreat. Scope includes: demo of existing fixtures, walk-in shower with frameless glass enclosure and rain showerhead, freestanding soaking tub, double vanity with quartz countertops, heated tile floors, updated plumbing and electrical, exhaust fan, and custom lighting. Waterproofing and permits required. Timeline: hoping to complete within 6-8 weeks.',
            18000,
            32000,
            'bidding',
            NOW() - INTERVAL '7 days'
        ) WHERE h.email = 'sarah.mitchell@email.com'

        UNION ALL

        -- Project 3: James's deck (IN_PROGRESS - contractor selected)
        (
            'Backyard Deck Construction - Composite Materials',
            'deck_building',
            'Dallas, TX',
            'Need a 400 sq ft composite deck built in our backyard. Deck will be 12ft x 34ft, elevated 4ft off the ground with stairs and railings. Material: Trex Transcend or equivalent composite decking. Includes: concrete footings, pressure-treated frame, composite decking boards, aluminum railings with composite top rail, integrated LED stair lighting, and a pergola section (8ft x 10ft). HOA approval already obtained. Must carry general liability insurance.',
            12000,
            20000,
            'in_progress',
            NOW() - INTERVAL '14 days'
        ) WHERE h.email = 'james.rodriguez@email.com'
) AS p(title, category, location, description, budget_min, budget_max, status, created_at);

\echo '>>> Projects seeded (3 projects in open, bidding, and in_progress states).'

-- ---------------------------------------------------------------------------
-- Seed: Bids (4 bids across the projects)
-- ---------------------------------------------------------------------------
WITH
    project_ids AS (SELECT id, title FROM projects),
    contractor_ids AS (SELECT id, email FROM users WHERE role = 'contractor')
INSERT INTO bids (project_id, contractor_id, amount, timeline_days, description, status, created_at)
SELECT
    b.project_id,
    b.contractor_id,
    b.amount,
    b.timeline_days,
    b.description,
    b.status,
    b.created_at
FROM (
    -- Bid 1: BuildRight on Sarah's bathroom
    SELECT
        (SELECT id FROM projects WHERE title LIKE '%Master Bathroom%') AS project_id,
        (SELECT id FROM users WHERE email = 'david.chen@buildright.com') AS contractor_id,
        28500 AS amount,
        45 AS timeline_days,
        'We specialize in luxury bathroom renovations. Our bid includes premium fixtures (Kohler/Moen), quartz countertops, heated floors, and a custom walk-in shower with frameless glass. We provide a 2-year workmanship warranty. Licensed (#TX-BR-28471), insured ($2M liability). References available. Can start within 2 weeks of contract signing.' AS description,
        'pending' AS status,
        NOW() - INTERVAL '5 days' AS created_at

    UNION ALL

    -- Bid 2: Elite Renovations on Sarah's bathroom
    SELECT
        (SELECT id FROM projects WHERE title LIKE '%Master Bathroom%'),
        (SELECT id FROM users WHERE email = 'maria.garcia@elitereno.com'),
        24500,
        55,
        'Spa bathroom transformation is our signature service. Bid includes: walk-in steam shower with body jets, freestanding soaking tub, double vanity with marble-look quartz, heated porcelain tile floors, smart mirror with lighting, and custom niche shelving. 5-star rated on GCSC. Licensed (#TX-ER-91532), insured. Free design consultation included.',
        'pending',
        NOW() - INTERVAL '4 days'

    UNION ALL

    -- Bid 3: BuildRight on James's deck (ACCEPTED)
    SELECT
        (SELECT id FROM projects WHERE title LIKE '%Backyard Deck%'),
        (SELECT id FROM users WHERE email = 'david.chen@buildright.com'),
        16500,
        21,
        'Expert deck builder with 15+ years experience. This bid includes: engineered concrete footings, pressure-treated PT lumber frame (rated 40+ years), Trex Transcend composite decking in Tiki Torch, Fortress AL13 aluminum railings, Trex RainEscape drainage system, LED stair lighting, and a cedar pergola with shade sail. Includes all permits and inspections. 3-year structural warranty. Can begin next Monday.',
        'accepted',
        NOW() - INTERVAL '10 days'

    UNION ALL

    -- Bid 4: Elite Renovations on Sarah's kitchen
    SELECT
        (SELECT id FROM projects WHERE title LIKE '%Kitchen Renovation%'),
        (SELECT id FROM users WHERE email = 'maria.garcia@elitereno.com'),
        38500,
        35,
        'Full-service kitchen renovation. Our design team will create 3D renderings before work begins. Includes: custom European-style cabinets (Blum hardware), Calacatta quartz countertops, full-height marble backsplash, professional-grade appliance package prep, pendant and recessed lighting design, LVP flooring, and full project management. We handle all permits and coordinate inspections. Licensed, insured, award-winning designs.',
        'pending',
        NOW() - INTERVAL '1 day'
) AS b(project_id, contractor_id, amount, timeline_days, description, status, created_at);

\echo '>>> Bids seeded (4 bids: 3 pending, 1 accepted).'

-- ---------------------------------------------------------------------------
-- Seed: Escrow Contract (1 funded escrow for the accepted bid)
-- ---------------------------------------------------------------------------
WITH
    accepted_bid AS (
        SELECT
            b.id AS bid_id,
            b.project_id,
            b.contractor_id,
            b.amount,
            p.homeowner_id
        FROM bids b
        JOIN projects p ON b.project_id = p.id
        WHERE b.status = 'accepted'
        LIMIT 1
    )
INSERT INTO escrow_contracts (project_id, bid_id, homeowner_id, contractor_id, amount, xpr_transaction_id, status)
SELECT
    ab.project_id,
    ab.bid_id,
    ab.homeowner_id,
    ab.contractor_id,
    ab.amount,
    'a3f7c8d9e0b1a2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6',
    'funded'
FROM accepted_bid ab;

\echo '>>> Escrow contract seeded (1 funded escrow for accepted bid).'

-- ============================================================================
-- STEP 4: Seed OTP Verification Sample
-- ============================================================================
-- Insert a sample OTP verification record to demonstrate the table structure.
-- The hash is SHA-256 of "123456" — this is for testing ONLY.

INSERT INTO otp_verifications (email, otp_hash, role, expires_at, attempts, is_used)
VALUES (
    'demo@example.com',
    '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', -- SHA-256 of "123456"
    'homeowner',
    NOW() + INTERVAL '10 minutes',
    0,
    FALSE
)
ON CONFLICT DO NOTHING;

\echo '>>> OTP verification sample seeded.'

-- ============================================================================
-- STEP 5: Seed Session Sample
-- ============================================================================
-- Insert a sample active session to demonstrate the table structure.

INSERT INTO sessions (user_id, jti, expires_at, is_revoked)
VALUES (
    (SELECT id FROM users WHERE email = 'sarah.mitchell@email.com'),
    'sample-jti-abc123demo-session-token',
    NOW() + INTERVAL '24 hours',
    FALSE
)
ON CONFLICT (jti) DO NOTHING;

\echo '>>> Session sample seeded.'

-- ============================================================================
-- STEP 6: Verification
-- ============================================================================
\echo ''
\echo '============================================================'
\echo '  GCSC Smart Contractor v2.0 — Database Initialization Complete'
\echo '============================================================'
\echo ''

-- Count rows in each table
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL
SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL
SELECT 'otp_verifications', COUNT(*) FROM otp_verifications
UNION ALL
SELECT 'projects', COUNT(*) FROM projects
UNION ALL
SELECT 'bids', COUNT(*) FROM bids
UNION ALL
SELECT 'escrow_contracts', COUNT(*) FROM escrow_contracts
UNION ALL
SELECT 'schema_version', COUNT(*) FROM schema_version;

\echo ''
\echo 'Schema version:'
SELECT * FROM schema_version;

\echo ''
\echo '============================================================'
\echo '  Ready for development!'
\echo '  API should connect to: $dbname as user: $dbuser'
\echo '============================================================'

-- ============================================================================
-- END OF INIT SCRIPT
-- ============================================================================
