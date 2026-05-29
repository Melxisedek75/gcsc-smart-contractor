# GCSC Smart Contractor 14-Day Production 99 Plan

Date created: 2026-05-29  
Target outcome: move GCSC / SmartContractor from MVP/demo readiness toward 99% production readiness for a controlled real-money pilot.

## Required Operating Mode

This plan is written for autonomous Codex execution inside the GCSC workspace.

On every wake cycle, Codex must:

1. Read this file first.
2. Read `PRODUCTION-READINESS.md`, `ADMIN-OPERATIONS-RUNBOOK.md`, and `DEPLOY-CHECKLIST.md`.
3. Check repo state:
   - `C:\gcsc-smart-contractor`
   - `C:\gcsc-store`
   - `C:\gcsc-store-pages`
   - `C:\gcsc-website`, if present
4. Choose the first unchecked task in priority order.
5. Execute the task using TDD for behavior changes.
6. Run the exact verification commands listed in the task.
7. Update this file with completion notes.
8. Commit and push scoped changes.
9. Deploy only if runtime backend/frontend behavior changed.
10. Run live smoke tests after deploy.
11. Report concise status in Russian.
12. Continue on the next wake cycle with the next unchecked task.

Autonomous execution is allowed for code, tests, docs, local verification, GitHub commits, pushes, Railway deploys, and smoke tests.

Autonomous execution is not allowed for:

- entering or inventing passwords;
- committing secrets;
- spending money or upgrading paid plans;
- enabling real-money payments;
- final legal approval;
- destructive database operations without backup;
- changing production DNS ownership;
- transferring real tokens or funds without explicit founder approval.

## Wake / Continuation Protocol

The automation should wake this thread repeatedly and use this instruction:

> Continue the GCSC SmartContractor 14-Day Production 99 Plan. Open `TWO-WEEK-PRODUCTION-99-PLAN.md`, choose the first unchecked task that is not blocked, execute it fully with tests/build/smoke checks, update the plan, commit, push, deploy if needed, and report concise Russian status. If blocked by secrets, payment, legal approval, or an external account action, mark the item blocked with the exact missing input and move to the next safe task.

The wake loop is timer-based. It is not a true event trigger after task completion. Practical behavior:

- If a task finishes before the next wake, the next wake picks up the next task.
- If a task is still running, Codex continues the current task.
- If blocked, Codex records the blocker and moves to the next safe task.

## Current Repositories

| Repo | Local path | Branch | Purpose |
|---|---|---|---|
| `Melxisedek75/gcsc-smart-contractor` | `C:\gcsc-smart-contractor` | `main` | Backend, deploy docs, operations, Railway service |
| `Melxisedek75/gcsc-store` | `C:\gcsc-store` | `api-backend` | Frontend dashboard/store |
| `Melxisedek75/gcsc-store` pages worktree | `C:\gcsc-store-pages` | `main` | `gcsc.store` static deployment |
| `Melxisedek75/gcsc-website` | `C:\gcsc-website` if present | project branch | Website and XPR smart contracts |

## Global Verification Commands

Backend:

```powershell
node --check v3\pure-server.js
npm --prefix v3 run test:pg-storage
npm --prefix v3 run test:pg-workflow
npm --prefix v3 run smoke:production
```

Frontend:

```powershell
npm run check:dashboard-live
npm run check:admin-documents
npm run check:admin-audit-log
npm run check:contractor-verification
npm run check:public-contractor-profile
npm run build
```

Contracts, only when editing `gcsc-website/contracts/gcsc-core`:

```powershell
cd contracts\gcsc-core
npm run build
npm test
```

Live smoke:

```powershell
curl.exe -L -s -o NUL -w "backend=%{http_code}\n" https://gcsc-backend-production.up.railway.app/health
curl.exe -L -s -o NUL -w "site=%{http_code}\n" https://gcsc.store/
curl.exe -L -s -o NUL -w "railway_frontend=%{http_code}\n" https://gcsc-store-production.up.railway.app/
```

## Definition Of 99% Production Readiness

The project reaches 99% production readiness for a controlled pilot only when all gates below are complete:

- [ ] Admin account exists, bootstrap disabled, admin UI verified.
- [ ] Full homeowner -> contractor -> document -> admin review -> verified bid -> accepted bid workflow passes on live.
- [ ] Audit log records every trust-sensitive event.
- [ ] PostgreSQL backup and restore drill completed on non-production DB.
- [ ] Monitoring/alerting is configured and documented.
- [ ] XPR/WebAuth signed escrow flow passes end-to-end.
- [ ] Smart contract deployment and permissions are verified.
- [ ] Stripe test mode and live readiness checklist completed.
- [ ] Security checklist completed and high-risk issues resolved.
- [ ] Legal/compliance review completed for escrow, token, financing, and insurance language.
- [ ] Final real-money launch decision is explicitly approved by founder.

Audit trail progress, 2026-05-29:

- Expanded backend audit coverage for MVP trust-sensitive events:
  - `project.created`;
  - `bid.submitted`;
  - `escrow.milestone.created`;
  - `escrow.milestone.submitted`;
  - `escrow.milestone.approved`;
  - `escrow.milestone.released`;
  - `escrow.milestone.disputed`;
  - `escrow.chain_tx.recorded`.
- Existing coverage already included `profile.updated`, `document.submitted`, `document.reviewed`, `wallet.connected`, `bid.accepted`, `financing.precheck.created`, `payment.intent.created`, `escrow.chain_tx.confirmed`, and `escrow.chain_tx.failed`.
- Verification passed: `node --check v3\pure-server.js`, `npm --prefix v3 run test:pg-storage`, `npm --prefix v3 run test:pg-workflow`, and `npm --prefix v3 run smoke:production`.
- Frontend Admin Audit Log now labels and filters the expanded event set: project, bid submission/acceptance, milestone lifecycle, chain transaction, financing, and payment intent events.
- Frontend verification passed: `npm run check:admin-audit-log`, full dashboard validators, and `npm run build`.
- GitHub Pages build was updated from the verified frontend bundle.
- Production smoke now checks bundle freshness markers for `gcsc.store` and reports a stale-bundle warning for Railway frontend unless `STRICT_RAILWAY_FRONTEND=1` is enabled.
- Added `RAILWAY-FRONTEND-REDEPLOY-RUNBOOK.md` with exact manual redeploy and strict verification steps.
- Top-level audit gate remains unchecked until the first live admin account exists and the audit log is verified against a live role-by-role pilot run.

## Day 1 — Friday, 2026-05-29 — Control Plane And Admin Gate

Goal: make the project controllable before deeper production work.

### Task 1.1 — Verify Current State

- [x] Run `git status --short --branch` in all repos.
- [x] Run `git log --oneline -5` in all repos.
- [x] Run backend global verification commands.
- [x] Run frontend global verification commands if frontend files changed since last verified build.
- [x] Record latest commit hashes in this file under Day 1 notes.

Acceptance:

- No dirty worktree except intentional edits.
- Backend tests pass.
- Production smoke passes.

Day 1 notes, 2026-05-29:

- Backend `C:\gcsc-smart-contractor`: clean before work, latest baseline commit `6eeccbe docs: add two-week production readiness plan`.
- Frontend `C:\gcsc-store`: clean, latest baseline commit `57efb40 fix: improve loans financing dashboard layout`.
- Pages `C:\gcsc-store-pages`: clean, latest baseline commit `3b66178 deploy: update loans financing layout build`.
- Contracts repo `C:\gcsc-website`: not present locally; future contract tasks must clone or restore it before contract work.
- Backend verification passed: `node --check v3\pure-server.js`, `npm --prefix v3 run test:pg-storage`, `npm --prefix v3 run test:pg-workflow`, `npm --prefix v3 run smoke:production`.
- Frontend baseline verification passed: dashboard/admin/audit/contractor/profile validators and `npm run build`.

### Task 1.2 — First Admin Account

Founder action required:

- [ ] Founder sets `ADMIN_BOOTSTRAP_ENABLED=true`.
- [ ] Founder sets `ADMIN_EMAIL`.
- [ ] Founder sets `ADMIN_PASSWORD`.
- [ ] Founder sets `ADMIN_FULL_NAME=GCSC Admin`.

Blocked, 2026-05-29:

- Missing founder-provided Railway admin variables and password.
- Codex must not invent or enter admin credentials.
- Continue with safe non-secret tasks until founder confirms admin variables are set.

Codex action after founder confirms variables are set:

- [ ] Redeploy backend.
- [ ] Smoke-test `/health`.
- [ ] Founder logs in at `https://gcsc.store/dashboard`.
- [ ] Confirm admin sidebar includes Admin Review and Audit Log.
- [ ] Founder disables bootstrap: `ADMIN_BOOTSTRAP_ENABLED=false`.
- [ ] Redeploy backend again.
- [ ] Verify admin can still log in.

Acceptance:

- Admin exists.
- Bootstrap disabled.
- Admin endpoints reject unauthenticated requests with 401.
- Non-admin users cannot access admin endpoints.

### Task 1.3 — Admin Operations Evidence

- [ ] Add a short `ADMIN-OPERATIONS-EVIDENCE.md` file after admin is created.
- [ ] Record date, checks performed, no secrets.
- [ ] Commit and push evidence file.

Blocked, 2026-05-29:

- Depends on Task 1.2 first admin creation and bootstrap disablement.

Verification:

```powershell
npm --prefix v3 run smoke:production
```

## Day 2 — Saturday, 2026-05-30 — Live Trust Workflow

Goal: prove the non-money platform trust flow works on live services.

### Task 2.1 — Backend Workflow Smoke Test Coverage

- [x] Inspect `v3/tests/postgres-storage-smoke.js`.
- [x] Add or confirm coverage for:
  - contractor document submission;
  - admin approval;
  - admin rejection with note;
  - compliance status update;
  - bid acceptance blocked for unverified contractor;
  - bid acceptance allowed for verified contractor;
  - audit events for document and bid actions.

Day 2 notes, started 2026-05-29:

- Existing backend tests already covered contractor document submission, admin approval, compliance `pending_review` and `verified`, unverified bid block, verified bid acceptance, public contractor profile, and audit events.
- Added explicit coverage for admin rejection with review note, compliance `rejected`, contractor resubmission, and return to `pending_review`.
- Verification passed: `npm --prefix v3 run test:pg-storage` and `npm --prefix v3 run test:pg-workflow`.

Verification:

```powershell
npm --prefix v3 run test:pg-storage
npm --prefix v3 run test:pg-workflow
```

Commit:

```powershell
git add v3\tests v3\pure-server.js
git commit -m "test: strengthen trust workflow coverage"
git push origin main
```

### Task 2.2 — Frontend Workflow Validation

- [x] Inspect existing validators in `C:\gcsc-store\scripts`.
- [x] Add validator if missing for complete trust workflow visibility:
  - Admin Review visible only for admin;
  - Audit Log visible only for admin;
  - contractor profile link shown before accepting bid;
  - unverified bid warning/block shown;
  - review note is required on rejection.

Day 2 frontend notes, 2026-05-29:

- Existing validation was split across admin document, audit log, contractor verification, and public contractor profile validators.
- Added `npm run check:trust-workflow` as a single aggregate production trust workflow validator.
- Verification passed: `npm run check:trust-workflow`, existing trust validators, and `npm run build`.

Verification:

```powershell
npm run check:admin-documents
npm run check:admin-audit-log
npm run check:contractor-verification
npm run check:public-contractor-profile
npm run build
```

Commit and deploy if frontend changed:

```powershell
git add package.json scripts src
git commit -m "test: strengthen trust workflow frontend validation"
git push origin api-backend
```

Then update `C:\gcsc-store-pages` from `dist` and push pages.

## Day 3 — Sunday, 2026-05-31 — Backup And Restore Drill

Goal: prove data can be backed up and restored before any real-money pilot.

### Task 3.1 — Backup Script

- [x] Create `v3/scripts/backup-postgres.mjs`.
- [x] Script must require `DATABASE_URL`.
- [x] Script must run `pg_dump` with custom format.
- [x] Script must write backup to a local `backups/` folder ignored by git.
- [x] Script must print backup file path and size.
- [x] Add `backups/` to `.gitignore` if missing.
- [x] Add npm script `db:backup`.

TDD:

- [x] Add a validator test that checks script exists, refuses missing `DATABASE_URL`, and writes only to ignored backup paths.

Day 3 backup notes, 2026-05-29:

- Added `v3/scripts/backup-postgres.mjs`.
- Added `npm --prefix v3 run db:backup`.
- Added `v3/tests/backup-script.test.js`.
- Added `backups/` to `.gitignore`.
- Verification passed: `node v3\tests\backup-script.test.js`, `git check-ignore backups/test.dump`, `npm --prefix v3 run test:pg-storage`, `npm --prefix v3 run test:pg-workflow`.

Verification:

```powershell
node v3\tests\backup-script.test.js
git check-ignore backups/test.dump
```

Commit:

```powershell
git add .gitignore v3\package.json v3\scripts v3\tests
git commit -m "chore: add postgres backup script"
git push origin main
```

### Task 3.2 — Restore Drill Documentation

- [x] Create `POSTGRES-RESTORE-DRILL.md`.
- [x] Include exact restore command for a non-production DB.
- [x] Include evidence checklist.
- [x] Do not include real DB URLs or passwords.

Day 3 restore notes, 2026-05-29:

- Added `POSTGRES-RESTORE-DRILL.md` with backup creation, non-production restore command, verification queries, evidence requirements, pass criteria, and fail criteria.
- No live restore was executed because it requires founder-provided non-production PostgreSQL connection details.

Verification:

```powershell
rg -n "DATABASE_URL=.*postgres|PASSWORD=|Railway Token|ghp_" POSTGRES-RESTORE-DRILL.md
```

Expected: no real secrets.

## Day 4 — Monday, 2026-06-01 — Monitoring And Alerts

Goal: make production failure visible without manual checking.

### Task 4.1 — Monitoring Plan

- [x] Create `MONITORING-RUNBOOK.md`.
- [x] Include monitored URLs:
  - backend `/health`;
  - `gcsc.store`;
  - Railway frontend;
  - admin endpoint unauthenticated 401 guard.
- [x] Include alert policy:
  - backend health non-200;
  - database not `postgres`;
  - frontend non-200;
  - repeated 5xx;
  - deploy failure.
- [x] Include recommended low/no-cost monitoring services but do not sign up or enter credentials autonomously.

Day 4 monitoring notes, 2026-05-29:

- Added `MONITORING-RUNBOOK.md`.
- Monitoring runbook covers backend health, main site, Railway frontend, and admin audit unauthenticated guard.
- Alert policy covers backend non-200, database mode regression, frontend non-200, repeated 5xx, deploy failure, and admin auth guard regression.
- Third-party monitoring services are documented as founder-approved options only; no account setup or credentials were entered.

Verification:

```powershell
npm --prefix v3 run smoke:production
```

### Task 4.2 — CI Smoke Check

- [x] Add GitHub Actions workflow for backend smoke/static validation if repository CI is enabled.
- [x] Avoid secrets.
- [x] Run syntax/test commands that do not require production credentials.

Day 4 CI notes, 2026-05-29:

- Added `.github/workflows/backend-production-checks.yml`.
- Workflow runs `npm ci --prefix v3`, `node --check v3/pure-server.js`, backend smoke tests, and public production smoke.
- Workflow uses only public endpoints and no repository secrets.

Verification:

```powershell
git diff --check
npm --prefix v3 run test:pg-storage
```

Commit:

```powershell
git add .github MONITORING-RUNBOOK.md
git commit -m "chore: add production monitoring runbook and CI checks"
git push origin main
```

## Day 5 — Tuesday, 2026-06-02 — XPR/WebAuth Architecture Lock

Goal: define exact signed escrow path before coding money movement.

### Task 5.1 — Read Existing XPR/Wallet Code

- [x] Inspect `C:\gcsc-store\src\services\webauth*`.
- [x] Inspect `C:\gcsc-store\src\services\xprSettlement*`.
- [x] Inspect backend XPR endpoints in `v3\pure-server.js`.
- [x] Inspect current smart contracts if `C:\gcsc-website` exists.
- [x] If contracts repo is missing, record blocker and continue with frontend/backend integration docs only.

Day 5 inspection notes, 2026-05-29:

- Frontend WebAuth service uses `@proton/web-sdk`, returns wallet metadata and a signing session with `session.transact`.
- Frontend XPR settlement service signs `gcscrow1111` testnet actions: `submitmilestone`, `approvemilestone`, `releasemilestone`, `disputemilestone`.
- Dashboard records returned WebAuth transaction ids through `POST /api/milestones/:id/chain-txs`.
- Backend stores chain tx evidence in `milestone_chain_txs` and verifies through Hyperion.
- Current backend verifier confirms the expected contract action exists in the transaction; Day 6 must harden duplicate tx rejection and verification audit events.
- `C:\gcsc-website` is not present locally, so contract build/deployment verification remains blocked until the repo is restored or cloned.

### Task 5.2 — Create XPR Escrow Settlement Spec

- [x] Create `XPR-ESCROW-SETTLEMENT-SPEC.md`.
- [x] Define:
  - accepted bid -> escrow record;
  - homeowner wallet connect;
  - transfer memo format;
  - chain transaction verification;
  - milestone submit/approve/release;
  - audit event mapping;
  - failure states.
- [x] Include exact test plan.

Day 5 spec notes, 2026-05-29:

- Added `XPR-ESCROW-SETTLEMENT-SPEC.md`.
- Defined Layer 1 backend escrow state flow, Layer 2 on-chain funding expectations, WebAuth signing flow, transaction evidence storage, verification hardening requirements, audit mapping, failure states, and backend/frontend/contract test plan.

Verification:

```powershell
rg -n "TBD|TODO|fake|placeholder" XPR-ESCROW-SETTLEMENT-SPEC.md
```

Expected: no vague placeholders.

Commit:

```powershell
git add XPR-ESCROW-SETTLEMENT-SPEC.md
git commit -m "docs: define xpr escrow settlement spec"
git push origin main
```

## Day 6 — Wednesday, 2026-06-03 — XPR Backend Settlement Smoke

Goal: backend can record and verify escrow chain transaction state safely.

### Task 6.1 — Add Backend Tests First

- [x] Add tests for:
  - pending chain tx record;
  - successful verification update;
  - failed verification update;
  - duplicate tx hash rejection;
  - audit event on verification.

Day 6 test notes, 2026-05-29:

- Added workflow coverage for broadcast chain tx evidence.
- Added RED test for duplicate `tx_id` rejection. It failed on previous upsert behavior with `201 !== 409`.
- Added verification audit coverage for `escrow.chain_tx.confirmed`.
- Added failed Hyperion lookup coverage for `escrow.chain_tx.failed`.
- Updated final escrow milestone assertion to verify both confirmed and failed chain tx records.

Verification RED:

```powershell
npm --prefix v3 run test:pg-workflow
```

Expected before implementation: test fails for missing behavior if not already present.

### Task 6.2 — Implement Minimal Backend Support

- [x] Implement only the missing behavior.
- [x] Do not add real token transfer.
- [x] Do not require private keys.

Day 6 implementation notes, 2026-05-29:

- `createStoredMilestoneChainTx` now rejects duplicate transaction ids with HTTP 409 instead of updating prior evidence.
- PostgreSQL chain tx insert no longer uses `ON CONFLICT ... DO UPDATE`.
- In-memory chain tx storage now appends only new records after duplicate check.
- Verification endpoint now records `escrow.chain_tx.confirmed` or `escrow.chain_tx.failed` audit events with escrow, milestone, project, tx, chain, contract, actor, status, and error metadata.

Verification:

```powershell
node --check v3\pure-server.js
npm --prefix v3 run test:pg-storage
npm --prefix v3 run test:pg-workflow
```

Commit:

```powershell
git add v3
git commit -m "feat: harden xpr escrow transaction tracking"
git push origin main
```

Deploy if runtime changed, then:

```powershell
npm --prefix v3 run smoke:production
```

## Day 7 — Thursday, 2026-06-04 — WebAuth Frontend Signing UX

Goal: replace passive wallet metadata with a clear signed-action flow where possible.

### Task 7.1 — Frontend Tests / Validators

- [x] Add validator for:
  - wallet connected state;
  - escrow settlement call-to-action only after accepted bid;
  - no fake transaction success;
  - clear pending/verified/failed states.

Day 7 validator notes, 2026-05-29:

- Extended `C:\gcsc-store\scripts\validate-xpr-settlement-layer.mjs`.
- Added checks that Dashboard requires a saved WebAuth wallet before escrow signing.
- Added checks that Dashboard refuses to record missing WebAuth transaction ids.
- Added checks that Dashboard rejects WebAuth account mismatch before recording tx evidence.
- Confirmed settlement controls remain scoped to accepted escrow details.

Verification RED:

```powershell
npm run check:xpr-settlement
```

### Task 7.2 — Implement Signing UX

- [x] Add UI state for signed escrow action.
- [x] Require connected WebAuth wallet before settlement action.
- [x] Show transaction hash only from real response/user input.
- [x] Add error state for cancelled wallet signing.

Day 7 implementation notes, 2026-05-29:

- `C:\gcsc-store\src\pages\Dashboard.tsx` now blocks escrow signing until `user.wallet.accountName` exists.
- Signed WebAuth account must match the saved account before chain evidence is recorded.
- Missing WebAuth transaction id now shows an error and records nothing.
- Existing cancellation/error handling continues through the `catch` path.
- Verification passed: `npm run check:xpr-settlement`, `npm run check:webauth`, `npm run check:chain-audit`, global frontend validators, and `npm run build`.

Day 7 live deploy check, 2026-05-29:

- `https://gcsc.store/` serves the updated bundle with `submitms`, `approvems`, `releasems`, `disputems`.
- `https://gcsc-store-production.up.railway.app/` still serves an older frontend bundle with the previous long action names.
- Blocker: local Railway CLI is not installed and no Railway API token is available in the workspace, so Codex cannot force-redeploy the Railway frontend service from here.
- Safe next action: founder can trigger redeploy in Railway UI for the frontend service, or provide a Railway token through Railway/Codex secret handling, not through git.
- Added strict smoke support through `STRICT_RAILWAY_FRONTEND=1`; normal smoke now keeps `gcsc.store` strict and reports Railway frontend staleness as a warning until redeploy is available.

Verification:

```powershell
npm run check:webauth
npm run check:xpr-settlement
npm run build
```

Commit/deploy:

```powershell
git add package.json scripts src
git commit -m "feat: add webauth escrow signing workflow"
git push origin api-backend
```

Update pages from `dist`, commit, push.

## Day 8 — Friday, 2026-06-05 — Smart Contract Verification

Goal: verify contract code, deployment assumptions, and permissions.

### Task 8.1 — Locate Contracts Repo

- [x] Check `C:\gcsc-website`.
- [x] If missing, clone `Melxisedek75/gcsc-website`.
- [x] Confirm branch and status.

Day 8 repo notes, 2026-05-29:

- `C:\gcsc-website` was missing and was cloned from `Melxisedek75/gcsc-website`.
- Branch: `main`.
- Baseline commit inspected: `f2a96ad feat: add contract backed working capital gate`.

### Task 8.2 — Contract Build

Before editing contract code:

- [x] Read all existing contracts in `contracts/gcsc-core`.
- [x] Read `contracts/gcsc-core/package.json`.
- [x] Read proton-tsc docs/source if contract changes are needed.
- [x] Run:

```powershell
cd contracts\gcsc-core
npm install
npm run build
npm test
```

Day 8 build/test notes, 2026-05-29:

- No contract code was edited, so proton-tsc source reading was not required in this block.
- `npm install --package-lock=false` completed, but reported 27 dependency vulnerabilities in the contract toolchain dependency tree.
- `npm run build` passed for 13 contracts.
- `npm test` passed with 31 passing tests.
- Build/test emitted dependency deprecation warnings; recorded in contract readiness doc.
- Important blocker found: current `gcscrow1111` contract action names are `submitms`, `approvems`, `releasems`, `disputems`, while backend/frontend XPR evidence currently uses `submitmilestone`, `approvemilestone`, `releasemilestone`, `disputemilestone`. This must be aligned before end-to-end WebAuth escrow settlement can pass.

Day 8 action-name alignment notes, 2026-05-29:

- Backend chain tx allowlist and role mapping were aligned to actual `gcscrow1111` actions: `submitms`, `approvems`, `releasems`, `disputems`.
- Backend PostgreSQL migration now converts existing long action names to short contract action names and refreshes the `milestone_chain_txs_action_check` constraint.
- Legacy `v3/routes/xpr.js` release action was aligned to `releasems`.
- Frontend `xprSettlement.ts`, Dashboard signing buttons, and XPR settlement validator were aligned to real contract action names.
- `XPR-ESCROW-SETTLEMENT-SPEC.md` was updated to match the deployed contract action naming.

### Task 8.3 — Deployment Readiness Doc

- [x] Create or update `contracts/gcsc-core/DEPLOYMENT-READINESS.md`.
- [x] Record:
  - contract accounts;
  - testnet/mainnet status;
  - required permissions;
  - transfer notify expectations;
  - manual deployment blockers.

Day 8 deployment readiness notes, 2026-05-29:

- Added `contracts/gcsc-core/DEPLOYMENT-READINESS.md`.
- Commit pushed to `gcsc-website` main: `c10a635 docs: add smart contract deployment readiness`.
- Deployment readiness is marked blocked until deployed account status, permissions, dependency audit plan, missing module tests, and action-name alignment are complete.

Commit:

```powershell
git add contracts/gcsc-core/DEPLOYMENT-READINESS.md
git commit -m "docs: add smart contract deployment readiness"
git push origin <current-branch>
```

## Day 9 — Saturday, 2026-06-06 — Stripe And Payment Readiness

Goal: make payment status explicit without enabling real money prematurely.

### Task 9.1 — Stripe Backend Tests

- [x] Inspect current Stripe endpoints.
- [x] Add/confirm tests for:
  - missing Stripe keys -> safe 503;
  - test PaymentIntent creation path;
  - webhook signature failure;
  - webhook signature success with test secret if locally supported.

Day 9 Stripe backend notes, 2026-05-29:

- Production Railway backend starts `node v3/pure-server.js`, so payment readiness was implemented and tested against `pure-server.js`, not only the legacy Express router.
- Added `v3/tests/stripe-readiness-smoke.js`.
- Added `npm --prefix v3 run test:stripe-readiness`.
- `POST /api/stripe/create-payment-intent` is test-mode only and returns safe `503` when `STRIPE_SECRET_KEY` is missing or not a `sk_test_` key.
- Test PaymentIntent creation path is covered through a local Stripe SDK stub; no real Stripe network call or live money is used.
- `POST /api/stripe/webhook` verifies `Stripe-Signature`, rejects invalid signatures with `400`, and accepts locally signed test events.

Verification:

```powershell
npm --prefix v3 run test:stripe-readiness
npm --prefix v3 run test:pg-storage
npm --prefix v3 run test:pg-workflow
```

### Task 9.2 — Payment Readiness Doc

- [x] Create `PAYMENT-READINESS.md`.
- [x] Include:
  - test-mode checklist;
  - live-mode blockers;
  - webhook endpoint;
  - refund/cancel policy placeholder requiring legal review;
  - contractor payout readiness.

Day 9 payment readiness notes, 2026-05-29:

- Added `PAYMENT-READINESS.md`.
- Document states Stripe is test-mode only and real-money processing is not enabled.
- Live-mode blockers include legal review, Stripe account verification, webhook testing, Connect payouts, refund/cancellation policy, backups, monitoring, and explicit founder approval.

Verification:

```powershell
rg -n "real-money ready|live enabled|guaranteed|certified" PAYMENT-READINESS.md
```

Expected: no unsupported claims.

Commit:

```powershell
git add v3 PAYMENT-READINESS.md
git commit -m "docs: add payment readiness checklist"
git push origin main
```

## Day 10 — Sunday, 2026-06-07 — Security Review

Goal: produce a concrete security checklist and fix high-risk local issues.

### Task 10.1 — Dependency And Secret Scan

- [x] Run dependency audit where practical.
- [x] Search for accidental secrets:

```powershell
rg -n "ghp_|RAILWAY_TOKEN|sk_live|sk_test_[A-Za-z0-9]|whsec_[A-Za-z0-9]|PRIVATE_KEY|PASSWORD=.*[A-Za-z0-9]" .
```

- [x] Document findings in `SECURITY-PRODUCTION-CHECKLIST.md`.

Day 10 dependency/secret notes, 2026-05-29:

- Ran `npm --prefix v3 audit --omit=dev --audit-level=high`.
- Audit found no high or critical vulnerabilities; remaining findings are low/moderate dependency-chain issues mainly through Proton/WebAuth, Google/uuid, zod, elliptic, and node-cron.
- Did not run `npm audit fix --force` because it would force a breaking `@proton/web-sdk` upgrade path.
- Secret scan found documentation placeholders and scan patterns only, not real tokens/keys.
- Added `SECURITY-PRODUCTION-CHECKLIST.md`.

### Task 10.2 — Endpoint Authorization Review

- [x] Review all admin endpoints.
- [x] Confirm protected endpoints require JWT.
- [x] Confirm non-admin access returns 403.
- [x] Add tests for any missing guard.

Day 10 authorization notes, 2026-05-29:

- Reviewed production `v3/pure-server.js` admin endpoints:
  - `GET /api/admin/documents`
  - `GET /api/admin/audit-events`
  - `GET /api/admin/financing-prechecks`
  - `PUT /api/admin/documents/:id/review`
- Added regression checks in `v3/tests/postgres-storage-smoke.js` for unauthenticated `401` and non-admin `403` access paths.
- Verification passed: `npm --prefix v3 run test:pg-storage`.

Verification:

```powershell
node --check v3\pure-server.js
npm --prefix v3 run test:pg-storage
npm --prefix v3 run test:pg-workflow
```

Commit:

```powershell
git add SECURITY-PRODUCTION-CHECKLIST.md v3
git commit -m "security: add production checklist and auth guard tests"
git push origin main
```

## Day 11 — Monday, 2026-06-08 — Legal And Compliance Wording

Goal: remove unsupported claims and isolate legal-risk areas.

### Task 11.1 — Copy Audit

- [x] Search frontend and docs for:
  - fake user claims;
  - fake countries;
  - fake revenue;
  - fake certifications;
  - guaranteed returns;
  - live lending claims;
  - live insurance claims.

Commands:

```powershell
rg -n "certified|guaranteed|countries|\\$[0-9]+M|live lending|insured|SEC|audit|CertiK|SOC 2|ISO" C:\gcsc-store C:\gcsc-smart-contractor
```

Day 11 copy audit notes, 2026-05-29:

- Scanned `C:\gcsc-store` and `C:\gcsc-smart-contractor` for unsupported certification, revenue, country, guarantee, live lending, audit, SEC, and insurance claims.
- Focused frontend risks were found in `src/pages/Token.tsx` and `src/pages/Security.tsx`.
- Backend matches were mostly investor/application docs, audit labels, runbooks, or explicit "not live" disclaimers and were not changed in this frontend wording pass.

### Task 11.2 — Fix Unsupported Claims

- [x] Replace unsupported claims with planned/in-progress wording.
- [x] Keep product value proposition factual.
- [x] Add legal review markers where founder/legal must approve.

Day 11 frontend legal wording notes, 2026-05-29:

- Added `npm run check:legal-claims`.
- Removed token-page claims for passive income, FDIC-insured wallets, lowest card fees, 24/7 support, instant token purchase, and fixed country availability.
- Changed Metal Pay copy to planned token access with eligibility/jurisdiction limits.
- Changed Security page from completed/current claims to target/planned wording for app security, encryption, MFA, disaster recovery, smart contract deployment, on-chain records, audits, and digital asset legal review.
- Verification passed: `npm run check:legal-claims`, trust/admin/profile validators, loans financing validator, and `npm run build`.

Verification:

```powershell
npm run build
npm --prefix v3 run smoke:production
```

Commit/deploy if frontend changed.

## Day 12 — Tuesday, 2026-06-09 — End-To-End Pilot Script

Goal: create exact pilot script for founder/customer demo.

### Task 12.1 — Create Pilot Runbook

- [x] Create `PILOT-RUNBOOK.md`.
- [x] Include exact roles:
  - admin;
  - homeowner;
  - contractor.
- [x] Include full click-by-click flow.
- [x] Include expected backend audit events.
- [x] Include what is demo-only and what is not real-money enabled.

Day 12 pilot runbook notes, 2026-05-29:

- Added `PILOT-RUNBOOK.md`.
- Runbook covers admin, homeowner, and contractor roles.
- Runbook includes click-by-click flows for contractor onboarding, admin document review, homeowner project creation, contractor bidding, verified bid acceptance, milestone workflow, XPR/WebAuth transaction evidence, and financing precheck review.
- Expected audit events are mapped for `profile.updated`, `document.submitted`, `document.reviewed`, `wallet.connected`, `bid.accepted`, `financing.precheck.created`, `escrow.chain_tx.confirmed`, and `escrow.chain_tx.failed`.
- Real-money boundaries are explicit: no live Stripe charges, contractor payouts, live lending, insurance assignment, mainnet escrow settlement, or real token movement during pilot.
- Admin setup remains a gate until the first admin account is created and bootstrap is disabled.

### Task 12.2 — Add Smoke Checklist

- [x] Add pre-demo checks.
- [x] Add post-demo checks.
- [x] Add rollback step if demo breaks.

Day 12 smoke/rollback notes, 2026-05-29:

- Pre-demo checks require `npm --prefix v3 run smoke:production`, dashboard open check, and current/stale frontend note.
- Post-demo checks require Audit Log review and non-secret evidence capture.
- Rollback steps cover frontend-only failures, backend health/API failures, database issues, and security incidents.

Verification:

```powershell
npm --prefix v3 run smoke:production
```

Commit:

```powershell
git add PILOT-RUNBOOK.md
git commit -m "docs: add pilot runbook"
git push origin main
```

## Day 13 — Wednesday, 2026-06-10 — Full Dress Rehearsal

Goal: run everything as if launching pilot tomorrow.

### Task 13.1 — Full Verification Pass

- [x] Backend tests.
- [x] Frontend validators.
- [x] Frontend build.
- [x] Production smoke.
- [x] Audit log guard.
- [x] Admin runbook check.
- [x] Backup command dry-run or documented blocker.
- [x] XPR settlement blocker list reviewed.
- [x] Stripe readiness blocker list reviewed.

Day 13 full dress rehearsal notes, 2026-05-29:

- Backend verification passed: `node --check v3\pure-server.js`, `npm --prefix v3 run test:pg-storage`, `npm --prefix v3 run test:pg-workflow`, `npm --prefix v3 run test:stripe-readiness`, and `npm --prefix v3 run smoke:production`.
- Frontend verification passed: dashboard live, admin documents, admin audit log, contractor verification, public contractor profile, trust workflow, loans/financing, legal claims, XPR settlement validators, and `npm run build`.
- Production smoke confirmed backend health OK, PostgreSQL mode, `gcsc.store` HTTP 200, Railway frontend HTTP 200, and unauthenticated admin audit guard HTTP 401.
- Backup script safely refused to run without `DATABASE_URL`; live backup/restore drill remains blocked until founder provides a non-production restore database and permits a production backup run.
- Admin runbook remains operationally valid, but first real admin creation is still blocked on founder-set Railway variables.
- XPR settlement blocker list remains: real testnet signed transaction, Hyperion confirmation, contract deployment/permission verification, and founder approval before any real token movement.
- Stripe blocker list remains: founder-provided Stripe test keys, Railway webhook setup, real Stripe test-mode card run, Connect payout design, legal review, and explicit live-mode approval.

Commands:

```powershell
node --check v3\pure-server.js
npm --prefix v3 run test:pg-storage
npm --prefix v3 run test:pg-workflow
npm --prefix v3 run smoke:production
```

```powershell
npm run check:dashboard-live
npm run check:admin-documents
npm run check:admin-audit-log
npm run check:contractor-verification
npm run check:public-contractor-profile
npm run build
```

### Task 13.2 — Readiness Score Update

- [x] Update `PRODUCTION-READINESS.md`.
- [x] Add readiness percentages:
  - MVP demo;
  - pilot production;
  - real-money production.
- [x] List exact remaining blockers.

Day 13 readiness score notes, 2026-05-29:

- Updated `PRODUCTION-READINESS.md` with current readiness estimates:
  - MVP demo: 90%;
  - controlled non-money pilot: 74%;
  - real-money production: 43%.
- Added full dress rehearsal evidence and current blockers.
- Marked readiness percentages as engineering estimates, not legal or financial approval.

Commit:

```powershell
git add PRODUCTION-READINESS.md
git commit -m "docs: update production readiness score"
git push origin main
```

## Day 14 — Thursday, 2026-06-11 — Pilot Launch Decision

Goal: produce final go/no-go decision package.

### Task 14.1 — Create Go/No-Go Checklist

- [x] Create `PILOT-GO-NOGO.md`.
- [x] Include:
  - launch gates;
  - pass/fail status;
  - evidence links or command outputs;
  - founder-required approvals;
  - legal/security blockers;
  - real-money disabled/enabled status.

Day 14 go/no-go notes, 2026-05-29:

- Added `PILOT-GO-NOGO.md`.
- Current decision is:
  - MVP demo: go with controls;
  - controlled non-money pilot: conditional go after first admin setup, bootstrap disablement, monitoring/backup setup, and role-by-role rehearsal;
  - real-money production: no-go.
- Founder approvals, legal blockers, security blockers, pass criteria, no-go triggers, and next actions are listed explicitly.

### Task 14.2 — Final Smoke

Run:

```powershell
npm --prefix v3 run smoke:production
```

If frontend/backend changed:

- [x] Deploy not required because runtime frontend/backend code did not change.
- [x] Re-run smoke.
- [x] Update `PILOT-GO-NOGO.md`.

Day 14 final smoke notes, 2026-05-29:

- Runtime frontend/backend code did not change in this Day 14 block, so no deploy is required.
- Final smoke passed: backend health OK, database `postgres`, admin audit unauthenticated guard HTTP 401, `gcsc.store` HTTP 200, Railway frontend HTTP 200.

Commit:

```powershell
git add PILOT-GO-NOGO.md PRODUCTION-READINESS.md
git commit -m "docs: add pilot go-no-go checklist"
git push origin main
```

## Autonomous Blocker Policy

If blocked, Codex must not stop the entire plan. It must:

1. Mark the task as blocked in this file.
2. Record the exact missing input.
3. Move to the next safe task.
4. Continue until all safe tasks are complete.

Common blockers:

| Blocker | Allowed action |
|---|---|
| Missing admin password | Document exact Railway step, continue to non-secret tasks. |
| Missing `DATABASE_URL` for backup | Create scripts/docs, skip live backup execution. |
| Missing contracts repo | Record missing local repo, continue backend/frontend work. |
| Legal approval needed | Mark legal gate blocked, do not approve claims. |
| Real payment action needed | Do not enable live money, keep test-mode only. |
| Real token transfer needed | Do not transfer funds without explicit founder approval. |

## Daily Status Format

Every autonomous report must use this format:

```text
Дата:
Выполнено:
Проверки:
Commit/push:
Deploy:
Live smoke:
Блокеры:
Следующая задача:
```
