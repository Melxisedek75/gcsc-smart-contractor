# GCSC Smart Contractor Admin Operations Runbook

Date: 2026-05-29

This runbook covers the MVP production admin workflow for `gcsc-backend` on Railway and `gcsc.store`.

## Scope

This is an operations guide for:

- First admin account bootstrap.
- Contractor document review.
- Audit log review.
- Health checks.
- PostgreSQL backup handling.
- Rollback decision points.
- Real-money launch gates.

It does not approve real-money escrow, lending, insurance, or token-collateral workflows. Those require the launch gates at the end of this document.

## First Admin Bootstrap

Use this only once, when there is no admin account yet.

For the full founder-controlled sequence, use `FOUNDER-ACTION-PACKET.md` Priority 1.

1. Open Railway.
2. Open the `gcsc-backend` service.
3. Open Variables.
4. Add:

```text
ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_EMAIL=<founder-admin-email>
ADMIN_PASSWORD=<strong-password-12-plus-chars>
ADMIN_FULL_NAME=GCSC Admin
```

5. Optional local/Railway shell check before redeploy:

```powershell
npm --prefix v3 run admin:bootstrap:check
```

This check prints only set/missing status and never prints `ADMIN_PASSWORD`, `JWT_SECRET`, or `DATABASE_URL`.

For the broader production security env gate before a pilot redeploy, run:

```powershell
npm --prefix v3 run security:env:check
```

This check validates `NODE_ENV`, `JWT_SECRET`, `DATABASE_URL`, strict frontend/CORS origins, rate-limit status, and bootstrap requirements without printing secret values.

6. Redeploy `gcsc-backend`.
7. Go to `https://gcsc.store/dashboard`.
8. Log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
9. Confirm the Dashboard sidebar shows:
   - Admin Review
   - Audit Log
   - Financing Review, if financing prechecks are enabled in the current build.
10. Return to Railway variables.
11. Change:

```text
ADMIN_BOOTSTRAP_ENABLED=false
```

12. Redeploy `gcsc-backend`.

Safety rules:

- Do not commit admin email/password to git.
- Do not send admin password in chat.
- Do not leave bootstrap enabled after the first successful login.
- If the bootstrap email already exists as a non-admin user, the backend refuses to upgrade it automatically. Create a different admin email or promote manually through a controlled database operation after backup.

## Admin Document Review

Use this before allowing a contractor to be treated as verified.

1. Log in as admin.
2. Open Dashboard -> Admin Review.
3. Start with filter `Submitted`.
4. For each document, check:
   - Contractor/company name.
   - Email.
   - Service area.
   - Document type.
   - File name.
   - Submitted timestamp.
   - SHA-256 hash if present.
5. Approve only if the document is acceptable for MVP verification.
6. Reject if the document is missing, unclear, wrong type, expired, unreadable, or does not match the contractor profile.
7. Rejection requires a manual note. Write the concrete reason so the contractor can correct it.

Expected backend behavior:

- Approved/rejected status is saved on `user_documents`.
- `review_note`, `reviewed_by`, and `reviewed_at` are saved.
- A `document.reviewed` audit event is recorded.
- A contractor only becomes `verified` after all required documents are approved and profile/wallet conditions are satisfied.

## Audit Log Review

Use Dashboard -> Audit Log to review trust-sensitive events.

Review cadence:

- During MVP testing: review after every test flow.
- During pilot usage: review daily.
- Before any production launch decision: export or copy a summary of relevant events.

Use this local helper after logging in as admin and copying a short-lived admin JWT into the terminal session:

```powershell
$env:ADMIN_JWT="<admin-jwt-from-local-login-session>"
npm --prefix v3 run audit:export
Remove-Item Env:\ADMIN_JWT
```

The export is written under `evidence/`, which is ignored by git. Record only the non-secret summary in `ADMIN-OPERATIONS-EVIDENCE-TEMPLATE.md` or a copied evidence file after the pilot.

Priority events:

| Event | Why it matters |
|---|---|
| `profile.updated` | Business identity and service area changes affect contractor trust. |
| `document.submitted` | Starts compliance review. |
| `document.reviewed` | Changes contractor verification state. |
| `wallet.connected` | Links platform account to wallet identity. |
| `project.created` | Starts homeowner project scope and budget record. |
| `bid.submitted` | Creates contractor proposal record for a homeowner project. |
| `bid.accepted` | Creates homeowner/contractor commitment and may trigger escrow flow. |
| `escrow.milestone.created` | Defines milestone amount and acceptance checkpoint. |
| `escrow.milestone.submitted` | Contractor claims milestone work is complete. |
| `escrow.milestone.approved` | Homeowner confirms submitted work is acceptable. |
| `escrow.milestone.released` | Platform records release state; this is not proof of real-money payout without verified chain/payment evidence. |
| `escrow.milestone.disputed` | Pauses trust workflow and requires review before further release. |
| `escrow.chain_tx.recorded` | Stores XPR/WebAuth transaction evidence before verification. |
| `escrow.chain_tx.confirmed` | Hyperion found the expected contract action. |
| `escrow.chain_tx.failed` | Hyperion could not confirm the expected contract action. |
| `financing.precheck.created` | User requested demo-only review of a future financing workflow. |
| `payment.intent.created` | Stripe test-mode PaymentIntent was created; live payments remain disabled until gates pass. |

If an unexpected event appears:

1. Identify actor, target, entity type, and timestamp.
2. Confirm it matches the user action.
3. If it does not match, pause related workflow and check backend logs before approving any money movement.

## Health Checks

Run these after deploy:

```bash
curl -i https://gcsc-backend-production.up.railway.app/health
curl -i https://gcsc.store/
curl -i https://gcsc-store-production.up.railway.app/
```

Expected backend health:

```json
{
  "status": "ok",
  "database": "postgres"
}
```

Expected protected endpoint behavior:

```bash
curl -i "https://gcsc-backend-production.up.railway.app/api/admin/audit-events?limit=1"
```

Expected: HTTP 401 without a token.

For a local non-secret operations snapshot:

```powershell
npm --prefix v3 run ops:status
```

The command writes `evidence/production-status-*.json`, which is ignored by git. Use it for daily status review and copy only non-secret summaries into committed docs.

## PostgreSQL Backups

Before any risky operation, take a backup.

Risky operations include:

- Manual database update.
- Migration.
- Admin role repair.
- Schema change.
- Real-money pilot data cleanup.

Before any migration, run:

```powershell
npm --prefix v3 run db:migrations:check
```

This validates the expected production SQL files and warns about legacy migrations that should not be applied to the v3 backend without manual comparison.

Recommended command from a trusted local terminal with `DATABASE_URL` set:

```bash
pg_dump "$DATABASE_URL" --format=custom --file "gcsc-backup-YYYYMMDD-HHMM.dump"
```

Verify backup file exists and has non-zero size:

```bash
ls -lh gcsc-backup-YYYYMMDD-HHMM.dump
```

Restore drill should be tested on a non-production database before any real-money launch.

Preferred restore drill helper:

```powershell
$env:RESTORE_DATABASE_URL="<non-production-postgres-connection-string>"
$env:BACKUP_FILE="backups\gcsc-backup-YYYY-MM-DDTHH-MM-SS-msZ.dump"
$env:RESTORE_DRY_RUN="1"
npm --prefix v3 run db:restore:drill
Remove-Item Env:\RESTORE_DRY_RUN
npm --prefix v3 run db:restore:drill
Remove-Item Env:\BACKUP_FILE
Remove-Item Env:\RESTORE_DATABASE_URL
```

The helper is secret-safe: it prints `RESTORE_DATABASE_URL: set`, not the connection string.

## Rollback

Use rollback if:

- `/health` fails after deploy.
- Login breaks.
- Dashboard cannot load protected user data.
- Document review or bid acceptance returns unexpected 5xx.
- Audit events stop recording for trust-sensitive actions.

Rollback order:

1. Roll back frontend if the issue is visual/UI-only.
2. Roll back backend if API health or protected endpoints fail.
3. Do not roll back PostgreSQL schema without a backup and a written reason.

Railway rollback:

1. Open Railway project.
2. Open affected service.
3. Open Deployments.
4. Select the last known good deployment.
5. Use Redeploy/Rollback from that deployment.
6. Run health checks again.

## Real-Money Launch Gates

Do not accept real homeowner funds or contractor payouts until all gates pass.

| Gate | Required evidence |
|---|---|
| Admin access | Bootstrap disabled; named admin can log in; non-admin cannot access admin endpoints. |
| Backups | Backup created, restore tested on non-production DB. |
| Monitoring | Uptime/error alerts configured for backend and frontend. |
| Contractor verification | Required document workflow tested with approve/reject paths. |
| Audit trail | Profile, document, wallet, project, bid, milestone, chain transaction, financing, and payment events verified. |
| Escrow settlement | XPR escrow create/fund/approve/release tested end-to-end with real signed transactions. |
| Payments | Stripe test mode and live mode reviewed; webhook signatures verified. |
| Legal | Escrow, token, financing, insurance, and compliance language reviewed. |
| Security | External review or structured internal security checklist completed. |
