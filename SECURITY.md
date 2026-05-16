# GCSC Smart Contractor v2.0 — Security Documentation

## Table of Contents

1. [Reporting Vulnerabilities](#reporting-vulnerabilities)
2. [Security Features](#security-features)
3. [Environment Setup Checklist](#environment-setup-checklist)
4. [Deployment Security Checklist](#deployment-security-checklist)
5. [Architecture Security Overview](#architecture-security-overview)
6. [Container Security](#container-security)
7. [Dependency Security](#dependency-security)
8. [Known Security Considerations](#known-security-considerations)

---

## Reporting Vulnerabilities

If you discover a security vulnerability in GCSC Smart Contractor, please report it responsibly:

**Please DO NOT:**
- Open a public issue for security vulnerabilities
- Discuss vulnerabilities in public forums or chat

**Please DO:**
- Email security reports to: `security@gcsc.example.com`
- Include detailed reproduction steps
- Allow up to 72 hours for initial response
- Provide a reasonable disclosure timeline (90 days recommended)

We will acknowledge receipt within 48 hours and provide regular updates on the remediation progress.

---

## Security Features

### Application-Level Security (server.js)

| # | Feature | Implementation | Status |
|---|---------|---------------|--------|
| 1 | **Request ID Tracking** | Unique UUID per request for log correlation | ✅ Active |
| 2 | **Helmet.js Headers** | CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc. | ✅ Active |
| 3 | **HTTPS Redirect** | Production-only HTTP→HTTPS redirect | ✅ Active |
| 4 | **CORS Whitelist** | Strict origin validation (no wildcards in production) | ✅ Active |
| 5 | **Rate Limiting** | General: 100 req/15min, Registration: 10 req/15min | ✅ Active |
| 6 | **Body Parser Limits** | JSON: 10kb, URL-encoded: 100kb, Content-Type validation | ✅ Active |
| 7 | **Input Validation** | `validator.js` with role whitelist | ✅ Active |
| 8 | **JWT Authentication** | Server-side blacklist logout, secure token handling | ✅ Active |
| 9 | **AES-256-GCM Encryption** | Unique salt/IV per operation, PBKDF2-SHA256 600k rounds | ✅ Active |
| 10 | **OTP Verification** | 6-digit time-limited codes, HTML-escaped emails | ✅ Active |
| 11 | **Secure Key Generation** | `crypto.generateKeyPair`, PBKDF2 600k iterations | ✅ Active |
| 12 | **Error Sanitization** | Generic error messages to client, detailed logs server-side | ✅ Active |
| 13 | **Auth Role Enforcement** | Role-based access control (RBAC) on all dashboard routes | ✅ Active |
| 14 | **Request Logging** | Structured Morgan logging with IP, method, URL, status | ✅ Active |
| 15 | **OAuth Endpoint Gating** | `/dev/oauth/*` endpoints disabled in production | ✅ Active |
| 16 | **Request Timeout** | 30-second timeout on all external API calls | ✅ Active |

### Infrastructure Security

| # | Feature | Implementation | Status |
|---|---------|---------------|--------|
| 17 | **Non-root Container** | `USER node` (UID 1000) in production image | ✅ Active |
| 18 | **Multi-stage Build** | Separate builder/production stages | ✅ Active |
| 19 | **Minimal Base Image** | `node:20-alpine` (no unnecessary packages) | ✅ Active |
| 20 | **No Secrets in Image** | `.env` excluded via `.dockerignore` | ✅ Active |
| 21 | **Container HEALTHCHECK** | `/health` endpoint verification every 30s | ✅ Active |
| 22 | **Resource Limits** | 512MB RAM / 1 CPU app, 256MB RAM / 0.5 CPU DB | ✅ Active |
| 23 | **Log Rotation** | 10MB max log size, 3 files retained | ✅ Active |
| 24 | **No-new-privileges** | Prevents container privilege escalation | ✅ Active |
| 25 | **Capability Dropping** | All capabilities dropped except NET_BIND_SERVICE | ✅ Active |
| 26 | **Read-only Root FS** | Filesystem mounted read-only (where possible) | ✅ Planned |

### Authentication Flow Security

```
Registration:
  POST /api/register
    → Validate email (validator.isEmail)
    → Validate role against whitelist (homeowner|contractor)
    → Check email not already registered
    → Generate 6-digit OTP (crypto.randomInt)
    → Store OTP with expiry (Map, server-side only)
    → Send OTP via Gmail API (HTML-escaped)
    → Return: { message: "OTP sent" } (no OTP in response)

Verification:
  POST /api/verify
    → Validate OTP (match + not expired)
    → Delete OTP from storage (one-time use)
    → Generate XPR keypair (async crypto.generateKeyPair)
    → Encrypt private key (AES-256-GCM, unique salt/IV)
    → Store encrypted key in Google Drive
    → Generate JWT (signed, expires in 24h)
    → Return: { token, user } (never includes private key)

Login:
  POST /api/login → OTP sent → POST /api/login/verify → JWT issued

Logout:
  POST /api/logout (with JWT)
    → Add JWT JTI to blacklist
    → All subsequent requests with this JWT are rejected
```

---

## Environment Setup Checklist

Use this checklist when setting up a new development environment:

### Secrets Generation

```bash
# 1. JWT_SECRET (64 bytes = 128 hex characters)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 2. ENCRYPTION_SECRET (64 bytes, base64)
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"

# 3. Copy .env.template and fill in all values
cp .env.template .env
```

### Pre-Deployment Verification

- [ ] `.env` is in `.gitignore` (never committed)
- [ ] `JWT_SECRET` is at least 64 hex characters (256 bits)
- [ ] `ENCRYPTION_SECRET` is at least 32 characters with mixed case, numbers, symbols
- [ ] `ENCRYPTION_SECRET` has been backed up securely (loss = irreversible data loss)
- [ ] `GOOGLE_CLIENT_SECRET` is kept confidential
- [ ] `GOOGLE_REFRESH_TOKEN` is stored securely
- [ ] `CORS_ORIGIN_WHITELIST` only contains actual frontend domains
- [ ] `NODE_ENV=production` is set for production deployments
- [ ] `OTP_EXPIRY_MINUTES` is 10 or less
- [ ] `PORT` is configured (default: 3000)

---

## Deployment Security Checklist

### Pre-Deployment

- [ ] Run `npm audit` — no high/critical vulnerabilities
- [ ] Validate `.env.production` — all secrets set, no placeholders
- [ ] `NODE_ENV=production` is set
- [ ] `.env.production` is NOT in version control
- [ ] `CORS_ORIGIN_WHITELIST` contains only production domains
- [ ] `GOOGLE_REDIRECT_URI` matches production URL
- [ ] `FRONTEND_URL` matches production frontend URL

### Deployment

- [ ] Deploy via `scripts/deploy.sh` (automated pipeline)
- [ ] Verify Railway environment variables are synced correctly
- [ ] Confirm `/dev/oauth/*` endpoints are disabled in production

### Post-Deployment

- [ ] Health check passes: `GET /health` → `{ "status": "ok" }`
- [ ] Rate limiting is active (test with rapid requests)
- [ ] CORS blocks unauthorized origins
- [ ] HTTPS redirect is working (HTTP → 301 → HTTPS)
- [ ] Security headers are present (check with `curl -I`)
- [ ] Google Drive API connectivity is verified
- [ ] Error responses contain no stack traces or internal details
- [ ] Monitor logs for anomalies for 30 minutes

---

## Architecture Security Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                              │
│  • Frontend: static HTML/JS (public/index.html)                      │
│  • HTTPS only (enforced in production)                               │
│  • No secrets stored client-side                                     │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Load Balancer / Reverse Proxy                     │
│  • SSL/TLS termination (Railway handles this automatically)          │
│  • X-Forwarded-For header parsing (app.enable('trust proxy'))        │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    GCSC Backend Container                            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Node.js 20 (Alpine Linux) — Non-root user (UID 1000)       │   │
│  │                                                               │   │
│  │  1. Trust Proxy           — Parse X-Forwarded-* headers     │   │
│  │  2. Request ID            — UUID per request                │   │
│  │  3. Helmet.js             — All security headers            │   │
│  │  4. HTTPS Redirect        — Production only                 │   │
│  │  5. CORS Whitelist        — Strict origin validation        │   │
│  │  6. Rate Limiting         — General + Registration          │   │
│  │  7. Body Parser           — Size/type limits                │   │
│  │  8. Input Validation      — validator.js whitelist          │   │
│  │  9. Morgan Logging        — Structured request logs         │   │
│  │                                                               │   │
│  │  Auth: JWT + Blacklist    — Secure token management         │   │
│  │  Keys: AES-256-GCM        — Encrypted Google Drive storage  │   │
│  │  OTP: Time-limited codes  — HTML-escaped email delivery     │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
         ┌─────────────────┐      ┌─────────────────┐
         │  Google APIs    │      │  PostgreSQL DB  │
         │  (OAuth2)       │      │  (persistent)   │
         │                 │      │                 │
         │  • Drive API    │      │  • users        │
         │  • Gmail API    │      │  • otp_verif.   │
         │                 │      │  • token_black. │
         └─────────────────┘      │  • audit_log    │
                                  └─────────────────┘
```

---

## Container Security

### Dockerfile Security

```dockerfile
# Multi-stage build: Only production artifacts reach final image
FROM node:20-alpine AS builder    # Build stage (discarded)
FROM node:20-alpine AS production # Runtime stage (minimal)

USER node                          # Non-root execution
HEALTHCHECK CMD ...                # Container health monitoring
EXPOSE 3000                        # Single exposed port
CMD ["node", "server.js"]          # Exec form (proper signal handling)
```

### Docker Compose Production Security

```yaml
security_opt:
  - no-new-privileges:true         # Prevent privilege escalation
cap_drop:
  - ALL                            # Drop all capabilities
cap_add:
  - NET_BIND_SERVICE               # Re-add only what's needed

# Resource limits prevent DoS
deploy:
  resources:
    limits:
      memory: 512M                  # Max 512MB RAM
      cpus: "1.0"                   # Max 1 CPU core
    reservations:
      memory: 128M                  # Reserve 128MB

# Log rotation prevents disk exhaustion
logging:
  driver: "json-file"
  options:
    max-size: "10m"                 # Rotate at 10MB
    max-file: "3"                   # Keep 3 files
```

---

## Dependency Security

### Current Dependencies (package.json)

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^4.21.0 | Web framework |
| `cors` | ^2.8.5 | CORS handling |
| `express-rate-limit` | ^7.4.0 | Rate limiting |
| `helmet` | ^8.0.0 | Security headers |
| `jsonwebtoken` | ^9.0.2 | JWT authentication |
| `morgan` | ^1.10.0 | Request logging |
| `googleapis` | ^144.0.0 | Google API client |
| `validator` | ^13.12.0 | Input validation |
| `ripemd160` | ^2.0.2 | RIPEMD160 hashing |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `nodemon` | ^3.1.0 | Dev hot-reload |
| `open` | ^10.1.0 | Browser opener |

### Security Maintenance

```bash
# Audit dependencies for known vulnerabilities
npm audit

# Fix automatically fixable issues
npm audit fix

# Check for outdated packages
npm outdated

# Update all packages to latest versions (test thoroughly after)
npm update
```

### Automated Security Scanning

Run `npm audit` as part of CI/CD pipeline. The `scripts/deploy.sh` script runs this check before every deployment.

---

## Known Security Considerations

### Current Limitations

| # | Consideration | Status | Mitigation |
|---|--------------|--------|------------|
| 1 | **In-memory OTP storage** | Known | OTPs stored in `Map` (server RAM). Lost on restart. Acceptable for low volume. |
| 2 | **In-memory user storage** | Known | Users stored in `Map`. Lost on restart. **PostgreSQL migration planned.** |
| 3 | **JWT blacklist in memory** | Known | Blacklisted tokens in `Map`. Lost on restart. **Redis migration planned.** |
| 4 | **Single container deployment** | Known | No horizontal scaling. For high availability, use Railway's built-in scaling. |
| 5 | **No database yet** | Known | Currently using in-memory storage. PostgreSQL schema provided in `database/`. |

### Future Security Enhancements

- [ ] **Redis for session/token storage** — Persistent JWT blacklist
- [ ] **PostgreSQL integration** — Persistent user/data storage (schema ready)
- [ ] **Input sanitization middleware** — Centralized sanitization for all inputs
- [ ] **Request signing** — HMAC-signed requests for critical operations
- [ ] **IP-based rate limiting** — Per-IP limits in addition to global limits
- [ ] **Web Application Firewall (WAF)** — Railway or Cloudflare WAF
- [ ] **DDoS protection** — Cloudflare or similar CDN
- [ ] **Security headers review** — Regular review of CSP and other headers
- [ ] **Penetration testing** — Annual third-party security audit
- [ ] **Bug bounty program** — Incentivize responsible disclosure

---

## Security Headers Reference

The following headers are set by Helmet.js in production:

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | HSTS — force HTTPS |
| `Content-Security-Policy` | Strict policy | XSS prevention |
| `X-Frame-Options` | `DENY` | Clickjacking prevention |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing prevention |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer control |
| `X-DNS-Prefetch-Control` | `off` | DNS prefetch control |
| `Permissions-Policy` | Restrictive | Feature policy |

---

*Last updated: 2025-01-15*
*Version: 2.0.0*
*Classification: Internal Use*
