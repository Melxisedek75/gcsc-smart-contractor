# GCSC Smart Contractor Production Readiness

Date: 2026-05-29

## Readiness Score

Last full dress rehearsal: 2026-05-29

| Area | Current readiness | Evidence | Main remaining blocker |
|---|---:|---|---|
| MVP demo | 90% | Live backend/frontend smoke, dashboard validators, trust workflow validators, pilot runbook | First real admin account still needs founder-set Railway variables and bootstrap disablement |
| Controlled non-money pilot | 74% | Admin runbook, monitoring runbook, backup script, audit log, contractor verification guard, document review, bid guard, pilot runbook | Restore drill, monitoring setup, real admin login, and live role-by-role rehearsal are still pending |
| Real-money production | 43% | Stripe test-mode safety checks, XPR settlement spec, smart contract build/test evidence, legal wording cleanup | No live XPR escrow settlement, no live Stripe/payout approval, no external legal/security review, no restore drill |

These percentages are engineering readiness estimates, not legal approval or financial approval.

## Full Dress Rehearsal Evidence

2026-05-29 verification pass:

- `node --check v3\pure-server.js` passed.
- `npm --prefix v3 run test:pg-storage` passed.
- `npm --prefix v3 run test:pg-workflow` passed.
- `npm --prefix v3 run test:stripe-readiness` passed.
- `npm --prefix v3 run smoke:production` passed:
  - backend health OK;
  - database mode `postgres`;
  - unauthenticated admin audit endpoint returned HTTP 401;
  - `https://gcsc.store` returned HTTP 200;
  - Railway frontend returned HTTP 200.
- Frontend validation/build passed in `C:\gcsc-store`:
  - `npm run check:dashboard-live`;
  - `npm run check:admin-documents`;
  - `npm run check:admin-audit-log`;
  - `npm run check:contractor-verification`;
  - `npm run check:public-contractor-profile`;
  - `npm run check:trust-workflow`;
  - `npm run check:loans-financing`;
  - `npm run check:legal-claims`;
  - `npm run check:xpr-settlement`;
  - `npm run build`.
- Backup script dry-run without `DATABASE_URL` safely refused to run. Live backup/restore drill remains blocked until founder provides a non-production PostgreSQL target and permits use of production `DATABASE_URL` in a local terminal session.
- Admin guard direct check returned HTTP 401 for `/api/admin/audit-events?limit=1` without token.

Known rehearsal caveat:

- `https://gcsc.store` is the current canonical pilot URL.
- `https://gcsc-store-production.up.railway.app` may lag behind the GitHub Pages build until the Railway frontend service is manually redeployed or a Railway deploy token is provided through a secret-safe channel.

## Current Live Stack

| Layer | Status | Notes |
|---|---|---|
| Frontend | Live | `https://gcsc.store` serves the GCSC Store/Dashboard experience. |
| Backend | Live | Railway service `gcsc-backend`, branch `main`, start command `node v3/pure-server.js`. |
| Database | Live | PostgreSQL is used when `DATABASE_URL` is set. |
| Auth | MVP ready | JWT login/register flows are implemented; production depends on strong `JWT_SECRET`. |
| Profiles | MVP ready | Homeowner/contractor profile onboarding, business details, logo URL, EIN/license fields. |
| Documents | MVP ready | Contractor compliance document upload plus admin approve/reject workflow. |
| Bid safety | MVP ready | Bid acceptance blocks unverified contractors. |
| Public contractor profile | MVP ready | Homeowners can inspect contractor profile details before accepting bids. |
| Wallet | MVP ready | WebAuth wallet metadata can be connected/stored; on-chain signing is still a next milestone. |
| Audit log | MVP ready | Profile, document, wallet, and bid acceptance events are recorded and exposed to admins. |
| Financing prechecks | Demo/MVP only | Users can save future financing interest for admin review; no live lending, token lock, insurance assignment, funds issuance, or repayment routing is active. |
| Admin operations | MVP documented | `ADMIN-OPERATIONS-RUNBOOK.md` covers first admin bootstrap, document review, audit review, backups, rollback, and real-money gates. |
| Security hardening | Partial | CORS whitelist and endpoint rate limits are implemented; external review still pending. |

## Ready To Demonstrate

- Register/login flow.
- Dashboard with real account state instead of a fake demo account.
- Homeowner and contractor profile flows.
- Contractor compliance document submission.
- Admin document review.
- Admin audit log for trust events.
- Loans/Financing informational dashboard with demo precheck records.
- Contractor verification guard before bid acceptance.
- Public contractor profile/details view.
- Basic WebAuth wallet connection metadata.

## Not Ready For Real-Money Production

- Admin account must be created with the one-time bootstrap variables and then bootstrap must be disabled.
- On-chain escrow settlement needs a full live XPR test with real accounts and contract permissions.
- Stripe payments and contractor payouts need a production-mode verification run.
- Database backups, log retention, monitoring alerts, and incident response process still need live configuration and a restore drill.
- External security review and legal review are still required before holding real customer funds.
- WebAuth integration currently stores wallet identity; full signed transaction flows are not complete.
- SmartContractor Financing is not live lending. Escrow advances, token-collateral credit, ClaimBridge, and working-capital flows require state eligibility, legal/provider review, security review, and final approval before any real-money activation.

## Critical Remaining Tasks Before Real Funds

1. Complete end-to-end escrow settlement on XPR:
   - Create escrow from accepted bid.
   - Fund escrow on-chain.
   - Approve milestone.
   - Release milestone to contractor.
   - Verify audit trail in PostgreSQL and chain explorer.

2. Finish production operations:
   - Enable automated PostgreSQL backups.
   - Add uptime/error monitoring.
   - Run a restore drill on a non-production database.
   - Follow `ADMIN-OPERATIONS-RUNBOOK.md` for admin access, audit review cadence, rollback, and launch gates.

3. Complete payment and compliance controls:
   - Stripe live-mode smoke test.
   - Contractor payout verification.
   - Legal review of escrow/payment copy and token wording.
   - Legal/provider review of financing prechecks, state eligibility rules, insurance claim language, token collateral language, and user disclosures.
   - External security review before marketing real-money usage.

## Recommended Next Build Sequence

1. Create the first admin account in Railway using `ADMIN_BOOTSTRAP_ENABLED=true`.
2. Log in, verify Admin Documents and Audit Log.
3. Disable admin bootstrap and redeploy.
4. Run the role-by-role pilot in `PILOT-RUNBOOK.md`.
5. Configure monitoring alerts from `MONITORING-RUNBOOK.md`.
6. Run a PostgreSQL backup and restore drill into a non-production database.
7. Run a complete homeowner -> contractor -> bid -> verification -> accept flow on live services.
8. Add on-chain WebAuth signing and escrow settlement smoke tests.
9. Complete Stripe test-mode payment with real Stripe test keys and signed webhook events.
