# Founder Action Packet

Date: 2026-05-29

Purpose: list the exact founder-controlled actions required to move GCSC Smart Contractor from MVP demo readiness toward controlled pilot readiness. This file intentionally contains no passwords, tokens, private keys, database URLs, customer data, or payment credentials.

## Current Rule

Use `https://gcsc.store` as the canonical pilot URL.

Do not enable real-money payments, contractor payouts, mainnet escrow settlement, lending, insurance, token sales, or real token movement until the launch gates in `PILOT-GO-NOGO.md` are passed.

## Priority 1 - Create First Admin Account

Why this matters:

- Admin Review and Audit Log are built, but the first real admin account is still missing.
- Without this, live document review and live audit review cannot be completed.

Founder action in Railway:

1. Open Railway.
2. Open the backend service `gcsc-backend`.
3. Open Variables.
4. Add these variables:

```text
ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_EMAIL=<your-admin-email>
ADMIN_PASSWORD=<strong-password-12-plus-chars>
ADMIN_FULL_NAME=GCSC Admin
```

5. Optional safety check before redeploy:

```powershell
npm --prefix v3 run admin:bootstrap:check
```

This command reports only set/missing status. It must not print the admin password, JWT secret, or database URL.

6. Redeploy the backend service.
7. Open:

```text
https://gcsc.store/dashboard
```

8. Log in with the admin email and password.
9. Confirm the sidebar shows:
   - Admin Review
   - Audit Log
   - Financing Review
10. Return to Railway Variables.
11. Change:

```text
ADMIN_BOOTSTRAP_ENABLED=false
```

12. Redeploy the backend service again.

Codex verification after founder confirms admin exists:

```powershell
npm --prefix v3 run smoke:production
```

Evidence to record later:

- Admin account created.
- Bootstrap disabled.
- Admin can log in.
- Unauthenticated admin audit endpoint still returns HTTP 401.
- Non-admin admin endpoint access returns HTTP 403.

Do not send the admin password in chat and do not commit it to git.

## Priority 2 - Redeploy Railway Frontend Preview

Why this matters:

- `gcsc.store` is current.
- Railway frontend currently returns HTTP 200 but can serve an older bundle.
- HTTP 200 alone is not proof that the latest frontend is deployed.

Founder action:

1. Open Railway.
2. Open the `gcsc-store` frontend service.
3. Confirm repository:

```text
Melxisedek75/gcsc-store
```

4. Confirm branch:

```text
api-backend
```

5. Trigger redeploy from the latest commit.
6. Wait for a successful deployment.

Codex verification:

```powershell
$env:STRICT_RAILWAY_FRONTEND="1"
npm --prefix v3 run smoke:production
Remove-Item Env:\STRICT_RAILWAY_FRONTEND
```

Expected:

```text
railway frontend: frontend bundle current
```

Reference:

```text
RAILWAY-FRONTEND-REDEPLOY-RUNBOOK.md
```

## Priority 3 - Run Role-By-Role Non-Money Pilot

Why this matters:

- Automated tests pass, but live human-role workflow still needs evidence.

Required accounts:

- Admin account.
- Homeowner test account.
- Contractor test account.

Pilot path:

1. Contractor completes profile.
2. Contractor connects WebAuth wallet metadata.
3. Contractor uploads compliance documents.
4. Admin reviews documents.
5. Admin approves or rejects with a note.
6. Homeowner creates project.
7. Contractor submits bid.
8. Homeowner reviews public contractor profile.
9. Homeowner accepts only verified contractor bid.
10. Escrow/milestone flow is demonstrated without real funds.
11. Admin reviews Audit Log.

Reference:

```text
PILOT-RUNBOOK.md
```

Codex verification:

```powershell
npm --prefix v3 run smoke:production
```

Optional local audit export after admin login:

```powershell
$env:ADMIN_JWT="<admin-jwt-from-local-login-session>"
npm --prefix v3 run audit:export
Remove-Item Env:\ADMIN_JWT
```

Evidence to record later:

- Date/time.
- Test account roles used.
- Pass/fail for each step.
- Audit events observed.
- No real money or real tokens moved.

## Priority 4 - Configure Monitoring Alerts

Why this matters:

- A production pilot needs alerts when the backend, database, frontend, or admin guard breaks.

Founder choice required:

- Railway built-in alerts, or
- UptimeRobot, Better Stack, Cronitor, or another monitoring provider.

Minimum checks:

| Check | URL / rule |
|---|---|
| Backend health | `https://gcsc-backend-production.up.railway.app/health` must be HTTP 200 and database `postgres` |
| Main site | `https://gcsc.store/` must be HTTP 200 |
| Railway frontend | `https://gcsc-store-production.up.railway.app/` must be HTTP 200 |
| Admin guard | `/api/admin/audit-events?limit=1` must return HTTP 401 without token |

Reference:

```text
MONITORING-RUNBOOK.md
```

Codex can help verify the configuration after the provider is selected. Codex must not create paid monitoring accounts without founder approval.

## Priority 5 - PostgreSQL Backup And Restore Drill

Why this matters:

- Real-money production is not acceptable until restore is proven on a non-production database.

Founder action required:

1. Provide a non-production PostgreSQL restore target.
2. Approve running a production backup locally.
3. Keep `DATABASE_URL` and restore URL out of git and chat.

Codex/local verification:

```powershell
npm --prefix v3 run db:backup
```

Then restore into the non-production database using:

```text
POSTGRES-RESTORE-DRILL.md
```

Evidence to record later:

- Backup filename.
- Backup size.
- Restore target name only, not connection string.
- Aggregate table counts.
- Confirmation production DB was not modified.

## Priority 6 - Stripe Test-Mode Payment Setup

Why this matters:

- Backend safety checks exist, but no live Stripe test-mode payment has been run against Railway yet.

Founder action in Stripe/Railway:

1. Use Stripe test mode only.
2. Add test keys to Railway variables:

```text
STRIPE_PUBLISHABLE_KEY=<pk_test...>
STRIPE_SECRET_KEY=<sk_test...>
STRIPE_WEBHOOK_SECRET=<whsec...>
```

3. Configure Stripe webhook endpoint:

```text
https://gcsc-backend-production.up.railway.app/api/stripe/webhook
```

4. Subscribe to PaymentIntent events.
5. Run one Stripe test-card payment only.

Codex verification:

```powershell
npm --prefix v3 run test:stripe-readiness
```

Reference:

```text
PAYMENT-READINESS.md
```

Live Stripe charging remains disabled until legal, payout, refund, and founder approval gates pass.

## Priority 7 - XPR Testnet Signed Escrow Transaction

Why this matters:

- UI and backend evidence paths exist, but a real WebAuth-signed testnet transaction has not been confirmed end to end.

Founder/test operator action:

1. Use testnet only.
2. Use test accounts only.
3. Confirm `gcscrow1111` testnet contract account and permissions.
4. Sign one safe testnet milestone action through WebAuth.
5. Verify the transaction through Hyperion/testnet explorer.

Codex verification:

- Backend records transaction evidence.
- Hyperion confirmation updates chain transaction status.
- Audit Log records chain tx event.

Reference:

```text
XPR-ESCROW-SETTLEMENT-SPEC.md
```

No mainnet token or fund movement is allowed without explicit founder approval.

## Priority 8 - Smart Contract Deployment And Permissions Verification

Why this matters:

- Contract code builds/tests locally, but deployed account permissions and action authority must be verified before real settlement.

Founder/XPR action:

1. Confirm deployed accounts on XPR testnet.
2. Confirm contract account permissions.
3. Confirm transfer notify expectations.
4. Confirm allowed inline transfer behavior.
5. Confirm no unexpected authority grants.

Reference:

```text
C:\gcsc-website\contracts\gcsc-core\DEPLOYMENT-READINESS.md
```

## Priority 9 - Legal And External Security Review

Why this matters:

- Real-money escrow, payments, token utility, financing, insurance, and contractor payouts are legal/security-sensitive.

Founder action:

1. Choose legal reviewer/counsel.
2. Review escrow/payment terms.
3. Review refund/cancellation policy.
4. Review contractor payout policy.
5. Review token and GCST language.
6. Review financing/advance/loan/insurance language.
7. Schedule external application/security review before holding funds.

References:

```text
LEGAL-COMPLIANCE-GUIDE.md
SECURITY-PRODUCTION-CHECKLIST.md
PAYMENT-READINESS.md
PILOT-GO-NOGO.md
```

## What Codex Can Continue Autonomously

Codex can continue:

- improving tests;
- improving docs/runbooks;
- tightening smoke checks;
- adding non-secret evidence templates;
- preparing audit/export tooling;
- checking live public URLs;
- committing and pushing scoped safe changes.

Codex must stop or mark blocked for:

- passwords;
- Railway/Stripe/XPR private tokens;
- paid upgrades;
- live payments;
- real token movement;
- final legal approval;
- destructive database changes without a backup.
