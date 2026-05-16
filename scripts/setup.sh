#!/usr/bin/env bash
# =============================================================================
# GCSC Smart Contractor v2.0 — Development Environment Setup Script
# =============================================================================
# One-command setup for new developers.
#   1. Validates prerequisites (Node.js, npm, Docker)
#   2. Copies .env.template to .env
#   3. Installs npm dependencies
#   4. Starts PostgreSQL via Docker
#   5. Initializes the database schema
#   6. Seeds sample data
#   7. Prints next steps
#
# Usage:
#   chmod +x scripts/setup.sh
#   ./scripts/setup.sh
#
# Requirements:
#   - Docker Engine 20.10+
#   - Docker Compose v2+
#   - Node.js 18+ (LTS recommended: 20.x)
#   - npm 9+
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colors for output
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
log_info()  { echo -e "${BLUE}[INFO]${RESET}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${RESET}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${RESET}  $1"; }
log_err()   { echo -e "${RED}[ERROR]${RESET} $1"; }
log_step()  { echo -e "${BOLD}${CYAN}▶ $1${RESET}"; }

# ---------------------------------------------------------------------------
# Print banner
# ---------------------------------------------------------------------------
echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════════════════════════════╗"
echo "  ║     GCSC Smart Contractor v2.0 — Development Setup          ║"
echo "  ║                                                               ║"
echo "  ║  Secure P2P Construction Marketplace — Local Environment      ║"
echo "  ╚═══════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# ---------------------------------------------------------------------------
# Step 1: Check prerequisites
# ---------------------------------------------------------------------------
log_step "Step 1/8 — Checking prerequisites"

# Check Docker
if ! command -v docker &> /dev/null; then
    log_err "Docker is not installed."
    echo "  Install: https://docs.docker.com/get-docker/"
    exit 1
fi
DOCKER_VERSION=$(docker --version | head -1)
log_ok "Docker found: ${DOCKER_VERSION}"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    log_err "Docker Compose is not installed."
    echo "  Install: https://docs.docker.com/compose/install/"
    exit 1
fi
log_ok "Docker Compose found"

# Check Node.js
if ! command -v node &> /dev/null; then
    log_err "Node.js is not installed."
    echo "  Install: https://nodejs.org/ (Recommended: LTS v20+)"
    exit 1
fi
NODE_VERSION=$(node --version)
log_ok "Node.js found: ${NODE_VERSION}"

# Check Node version >= 18
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
    log_warn "Node.js ${NODE_VERSION} detected. Recommended: v18+ (LTS v20+)"
    echo "  Upgrade: https://nodejs.org/"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    log_err "npm is not installed."
    exit 1
fi
NPM_VERSION=$(npm --version)
log_ok "npm found: v${NPM_VERSION}"

# ---------------------------------------------------------------------------
# Step 2: Verify project structure
# ---------------------------------------------------------------------------
log_step "Step 2/8 — Verifying project structure"

if [ ! -f "package.json" ]; then
    log_err "package.json not found. Are you in the project root directory?"
    echo "  Expected: /path/to/gcsc-smart-contractor/"
    echo "  Current:  $(pwd)"
    exit 1
fi
log_ok "package.json found"

if [ ! -f "server.js" ]; then
    log_err "server.js not found. Are you in the project root directory?"
    exit 1
fi
log_ok "server.js found"

if [ ! -f ".env.template" ]; then
    log_err ".env.template not found. Cannot create .env file."
    exit 1
fi
log_ok ".env.template found"

# ---------------------------------------------------------------------------
# Step 3: Create .env file
# ---------------------------------------------------------------------------
log_step "Step 3/8 — Setting up environment configuration"

if [ -f ".env" ]; then
    log_warn ".env file already exists. Skipping copy."
    echo "  Review your .env and ensure all values are configured."
else
    cp .env.template .env
    log_ok ".env created from template"
    echo "  ${YELLOW}⚠ IMPORTANT:${RESET} Edit .env and configure all secrets:"
    echo "    - JWT_SECRET (generate with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\")"
    echo "    - ENCRYPTION_SECRET (generate with: node -e \"console.log(require('crypto').randomBytes(64).toString('base64'))\")"
    echo "    - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (from Google Cloud Console)"
    echo "    - GOOGLE_REFRESH_TOKEN (obtain via /dev/oauth/start in development mode)"
    echo ""
    read -p "  Press Enter to continue after reviewing .env (or Ctrl+C to exit)..."
fi

# ---------------------------------------------------------------------------
# Step 4: Install npm dependencies
# ---------------------------------------------------------------------------
log_step "Step 4/8 — Installing npm dependencies"

npm install
log_ok "npm dependencies installed"

# ---------------------------------------------------------------------------
# Step 5: Create database directory and init files if missing
# ---------------------------------------------------------------------------
log_step "Step 5/8 — Preparing database initialization"

mkdir -p database

if [ ! -f "database/schema.sql" ]; then
    log_warn "database/schema.sql not found. Creating placeholder."
    cat > database/schema.sql << 'SQL'
-- GCSC Smart Contractor — Database Schema
-- Run automatically on first PostgreSQL container startup

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    role        VARCHAR(20) NOT NULL CHECK (role IN ('homeowner', 'contractor')),
    account     VARCHAR(13) UNIQUE NOT NULL,
    public_key  TEXT NOT NULL,
    encrypted_private_key_data JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_account ON users(account);

-- OTP verifications table (temporary, can be cleaned periodically)
CREATE TABLE IF NOT EXISTS otp_verifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       VARCHAR(255) NOT NULL,
    otp_code    VARCHAR(10) NOT NULL,
    role        VARCHAR(20) NOT NULL,
    purpose     VARCHAR(20) DEFAULT 'registration',
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_verifications(expires_at);

-- JWT token blacklist (for logout)
CREATE TABLE IF NOT EXISTS token_blacklist (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jti         VARCHAR(255) UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blacklist_jti ON token_blacklist(jti);
CREATE INDEX IF NOT EXISTS idx_blacklist_expires ON token_blacklist(expires_at);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id  VARCHAR(255) NOT NULL,
    email       VARCHAR(255),
    action      VARCHAR(50) NOT NULL,
    ip_address  INET,
    user_agent  TEXT,
    success     BOOLEAN NOT NULL,
    details     JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_email ON audit_log(email);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- Print completion
DO $$ BEGIN
    RAISE NOTICE 'GCSC database schema created successfully';
END $$;
SQL
    log_ok "database/schema.sql created with default schema"
fi

if [ ! -f "database/init.sql" ]; then
    log_warn "database/init.sql not found. Creating placeholder (no seed data)."
    cat > database/init.sql << 'SQL'
-- GCSC Smart Contractor — Seed Data (Optional)
-- This script runs after schema.sql on first container startup

-- Example: Seed a test contractor (uncomment if needed)
-- INSERT INTO users (email, role, account, public_key, encrypted_private_key_data)
-- VALUES (
--     'test@example.com',
--     'contractor',
--     'testcontract',
--     'PUB_K1_xxxxxxxxxxxxxxxx',
--     '{"salt": "...", "iv": "...", "tag": "...", "data": "..."}'
-- )
-- ON CONFLICT (email) DO NOTHING;

DO $$ BEGIN
    RAISE NOTICE 'GCSC seed data loaded (if any)';
END $$;
SQL
    log_ok "database/init.sql created (empty seed file)"
fi

# ---------------------------------------------------------------------------
# Step 6: Start PostgreSQL database
# ---------------------------------------------------------------------------
log_step "Step 6/8 — Starting PostgreSQL database via Docker"

# Pull latest images
docker-compose pull db 2>/dev/null || true

# Start database only (not the app yet)
docker-compose up -d db

log_ok "PostgreSQL container started"

# ---------------------------------------------------------------------------
# Step 7: Wait for database to be ready
# ---------------------------------------------------------------------------
log_step "Step 7/8 — Waiting for database to be ready"

echo -n "  Waiting for PostgreSQL"
for i in {1..30}; do
    if docker-compose exec -T db pg_isready -U gcsc_user -d gcsc_smart_contractor > /dev/null 2>&1; then
        echo ""
        log_ok "PostgreSQL is ready"
        DB_READY=true
        break
    fi
    echo -n "."
    sleep 1
done

if [ "${DB_READY:-false}" != "true" ]; then
    log_err "PostgreSQL failed to become ready within 30 seconds."
    echo "  Check logs: docker-compose logs db"
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 8: Run database migrations
# ---------------------------------------------------------------------------
log_step "Step 8/8 — Running database initialization"

# The schema.sql and init.sql are mounted as Docker entrypoint init scripts
# They run automatically on first container startup. We verify they executed.
SLEEP_COUNT=0
while [ $SLEEP_COUNT -lt 10 ]; do
    if docker-compose exec -T db psql -U gcsc_user -d gcsc_smart_contractor -c "SELECT 1 FROM users LIMIT 1;" > /dev/null 2>&1; then
        log_ok "Database schema initialized"
        break
    fi
    sleep 1
    SLEEP_COUNT=$((SLEEP_COUNT + 1))
done

if [ $SLEEP_COUNT -eq 10 ]; then
    log_warn "Could not verify schema initialization (may still be running)."
    echo "  Check: docker-compose logs db"
fi

# ---------------------------------------------------------------------------
# Success message
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║              Setup Complete!                                  ║${RESET}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo ""
echo -e "  ${CYAN}1. Configure secrets:${RESET}"
echo "     Edit .env and set all required values:"
echo "       - JWT_SECRET, ENCRYPTION_SECRET"
echo "       - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN"
echo ""
echo -e "  ${CYAN}2. Start the backend:${RESET}"
echo "     npm run dev          # Development mode (hot-reload via nodemon)"
echo "     npm start            # Production mode"
echo "     docker-compose up -d # Full stack (app + db + pgadmin)"
echo ""
echo -e "  ${CYAN}3. Access the application:${RESET}"
echo "     App:      http://localhost:3000"
echo "     API Docs: http://localhost:3000/health (health check)"
echo "     pgAdmin:  http://localhost:5050 (admin@gcsc.com / admin)"
echo ""
echo -e "  ${CYAN}4. Obtain Google OAuth2 refresh token:${RESET}"
echo "     a. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env"
echo "     b. Start in development mode: npm run dev"
echo "     c. Visit: http://localhost:3000/dev/oauth/start"
echo "     d. Authorize and copy the refresh_token to .env"
echo ""
echo -e "  ${CYAN}5. Register your first user:${RESET}"
echo "     POST http://localhost:3000/api/register"
echo "       Body: { \"email\": \"your@email.com\", \"role\": \"contractor\" }"
echo ""
echo -e "${YELLOW}  Security reminder: NEVER commit .env to version control.${RESET}"
echo ""
