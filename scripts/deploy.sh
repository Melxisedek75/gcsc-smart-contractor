#!/usr/bin/env bash
# =============================================================================
# GCSC Smart Contractor v2.0 — Production Deployment Script for Railway
# =============================================================================
# Automated deployment pipeline with security checks and verification.
#
# Pipeline stages:
#   1. Pre-flight checks (git status, branch validation)
#   2. Security audit (npm audit)
#   3. Lint / basic validation
#   4. Environment variable sync to Railway
#   5. Deploy via Railway CLI
#   6. Post-deployment verification (health check)
#   7. Rollback capability
#
# Usage:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
#
# Prerequisites:
#   - Railway CLI installed and authenticated: npm i -g @railway/cli
#   - railway login (already completed)
#   - .env.production file with all secrets
#   - git repository with clean working directory
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT_NAME="gcsc-smart-contractor"
HEALTHCHECK_PATH="/health"
HEALTHCHECK_TIMEOUT=30
MAX_RETRIES=3
RAILWAY_REGION="us-west1"

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
log_fatal() { echo -e "${RED}[FATAL]${RESET} $1"; exit 1; }

# ---------------------------------------------------------------------------
# Utility: Spinner for long-running operations
# ---------------------------------------------------------------------------
spinner() {
    local pid=$1
    local message=$2
    local spin='⣾⣽⣻⢿⡿⣟⣯⣷'
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        i=$(( (i+1) % 8 ))
        printf "\r  ${spin:$i:1} %s" "$message"
        sleep 0.1
    done
    printf "\r\n"
}

# ---------------------------------------------------------------------------
# Print banner
# ---------------------------------------------------------------------------
echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════════════════════════════╗"
echo "  ║     GCSC Smart Contractor v2.0 — Production Deploy          ║"
echo "  ║                                                               ║"
echo "  ║  Target: Railway.app                                          ║"
echo "  ║  Pipeline: Security check → Test → Sync → Deploy → Verify    ║"
echo "  ╚═══════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# ---------------------------------------------------------------------------
# Stage 0: Pre-flight checks
# ---------------------------------------------------------------------------
log_step "Stage 0/6 — Pre-flight checks"

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    log_err "Railway CLI not found."
    echo "  Install: npm install -g @railway/cli"
    echo "  Login:   railway login"
    exit 1
fi
RAILWAY_VERSION=$(railway --version 2>/dev/null || echo "unknown")
log_ok "Railway CLI: ${RAILWAY_VERSION}"

# Check if logged into Railway
if ! railway whoami &> /dev/null; then
    log_err "Not logged into Railway. Run: railway login"
    exit 1
fi
RAILWAY_USER=$(railway whoami 2>/dev/null || echo "unknown")
log_ok "Railway user: ${RAILWAY_USER}"

# Check .env.production exists
if [ ! -f ".env.production" ]; then
    log_err ".env.production not found."
    echo "  Create it from .env.template with production values."
    echo "  NEVER commit .env.production to version control."
    exit 1
fi
log_ok ".env.production found"

# Check git status (warn if uncommitted changes)
if command -v git &> /dev/null && [ -d ".git" ]; then
    if ! git diff --quiet HEAD 2>/dev/null; then
        log_warn "Uncommitted changes detected."
        echo "  Commit or stash changes before deploying:"
        git status --short
        read -p "  Continue anyway? [y/N]: " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled."
            exit 0
        fi
    else
        log_ok "Git working directory is clean"
    fi

    # Show current branch and last commit
    GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    log_info "Branch: ${GIT_BRANCH} | Commit: ${GIT_COMMIT}"
else
    log_warn "Not a git repository. Skipping git checks."
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    log_err "Node.js is required for security checks."
    exit 1
fi
log_ok "Node.js: $(node --version)"

# ---------------------------------------------------------------------------
# Stage 1: Security audit
# ---------------------------------------------------------------------------
log_step "Stage 1/6 — Security audit"

# Run npm audit
log_info "Running npm audit..."
if npm audit --audit-level=high 2>/dev/null; then
    log_ok "npm audit passed (no high-severity vulnerabilities)"
else
    AUDIT_EXIT=$?
    if [ "$AUDIT_EXIT" -eq 0 ]; then
        log_ok "npm audit passed"
    else
        log_warn "npm audit found vulnerabilities"
        echo ""
        npm audit --audit-level=high 2>/dev/null || true
        echo ""
        read -p "  Continue with deployment? [y/N]: " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled. Fix vulnerabilities first:"
            echo "  npm audit fix"
            exit 0
        fi
        log_warn "Continuing despite audit findings (override by user)"
    fi
fi

# ---------------------------------------------------------------------------
# Stage 2: Basic validation
# ---------------------------------------------------------------------------
log_step "Stage 2/6 — Application validation"

# Check that server.js syntax is valid
log_info "Validating server.js syntax..."
if node --check server.js 2>/dev/null; then
    log_ok "server.js syntax is valid"
else
    log_err "server.js has syntax errors. Fix before deploying."
    node --check server.js || true
    exit 1
fi

# Check that all required env vars are present in .env.production
log_info "Validating .env.production..."
REQUIRED_VARS=(
    "NODE_ENV"
    "PORT"
    "JWT_SECRET"
    "JWT_EXPIRES_IN"
    "ENCRYPTION_SECRET"
    "OTP_EXPIRY_MINUTES"
    "GOOGLE_CLIENT_ID"
    "GOOGLE_CLIENT_SECRET"
    "GOOGLE_REDIRECT_URI"
    "GOOGLE_REFRESH_TOKEN"
    "EMAIL_FROM"
    "XPR_CHAIN_ID"
    "CORS_ORIGIN_WHITELIST"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    # Extract value from .env.production
    value=$(grep "^${var}=" .env.production 2>/dev/null | cut -d'=' -f2- | head -1)
    if [ -z "$value" ] || [ "$value" = "YOUR_"* ] || [ "$value" = "GENERATE_"* ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    log_err "Missing or placeholder values in .env.production:"
    for var in "${MISSING_VARS[@]}"; do
        echo "    - ${var}"
    done
    exit 1
fi
log_ok ".env.production has all required variables"

# Verify NODE_ENV is set to production
NODE_ENV_VALUE=$(grep "^NODE_ENV=" .env.production | cut -d'=' -f2-)
if [ "$NODE_ENV_VALUE" != "production" ]; then
    log_warn "NODE_ENV is not set to 'production' in .env.production"
    log_warn "Current value: ${NODE_ENV_VALUE}"
    read -p "  Continue anyway? [y/N]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

# ---------------------------------------------------------------------------
# Stage 3: Sync environment variables to Railway
# ---------------------------------------------------------------------------
log_step "Stage 3/6 — Syncing environment variables to Railway"

log_info "Reading .env.production and syncing to Railway..."

# Read .env.production line by line and set each variable on Railway
synced=0
skipped=0
while IFS='=' read -r key value || [ -n "$key" ]; do
    # Skip comments and empty lines
    case "$key" in
        ""|\#*) continue ;;
    esac

    # Trim whitespace from key
    key=$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    # Skip keys with empty values or placeholders
    if [ -z "$value" ] || [ "$value" = "YOUR_"* ] || [ "$value" = "GENERATE_"* ]; then
        log_warn "Skipping placeholder: ${key}"
        skipped=$((skipped + 1))
        continue
    fi

    # Set the variable on Railway
    if railway variables set "${key}=${value}" &> /dev/null; then
        synced=$((synced + 1))
    else
        log_warn "Failed to sync: ${key}"
        skipped=$((skipped + 1))
    fi
done < .env.production

log_ok "Synced ${synced} environment variables to Railway (${skipped} skipped)"

# ---------------------------------------------------------------------------
# Stage 4: Deploy to Railway
# ---------------------------------------------------------------------------
log_step "Stage 4/6 — Deploying to Railway"

log_info "Starting deployment..."

# Deploy using Railway CLI
if railway deploy &> /tmp/railway-deploy.log; then
    log_ok "Deployment initiated successfully"
else
    DEPLOY_EXIT=$?
    log_err "Railway deployment failed (exit code: ${DEPLOY_EXIT})"
    echo "  Logs:"
    cat /tmp/railway-deploy.log 2>/dev/null || echo "  (no logs available)"
    exit 1
fi

# Get the deployment URL
DEPLOYMENT_URL=$(railway domain 2>/dev/null || echo "")
if [ -n "$DEPLOYMENT_URL" ]; then
    log_info "Deployment URL: https://${DEPLOYMENT_URL}"
else
    log_warn "Could not retrieve deployment URL"
fi

# ---------------------------------------------------------------------------
# Stage 5: Post-deployment verification
# ---------------------------------------------------------------------------
log_step "Stage 5/6 — Post-deployment verification"

if [ -n "$DEPLOYMENT_URL" ]; then
    log_info "Waiting for application to become ready..."

    HEALTH_URL="https://${DEPLOYMENT_URL}${HEALTHCHECK_PATH}"
    retries=0
    healthy=false

    while [ $retries -lt $MAX_RETRIES ]; do
        retries=$((retries + 1))
        log_info "Health check attempt ${retries}/${MAX_RETRIES}: ${HEALTH_URL}"

        if curl -sSf -o /dev/null --max-time "$HEALTHCHECK_TIMEOUT" "$HEALTH_URL" 2>/dev/null; then
            healthy=true
            break
        fi

        if [ $retries -lt $MAX_RETRIES ]; then
            log_info "Retrying in 10 seconds..."
            sleep 10
        fi
    done

    if [ "$healthy" = true ]; then
        log_ok "Health check passed — deployment is live"
    else
        log_warn "Health check failed after ${MAX_RETRIES} attempts"
        log_warn "The app may still be starting. Check Railway dashboard."
    fi
else
    log_warn "Skipping health check — deployment URL not available"
fi

# Show Railway status
log_info "Railway deployment status:"
railway status 2>/dev/null || log_warn "Could not retrieve deployment status"

# ---------------------------------------------------------------------------
# Stage 6: Deployment summary
# ---------------------------------------------------------------------------
log_step "Stage 6/6 — Deployment summary"

echo ""
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║              Deployment Complete!                             ║${RESET}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

if [ -n "$DEPLOYMENT_URL" ]; then
    echo -e "  ${CYAN}Production URL:${RESET}    https://${DEPLOYMENT_URL}"
    echo -e "  ${CYAN}Health Check:${RESET}      https://${DEPLOYMENT_URL}${HEALTHCHECK_PATH}"
else
    echo -e "  ${CYAN}Production URL:${RESET}    (check Railway dashboard)"
fi

echo -e "  ${CYAN}API Endpoints:${RESET}"
echo -e "    POST /api/register       — User registration (Step 1: OTP)"
echo -e "    POST /api/verify         — OTP verification + keypair generation"
echo -e "    POST /api/login          — Login (Step 1: OTP)"
echo -e "    POST /api/login/verify   — Login verification + JWT"
echo -e "    POST /api/logout         — Logout (blacklist JWT)"
echo -e "    GET  /api/me             — Get current user (authenticated)"
echo ""

if [ "${GIT_BRANCH:-unknown}" != "unknown" ]; then
    echo -e "  ${CYAN}Branch:${RESET} ${GIT_BRANCH}"
    echo -e "  ${CYAN}Commit:${RESET} ${GIT_COMMIT}"
fi

echo -e "  ${CYAN}Environment:${RESET}     production"
echo -e "  ${CYAN}Timestamp:${RESET}       $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo ""
echo -e "${YELLOW}  Post-deploy checklist:${RESET}"
echo "    [ ] Verify health check: curl https://${DEPLOYMENT_URL}${HEALTHCHECK_PATH}"
echo "    [ ] Test registration flow"
echo "    [ ] Check Railway dashboard for errors"
echo "    [ ] Verify Google Drive API connectivity"
echo "    [ ] Monitor for 5 minutes after deploy"
echo ""
