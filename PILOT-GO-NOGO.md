# GCSC Smart Contractor Pilot Go/No-Go

Date: 2026-05-29

Decision scope: controlled non-money pilot of GCSC Smart Contractor MVP.

This document is not approval for real-money escrow, live Stripe charging, contractor payouts, lending, insurance, token sales, or mainnet token movement.

## Current Decision

| Decision area | Status | Decision |
|---|---|---|
| MVP demo on `https://gcsc.store` | Go with controls | Safe to demonstrate guided flows if no real money or real token transfer is used |
| Controlled non-money pilot | Conditional Go | Requires first admin account, bootstrap disabled, role-by-role rehearsal, and monitoring/backup setup |
| Real-money production | No-Go | Missing legal/security/payment/XPR settlement gates |

## Evidence Summary

Latest full verification pass: 2026-05-29

| Check | Evidence | Result |
|---|---|---|
| Backend syntax | `node --check v3\pure-server.js` | Pass |
| Backend storage smoke | `npm --prefix v3 run test:pg-storage` | Pass |
| Backend workflow smoke | `npm --prefix v3 run test:pg-workflow` | Pass |
| Stripe readiness smoke | `npm --prefix v3 run test:stripe-readiness` | Pass |
| Production smoke | `npm --prefix v3 run smoke:production` | Pass |
| Admin unauthenticated guard | `/api/admin/audit-events?limit=1` returned HTTP 401 | Pass |
| Frontend dashboard validator | `npm run check:dashboard-live` | Pass |
| Admin document validator | `npm run check:admin-documents` | Pass |
| Admin audit validator | `npm run check:admin-audit-log` | Pass |
| Contractor verification validator | `npm run check:contractor-verification` | Pass |
| Public contractor profile validator | `npm run check:public-contractor-profile` | Pass |
| Trust workflow validator | `npm run check:trust-workflow` | Pass |
| Loans/financing wording validator | `npm run check:loans-financing` | Pass |
| Legal claims validator | `npm run check:legal-claims` | Pass |
| XPR settlement UI validator | `npm run check:xpr-settlement` | Pass |
| Frontend build | `npm run build` | Pass with Vite large chunk warning |
| Backup script dry-run | Missing `DATABASE_URL` refused safely | Pass for safety, restore drill still blocked |

## Launch Gates

| Gate | Status | Evidence / blocker |
|---|---|---|
| Backend health | Pass | Production smoke reports backend OK and database `postgres` |
| Main site availability | Pass | `https://gcsc.store` returns HTTP 200 |
| Railway frontend availability | Partial | HTTP 200, but may lag behind GitHub Pages until redeployed |
| Admin endpoint auth guard | Pass | Unauthenticated admin audit request returns HTTP 401 |
| Non-admin admin guard | Pass in automated tests | `test:pg-storage` covers non-admin 403 for admin endpoints |
| First real admin account | Blocked | Founder must set Railway admin bootstrap variables and then disable bootstrap |
| Admin document review | Pass in automated tests; blocked live | UI/API/tests exist; live admin account still required |
| Audit log | Pass in automated tests; blocked live | Events and admin UI exist; live admin account still required |
| Contractor verification guard | Pass | Unverified bid acceptance is blocked by backend and frontend validators |
| Public contractor profile | Pass | Frontend and backend coverage exists |
| Pilot runbook | Pass | `PILOT-RUNBOOK.md` created |
| PostgreSQL backup script | Pass | `db:backup` script exists and refuses missing `DATABASE_URL` |
| PostgreSQL restore drill | Blocked | Requires non-production PostgreSQL target and founder approval to use production backup |
| Monitoring plan | Pass as documentation | `MONITORING-RUNBOOK.md` exists |
| Monitoring alerts configured | Blocked | Requires founder account setup in monitoring provider or Railway alert configuration; GitHub Actions scheduled smoke is also blocked until the GitHub account/billing lock is resolved |
| Stripe test-mode API safety | Pass | Missing/non-test Stripe key returns safe 503; webhook signature tests pass |
| Stripe real test payment | Blocked | Requires founder-provided Stripe test keys and dashboard webhook setup |
| Stripe live payments | No-Go | Requires legal review, account verification, refund policy, Connect payout design, and founder approval |
| XPR/WebAuth UI flow | Partial | Frontend signing UI and backend evidence endpoints exist |
| XPR testnet transaction confirmation | Blocked | Requires real WebAuth testnet signing and Hyperion-confirmed tx |
| XPR/mainnet real settlement | No-Go | Requires contract deployment/permissions verification, legal approval, security review, and founder approval |
| Smart contract build/tests | Pass as prior evidence | `contracts/gcsc-core` build/test passed during Day 8 verification |
| External security review | Blocked | Not completed |
| Legal review | Blocked | Not completed |

## Founder Approvals Required

Use `FOUNDER-ACTION-PACKET.md` as the step-by-step checklist for founder-controlled actions.

Controlled non-money pilot requires founder approval for:

1. Creating the first admin account through Railway variables.
2. Disabling admin bootstrap after first login.
3. Running the role-by-role pilot with real test accounts.
4. Creating a production PostgreSQL backup for restore drill.
5. Selecting or configuring a monitoring provider.

Real-money launch requires separate explicit founder approval for:

1. Live Stripe charging.
2. Stripe Connect contractor payouts.
3. Any real XPR/GCSC/GCST token movement.
4. Any mainnet escrow contract settlement.
5. Any financing, advance, claim, loan, or insurance-related product.

## Legal And Security Blockers

Legal blockers:

- escrow/payment terms not reviewed by counsel;
- refund and cancellation policy not approved;
- contractor payout policy not approved;
- token utility/stablecoin language not approved for production use;
- financing/loan/claim/insurance language not approved;
- state eligibility rules not defined.

Security blockers:

- no external security review completed;
- no formal penetration test completed;
- no production incident response drill completed;
- no restore drill completed on non-production PostgreSQL;
- monitoring alerts not configured;
- contract deployment permissions not independently verified.

## Real-Money Status

Real-money status: disabled.

The current platform may demonstrate product workflows, but it must not:

- accept live homeowner funds;
- charge live cards;
- payout contractors;
- custody real escrow funds;
- release real milestone payments;
- represent financing as approved;
- represent insurance or claim workflows as live;
- represent token purchase, staking, or reward flows as available.

## Go Criteria For Controlled Non-Money Pilot

The controlled pilot can proceed only after:

1. First admin account exists.
2. `ADMIN_BOOTSTRAP_ENABLED=false` is confirmed after admin creation.
3. Admin can log in.
4. Admin Review and Audit Log are visible only to admin.
5. `npm --prefix v3 run smoke:production` passes immediately before the demo.
6. Founder agrees that no real money or real token movement will occur.
7. `PILOT-RUNBOOK.md` is followed step by step.

## No-Go Triggers

Stop the pilot if any of these happen:

- backend `/health` fails;
- backend does not report PostgreSQL mode;
- non-admin can access admin endpoints;
- unverified contractor can be accepted;
- document review changes do not create audit events;
- bid acceptance does not create `bid.accepted`;
- UI claims live payments, live lending, live insurance, or production token utility is ready;
- WebAuth asks for an unexpected mainnet transaction;
- any participant is asked to enter a private key or seed phrase.

## Next Actions

1. Follow `FOUNDER-ACTION-PACKET.md` Priority 1 to create first admin account in Railway.
2. Follow `FOUNDER-ACTION-PACKET.md` Priority 2 to redeploy Railway frontend if strict smoke still shows stale bundle.
3. Run `PILOT-RUNBOOK.md` with admin, homeowner, and contractor accounts.
4. Configure monitoring alerts.
5. Run PostgreSQL backup and restore drill against non-production DB.
6. Execute XPR testnet signed escrow transaction and verify through Hyperion.
7. Configure Stripe test keys and test webhook.
8. Re-run this go/no-go checklist before any pilot involving external users.
