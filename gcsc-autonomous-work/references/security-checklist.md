# Security Checklist — Mandatory Before Deployment

## Input Validation
- [ ] All user inputs sanitized (validator library)
- [ ] SQL injection protection (parameterized queries ONLY)
- [ ] XSS protection (output encoding)
- [ ] No eval() or exec() with user input
- [ ] File upload validation (type, size, extension)
- [ ] Rate limiting on all endpoints (100 req/min)

## Authentication
- [ ] Passwords hashed with bcrypt (12 rounds)
- [ ] JWT tokens with expiry (24 hours)
- [ ] OTP verification before registration complete
- [ ] Session invalidation on logout
- [ ] No sensitive data in JWT payload
- [ ] HTTPS only (redirect HTTP to HTTPS)

## Authorization
- [ ] Role-based access control (homeowner/contractor/admin)
- [ ] Users can only access their own data
- [ ] Admin endpoints require admin role
- [ ] Escrow operations verified (both parties)

## Secrets Management
- [ ] No hardcoded secrets in code
- [ ] Environment variables for all secrets
- [ ] JWT secret is random and 256+ bits
- [ ] API keys rotated quarterly
- [ ] Database credentials separate from app code

## Data Protection
- [ ] Private keys encrypted (AES-256-GCM)
- [ ] PII data encrypted at rest
- [ ] Secure key derivation (PBKDF2, 100k iterations)
- [ ] Google Drive vault for key backup
- [ ] No plaintext passwords in logs

## Infrastructure
- [ ] Helmet.js security headers
- [ ] CORS configured (not wildcard *)
- [ ] HSTS enabled
- [ ] CSP headers set
- [ ] X-Frame-Options: DENY
- [ ] Referrer-Policy: strict-origin

## Payment Security
- [ ] Stripe webhooks verified with signature
- [ ] Amount validation server-side
- [ ] Idempotency keys for payments
- [ ] Test mode for development
- [ ] PCI compliance via Stripe (never store card data)

## Blockchain Security
- [ ] Testnet for development only
- [ ] Transaction signing client-side (WebAuth)
- [ ] Private keys never leave user's device
- [ ] Escrow contract audited
- [ ] Multi-sig for large transactions

## Audit Trail
- [ ] All financial transactions logged
- [ ] User actions logged with timestamp
- [ ] Failed login attempts logged
- [ ] Admin actions logged separately
- [ ] Logs retained for 90 days
