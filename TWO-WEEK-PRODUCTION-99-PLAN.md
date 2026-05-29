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

- [ ] Inspect `C:\gcsc-store\src\services\webauth*`.
- [ ] Inspect `C:\gcsc-store\src\services\xprSettlement*`.
- [ ] Inspect backend XPR endpoints in `v3\pure-server.js`.
- [ ] Inspect current smart contracts if `C:\gcsc-website` exists.
- [ ] If contracts repo is missing, record blocker and continue with frontend/backend integration docs only.

### Task 5.2 — Create XPR Escrow Settlement Spec

- [ ] Create `XPR-ESCROW-SETTLEMENT-SPEC.md`.
- [ ] Define:
  - accepted bid -> escrow record;
  - homeowner wallet connect;
  - transfer memo format;
  - chain transaction verification;
  - milestone submit/approve/release;
  - audit event mapping;
  - failure states.
- [ ] Include exact test plan.

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

- [ ] Add tests for:
  - pending chain tx record;
  - successful verification update;
  - failed verification update;
  - duplicate tx hash rejection;
  - audit event on verification.

Verification RED:

```powershell
npm --prefix v3 run test:pg-workflow
```

Expected before implementation: test fails for missing behavior if not already present.

### Task 6.2 — Implement Minimal Backend Support

- [ ] Implement only the missing behavior.
- [ ] Do not add real token transfer.
- [ ] Do not require private keys.

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

- [ ] Add validator for:
  - wallet connected state;
  - escrow settlement call-to-action only after accepted bid;
  - no fake transaction success;
  - clear pending/verified/failed states.

Verification RED:

```powershell
npm run check:xpr-settlement
```

### Task 7.2 — Implement Signing UX

- [ ] Add UI state for signed escrow action.
- [ ] Require connected WebAuth wallet before settlement action.
- [ ] Show transaction hash only from real response/user input.
- [ ] Add error state for cancelled wallet signing.

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

- [ ] Check `C:\gcsc-website`.
- [ ] If missing, clone `Melxisedek75/gcsc-website`.
- [ ] Confirm branch and status.

### Task 8.2 — Contract Build

Before editing contract code:

- [ ] Read all existing contracts in `contracts/gcsc-core`.
- [ ] Read `contracts/gcsc-core/package.json`.
- [ ] Read proton-tsc docs/source if contract changes are needed.
- [ ] Run:

```powershell
cd contracts\gcsc-core
npm install
npm run build
npm test
```

### Task 8.3 — Deployment Readiness Doc

- [ ] Create or update `contracts/gcsc-core/DEPLOYMENT-READINESS.md`.
- [ ] Record:
  - contract accounts;
  - testnet/mainnet status;
  - required permissions;
  - transfer notify expectations;
  - manual deployment blockers.

Commit:

```powershell
git add contracts/gcsc-core/DEPLOYMENT-READINESS.md
git commit -m "docs: add smart contract deployment readiness"
git push origin <current-branch>
```

## Day 9 — Saturday, 2026-06-06 — Stripe And Payment Readiness

Goal: make payment status explicit without enabling real money prematurely.

### Task 9.1 — Stripe Backend Tests

- [ ] Inspect current Stripe endpoints.
- [ ] Add/confirm tests for:
  - missing Stripe keys -> safe 503;
  - test PaymentIntent creation path;
  - webhook signature failure;
  - webhook signature success with test secret if locally supported.

Verification:

```powershell
npm --prefix v3 run test:pg-storage
npm --prefix v3 run test:pg-workflow
```

### Task 9.2 — Payment Readiness Doc

- [ ] Create `PAYMENT-READINESS.md`.
- [ ] Include:
  - test-mode checklist;
  - live-mode blockers;
  - webhook endpoint;
  - refund/cancel policy placeholder requiring legal review;
  - contractor payout readiness.

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

- [ ] Run dependency audit where practical.
- [ ] Search for accidental secrets:

```powershell
rg -n "ghp_|RAILWAY_TOKEN|sk_live|sk_test_[A-Za-z0-9]|whsec_[A-Za-z0-9]|PRIVATE_KEY|PASSWORD=.*[A-Za-z0-9]" .
```

- [ ] Document findings in `SECURITY-PRODUCTION-CHECKLIST.md`.

### Task 10.2 — Endpoint Authorization Review

- [ ] Review all admin endpoints.
- [ ] Confirm protected endpoints require JWT.
- [ ] Confirm non-admin access returns 403.
- [ ] Add tests for any missing guard.

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

- [ ] Search frontend and docs for:
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

### Task 11.2 — Fix Unsupported Claims

- [ ] Replace unsupported claims with planned/in-progress wording.
- [ ] Keep product value proposition factual.
- [ ] Add legal review markers where founder/legal must approve.

Verification:

```powershell
npm run build
npm --prefix v3 run smoke:production
```

Commit/deploy if frontend changed.

## Day 12 — Tuesday, 2026-06-09 — End-To-End Pilot Script

Goal: create exact pilot script for founder/customer demo.

### Task 12.1 — Create Pilot Runbook

- [ ] Create `PILOT-RUNBOOK.md`.
- [ ] Include exact roles:
  - admin;
  - homeowner;
  - contractor.
- [ ] Include full click-by-click flow.
- [ ] Include expected backend audit events.
- [ ] Include what is demo-only and what is not real-money enabled.

### Task 12.2 — Add Smoke Checklist

- [ ] Add pre-demo checks.
- [ ] Add post-demo checks.
- [ ] Add rollback step if demo breaks.

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

- [ ] Backend tests.
- [ ] Frontend validators.
- [ ] Frontend build.
- [ ] Production smoke.
- [ ] Audit log guard.
- [ ] Admin runbook check.
- [ ] Backup command dry-run or documented blocker.
- [ ] XPR settlement blocker list reviewed.
- [ ] Stripe readiness blocker list reviewed.

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

- [ ] Update `PRODUCTION-READINESS.md`.
- [ ] Add readiness percentages:
  - MVP demo;
  - pilot production;
  - real-money production.
- [ ] List exact remaining blockers.

Commit:

```powershell
git add PRODUCTION-READINESS.md
git commit -m "docs: update production readiness score"
git push origin main
```

## Day 14 — Thursday, 2026-06-11 — Pilot Launch Decision

Goal: produce final go/no-go decision package.

### Task 14.1 — Create Go/No-Go Checklist

- [ ] Create `PILOT-GO-NOGO.md`.
- [ ] Include:
  - launch gates;
  - pass/fail status;
  - evidence links or command outputs;
  - founder-required approvals;
  - legal/security blockers;
  - real-money disabled/enabled status.

### Task 14.2 — Final Smoke

Run:

```powershell
npm --prefix v3 run smoke:production
```

If frontend/backend changed:

- [ ] Deploy.
- [ ] Re-run smoke.
- [ ] Update `PILOT-GO-NOGO.md`.

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
