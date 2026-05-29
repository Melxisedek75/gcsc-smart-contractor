# GCSC Production Security Checklist

Date: 2026-05-29

## Current Security Status

This checklist records the current backend security posture for the controlled pilot. It does not replace an external security audit.

## Dependency Audit

Command run:

```powershell
npm --prefix v3 audit --omit=dev --audit-level=high
```

Result:

- High vulnerabilities: 0
- Critical vulnerabilities: 0
- Reported vulnerabilities below high threshold: 18 total
  - 2 low
  - 16 moderate

Primary dependency chains:

- `@proton/web-sdk` / `@proton/js` / `@proton/link`
- `elliptic`
- `zod`
- `uuid`
- `googleapis`
- `node-cron`

Do not run `npm audit fix --force` automatically. The audit output would force a breaking `@proton/web-sdk` upgrade path and must be handled in a dedicated dependency-upgrade branch with WebAuth/XPR regression tests.

## Secret Scan

Command run:

```powershell
rg -n "<GitHub PAT, Railway token, Stripe key, webhook secret, private key, password assignment patterns>" . -g "!v3/node_modules/**" -g "!node_modules/**" -g "!.git/**" -g "!gcsc.db"
```

Findings:

- No real GitHub tokens, Railway tokens, live Stripe keys, webhook secrets, or private keys were found.
- Matches were documentation placeholders or scan patterns:
  - `ADMIN_PASSWORD=<strong-password-12-plus-chars>`
  - `PGPASSWORD=<Render postgres password>`
  - shell variable reference `POSTGRES_PASSWORD="${DB_PASS}"`
  - the scan command text inside the two-week plan

Action:

- No secret removal required.
- Keep `.env`, Railway variables, tokens, and private keys out of git.

## Admin Endpoint Authorization

Production server reviewed: `v3/pure-server.js`

Admin endpoints:

| Endpoint | Expected unauthenticated | Expected non-admin | Status |
|---|---:|---:|---|
| `GET /api/admin/documents` | 401 | 403 | Covered |
| `GET /api/admin/audit-events` | 401 | 403 | Covered |
| `GET /api/admin/financing-prechecks` | 401 | 403 | Covered |
| `PUT /api/admin/documents/:id/review` | 401 | 403 | Covered |

Regression coverage:

```powershell
npm --prefix v3 run test:pg-storage
```

The storage smoke test now checks unauthenticated and non-admin access for admin document, audit, financing precheck, and document review endpoints.

Additional production smoke:

```powershell
npm --prefix v3 run security:cors:smoke
npm --prefix v3 run security:env:check
```

This verifies `https://gcsc.store` receives `Access-Control-Allow-Origin`, an external origin is rejected with HTTP 403, and `/api/admin/audit-events` still returns HTTP 401 without JWT.

The security env check validates production `NODE_ENV`, `JWT_SECRET`, `DATABASE_URL`, strict frontend/CORS origins, rate-limit status, and admin bootstrap state. It prints status by variable name only and does not print secret values.

## Current Controls

- JWT signatures are verified before protected endpoints accept requests.
- Admin endpoints require `role === "admin"`.
- CORS is allowlist-based through `CORS_ALLOWED_ORIGINS`.
- Public CORS smoke verifies allowed/denied origins and the admin audit unauthenticated guard.
- Secret-safe production env validation catches weak/missing JWT secrets, missing database URL, wildcard/local CORS origins, disabled rate limits, and incomplete admin bootstrap variables.
- Backend responses set baseline HTTP security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Content-Security-Policy`, and `Permissions-Policy`.
- Rate limits are active for auth, profile, documents, wallet, and bid acceptance endpoints.
- Stripe payment endpoints are test-mode only; live payments are disabled.
- Stripe webhooks require signature verification.
- Audit events cover profile update, document submission/review, wallet connection, bid acceptance, chain tx verification, and test payment intent creation.

Regression coverage:

```powershell
npm --prefix v3 run test:pg-storage
```

The PostgreSQL storage smoke test verifies the baseline security headers on `/health`.

Production smoke coverage:

```powershell
npm --prefix v3 run smoke:production
```

The production smoke now fails if the live `/health` response is missing or changes any baseline security header.

Operations snapshot coverage:

```powershell
npm --prefix v3 run ops:status
```

The operations snapshot records a critical `backend security headers` check in the ignored JSON evidence report.

## Remaining Security Blockers

- First production admin account must be created and bootstrap disabled.
- PostgreSQL backup and restore drill must be completed on a non-production database.
- Monitoring alerts must be configured outside the app.
- Dependency upgrades for Proton/WebAuth and Google/uuid chains need a dedicated test branch.
- External application security review is still required before holding real customer funds.
- Smart contract permissions and deployed account authorities must be verified on XPR testnet before real escrow settlement.

## Next Security Actions

1. Create first admin safely through Railway variables.
2. Disable admin bootstrap after first successful login.
3. Run `npm --prefix v3 run security:env:check` in the production environment before pilot redeploy.
4. Run restore drill using `POSTGRES-RESTORE-DRILL.md`.
5. Add external uptime/error alerts from `MONITORING-RUNBOOK.md`.
6. Open a dependency-upgrade branch for `@proton/web-sdk`, `googleapis`, `node-cron`, and transitive `uuid/zod/elliptic` findings.
