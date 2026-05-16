# =============================================================================
# GCSC Smart Contractor Backend v2.0 — Production Dockerfile
# =============================================================================
# Multi-stage build with security hardening:
#   - Stage 1 (builder):  Install dependencies in isolated layer
#   - Stage 2 (production): Minimal runtime image, non-root user, no dev tools
#
# Security features:
#   - Alpine Linux base (minimal attack surface)
#   - Non-root user execution (USER node)
#   - No secrets baked into image
#   - HEALTHCHECK endpoint
#   - Single exposed port (3000)
#   - .dockerignore prevents sensitive files from being copied
#
# Build:
#   docker build -t gcsc-backend:v2 .
#
# Run:
#   docker run -p 3000:3000 --env-file .env gcsc-backend:v2
# =============================================================================

# ---------------------------------------------------------------------------
# STAGE 1: Builder — Install dependencies and prepare production node_modules
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

LABEL stage=builder
LABEL description="GCSC Backend — Build stage (dependencies installation)"

# Set working directory
WORKDIR /app

# Copy package files first for optimal layer caching
# These change less frequently than source code, so they cache independently
COPY package.json package-lock.json* ./

# Install production dependencies only
# --ignore-scripts: Prevents post-install scripts from running (security)
# --omit=dev: Skips devDependencies (smaller node_modules)
RUN npm ci --ignore-scripts --omit=dev && \
    npm cache clean --force

# ---------------------------------------------------------------------------
# STAGE 2: Production — Minimal runtime image
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production

LABEL stage=production
LABEL description="GCSC Smart Contractor Backend v2.0 — Production Runtime"
LABEL version="2.0.0"
LABEL maintainer="GCSC Engineering Team"

# ---------------------------------------------------------------------------
# Security: Create non-root user and group
# ---------------------------------------------------------------------------
# The 'node' user (UID 1000) is provided by the official Node Alpine image.
# We ensure the home directory has correct permissions.
# ---------------------------------------------------------------------------
RUN mkdir -p /app && \
    chown -R node:node /app

# Set working directory
WORKDIR /app

# ---------------------------------------------------------------------------
# Copy production dependencies from builder stage
# ---------------------------------------------------------------------------
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# ---------------------------------------------------------------------------
# Copy application source code
# ---------------------------------------------------------------------------
# server.js: Main application entry point
# public/:    Frontend HTML files served by the backend
#             (Note: Backend currently serves API only; static serving can
#              be added with: app.use(express.static('public')))
# ---------------------------------------------------------------------------
COPY --chown=node:node server.js ./
COPY --chown=node:node public ./public

# ---------------------------------------------------------------------------
# Security: Switch to non-root user
# ---------------------------------------------------------------------------
# All subsequent commands and the running process use the 'node' user.
# This prevents privilege escalation if the application is compromised.
# ---------------------------------------------------------------------------
USER node

# ---------------------------------------------------------------------------
# Expose the application port (informational only)
# ---------------------------------------------------------------------------
EXPOSE 3000

# ---------------------------------------------------------------------------
# Health check — verifies the application is responsive
# ---------------------------------------------------------------------------
# Uses the /health endpoint (no authentication required).
# Returns only {"status":"ok"} — no version info, no internal details.
#
# Options:
#   --interval=30s:    Check every 30 seconds
#   --timeout=5s:      Wait max 5 seconds for response
#   --start-period=10s: Grace period during startup
#   --retries=3:       Mark unhealthy after 3 consecutive failures
# ---------------------------------------------------------------------------
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# ---------------------------------------------------------------------------
# Default command
# ---------------------------------------------------------------------------
# Use exec form (JSON array) so Node receives SIGTERM for graceful shutdown.
# Do NOT use shell form ("node server.js") — it breaks signal handling.
# ---------------------------------------------------------------------------
CMD ["node", "server.js"]
