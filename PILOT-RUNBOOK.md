# GCSC Smart Contractor Pilot Runbook

Date: 2026-05-29

Purpose: run a controlled founder/customer demo of the live GCSC Smart Contractor MVP without enabling real-money payments, real lending, or real token movement.

Live services:

| Service | URL | Expected status |
|---|---|---|
| Main site | `https://gcsc.store` | HTTP 200 |
| Railway frontend | `https://gcsc-store-production.up.railway.app` | HTTP 200, may lag behind GitHub Pages until Railway frontend is redeployed |
| Backend health | `https://gcsc-backend-production.up.railway.app/health` | HTTP 200, `database: postgres` |
| Admin guard | `https://gcsc-backend-production.up.railway.app/api/admin/audit-events?limit=1` | HTTP 401 without token |

## Pilot Boundaries

This pilot demonstrates:

- user registration and login;
- homeowner and contractor profile onboarding;
- contractor document upload;
- admin document approval/rejection;
- WebAuth wallet metadata linking;
- project posting;
- contractor bid submission;
- verified-contractor bid acceptance guard;
- escrow and milestone workflow records in PostgreSQL;
- audit log visibility for trust-sensitive actions;
- demo-only financing precheck records;
- testnet/signed transaction evidence recording where available.

This pilot does not enable:

- real homeowner fund custody;
- live Stripe charges;
- live Stripe Connect contractor payouts;
- real loan offers or credit approvals;
- insurance claim assignment;
- real GCSC/GCST token sale;
- real XPR mainnet escrow settlement;
- legal approval for production payments.

Stop immediately before any step that asks for a live card charge, live token transfer, production private key, seed phrase, or irreversible database action.

## Required Roles

Use separate browser profiles, incognito windows, or clearly separate accounts.

| Role | Purpose | Required before demo |
|---|---|---|
| Admin | Reviews documents and audit log | First admin account must exist; bootstrap must be disabled after creation |
| Homeowner | Posts project, reviews bids, accepts verified contractor, manages milestones | Registered owner account |
| Contractor | Completes business profile, uploads documents, connects wallet, submits bid | Registered builder account |

Do not share passwords in chat or commit them to git. Store any real credentials only in the user's password manager or Railway variables.

## Pre-Demo Checks

Run from `C:\gcsc-smart-contractor`:

```powershell
npm --prefix v3 run smoke:production
```

Expected:

- backend health is HTTP 200;
- backend health JSON reports PostgreSQL mode;
- `gcsc.store` is HTTP 200;
- Railway frontend is HTTP 200;
- unauthenticated admin audit endpoint returns HTTP 401.

Optional browser checks:

1. Open `https://gcsc.store`.
2. Click `Dashboard`.
3. Confirm the login/register screen opens.
4. Confirm no page presents live-money readiness as completed.

If `gcsc.store` is current but Railway frontend still shows stale content, use `gcsc.store` for the pilot and redeploy the Railway frontend later.

## Admin Setup Gate

If the admin account does not exist yet, stop the pilot and complete `ADMIN-OPERATIONS-RUNBOOK.md`.

Minimum required state:

1. `ADMIN_BOOTSTRAP_ENABLED=true` was used once.
2. Admin logged in successfully.
3. `ADMIN_BOOTSTRAP_ENABLED=false` was set after first login.
4. Backend was redeployed after disabling bootstrap.
5. Admin can still log in.
6. Non-admin users cannot access Admin Review, Audit Log, or Financing Review.

Do not continue into contractor verification until this gate is complete.

## Demo Flow A: Contractor Onboarding

Actor: Contractor.

1. Open `https://gcsc.store/dashboard`.
2. Choose register mode.
3. Select `Builder`.
4. Enter contractor email and password.
5. Complete the verification step if the backend/provider requires it.
6. Open `Profile`.
7. Fill business profile fields:
   - company name;
   - EIN;
   - license number;
   - years in business;
   - service area;
   - specialties;
   - city, state, ZIP;
   - business bio;
   - logo image if available.
8. Save profile.
9. Open `Compliance`.
10. Upload the required contractor documents:
    - contractor license;
    - insurance certificate;
    - business EIN.
11. Open `Wallet`.
12. Connect WebAuth wallet metadata if the wallet is available.

Expected backend audit events:

| User action | Audit action |
|---|---|
| Profile save | `profile.updated` |
| Each document upload | `document.submitted` |
| Wallet connect | `wallet.connected` |

Expected contractor status before admin review:

- profile may be complete;
- documents should show submitted/pending review;
- contractor is not ready for bid acceptance until admin approval and wallet/profile checks pass.

## Demo Flow B: Admin Document Review

Actor: Admin.

1. Log in at `https://gcsc.store/dashboard`.
2. Confirm the left sidebar includes:
   - `Admin Review`;
   - `Audit Log`;
   - `Financing Review`, if enabled.
3. Open `Admin Review`.
4. Set filter to submitted/pending documents.
5. Open each contractor document card.
6. Check:
   - contractor/company name;
   - email;
   - service area;
   - document type;
   - file name;
   - SHA-256 hash if shown.
7. Reject one document only if testing the rejection path:
   - write a clear rejection reason;
   - save rejection;
   - contractor should resubmit.
8. Approve documents that are acceptable for the pilot.
9. Open `Audit Log`.
10. Filter by documents if needed.
11. Confirm review events were recorded.

Expected backend audit events:

| Admin action | Audit action |
|---|---|
| Document approval | `document.reviewed` with status `approved` |
| Document rejection | `document.reviewed` with status `rejected` and review note |

Pass condition:

- contractor compliance becomes verified only after required documents, profile, and wallet conditions are satisfied.

## Demo Flow C: Homeowner Project And Bid

Actor: Homeowner.

1. Open `https://gcsc.store/dashboard`.
2. Register or log in as `Owner`.
3. Open `Profile`.
4. Fill owner profile fields:
   - property address;
   - property type;
   - budget range;
   - project needs;
   - city, state, ZIP.
5. Save profile.
6. Open `Projects`.
7. Create a project request:
   - title;
   - description;
   - address or service area;
   - budget;
   - timeline.
8. Save project.
9. Leave the project open for contractor bids.

Expected backend audit events:

| User action | Audit action |
|---|---|
| Owner profile save | `profile.updated` |

Project creation currently appears in project records. It is not one of the current audit actions unless the backend is extended later.

## Demo Flow D: Contractor Bid Submission

Actor: Contractor.

1. Log in as contractor.
2. Open `Projects`.
3. Select the homeowner's open project.
4. Click the bid/proposal action.
5. Enter:
   - bid amount;
   - proposed timeline;
   - scope/description.
6. Submit bid.
7. Open `My Bids`.
8. Confirm the submitted bid appears.

Expected state:

- bid is visible to the homeowner;
- bid remains pending until homeowner accepts;
- if contractor is not verified, homeowner acceptance must be blocked.

## Demo Flow E: Verified Bid Acceptance

Actor: Homeowner.

1. Log in as homeowner.
2. Open `Projects`.
3. Select the project.
4. Review `Contractor bids`.
5. Click `View profile` before accepting.
6. Confirm the contractor profile page shows:
   - company/name;
   - service area;
   - specialties;
   - verification status;
   - profile details.
7. Return to project details.
8. If contractor is unverified, confirm the UI shows `Verification Required` and acceptance is blocked.
9. After admin approval verifies the contractor, click `Accept and Create Escrow`.

Expected backend audit events:

| User action | Audit action |
|---|---|
| Bid acceptance | `bid.accepted` |

Expected state:

- project is tied to an escrow record;
- accepted bid is no longer pending;
- homeowner can open escrow details and milestones.

## Demo Flow F: Milestone Workflow

Actors: Homeowner and Contractor.

1. Homeowner opens the accepted project/escrow.
2. Homeowner creates a milestone:
   - title;
   - amount;
   - acceptance criteria.
3. Contractor logs in.
4. Contractor opens the escrow/milestone.
5. Contractor submits the milestone as complete.
6. Homeowner logs in.
7. Homeowner reviews submitted work.
8. Homeowner approves the milestone.
9. Homeowner records release in the MVP workflow.

Expected state:

| Step | Milestone status |
|---|---|
| Created | `pending` |
| Contractor submits | `submitted` |
| Homeowner approves | `approved` |
| Homeowner releases | `released` |

Important: the current MVP release action records platform state. It must not be presented as a completed real-money payout unless the XPR signed transaction and contract settlement are also verified.

## Demo Flow G: XPR/WebAuth Transaction Evidence

Actors: Homeowner and Contractor.

Use only testnet/safe demonstration accounts unless founder explicitly approves real token movement.

1. Confirm the user has connected WebAuth wallet metadata in `Wallet`.
2. Open the accepted escrow milestone.
3. Use the XPR action buttons only when a real WebAuth signing window appears.
4. Do not manually invent a transaction id.
5. After signing, confirm the returned transaction id is saved.
6. Trigger verification if available.
7. Open Admin `Audit Log`.

Expected backend audit events:

| Chain verification result | Audit action |
|---|---|
| Hyperion confirms expected action | `escrow.chain_tx.confirmed` |
| Hyperion cannot confirm expected action | `escrow.chain_tx.failed` |

Expected smart contract action names:

| Platform action | Contract action |
|---|---|
| Submit milestone | `submitms` |
| Approve milestone | `approvems` |
| Release milestone | `releasems` |
| Dispute milestone | `disputems` |

Stop if WebAuth requests a mainnet transaction or any account does not match the saved wallet identity.

## Demo Flow H: Financing Precheck

Actors: Contractor or Homeowner; Admin reviews.

1. User opens `Loans / Financing`.
2. User reviews one demo financing option.
3. User submits a precheck.
4. Admin opens `Financing Review`.
5. Admin confirms the precheck is visible.

Expected backend audit events:

| User action | Audit action |
|---|---|
| Financing precheck | `financing.precheck.created` |

Important: this is not a loan offer, approval, insurance assignment, token-collateral credit product, or live funding product.

## Post-Demo Checks

Run from `C:\gcsc-smart-contractor`:

```powershell
npm --prefix v3 run smoke:production
```

Admin review:

1. Open `Audit Log`.
2. Confirm the demo produced the expected events:
   - `profile.updated`;
   - `document.submitted`;
   - `document.reviewed`;
   - `wallet.connected`, if wallet was connected;
   - `bid.accepted`, if a verified bid was accepted;
   - `financing.precheck.created`, if financing precheck was tested;
   - `escrow.chain_tx.confirmed` or `escrow.chain_tx.failed`, if chain verification was tested.
3. Confirm no unexpected admin access occurred.
4. Confirm no user was treated as verified without admin review and required readiness checks.

Record demo evidence without secrets:

- date and time;
- accounts used by role, without passwords;
- project id;
- bid id;
- escrow id;
- milestone id;
- audit event ids or timestamps;
- blockers found;
- screenshots if needed.

## Rollback If Demo Breaks

Use rollback only after identifying which layer failed.

Frontend-only issue:

1. Keep backend running if `/health` is OK.
2. Roll back the GitHub Pages deploy by reverting the latest `C:\gcsc-store-pages` commit or redeploying the previous known good build.
3. If Railway frontend is the only stale service, redeploy the Railway frontend service from Railway UI.

Backend API or health issue:

1. Open Railway.
2. Open `gcsc-backend`.
3. Open Deployments.
4. Redeploy the previous successful deployment.
5. Run:

```powershell
npm --prefix v3 run smoke:production
```

Database issue:

1. Stop the demo.
2. Do not manually edit production data without a backup.
3. Follow `POSTGRES-RESTORE-DRILL.md`.
4. Restore only into a non-production database unless the founder explicitly approves production recovery.

Security issue:

1. Stop the related workflow.
2. Disable exposed credentials or sessions if any were affected.
3. Rotate secrets outside git.
4. Record the incident in a private operational note.

## Pass Criteria

The pilot demo passes only if:

- backend health stays OK;
- PostgreSQL remains the active database;
- admin-only pages are hidden from non-admin users;
- unauthenticated admin API returns 401;
- contractor verification blocks unverified bid acceptance;
- verified contractor bid acceptance creates an escrow record;
- milestone state changes follow the allowed order;
- audit log records trust-sensitive events;
- no real-money payment or real token transfer is required to complete the demo.

## Fail Criteria

The pilot demo fails if:

- backend health is not 200;
- backend falls back away from PostgreSQL;
- a non-admin can access admin endpoints;
- an unverified contractor can be accepted;
- audit events are missing for document review or bid acceptance;
- UI suggests real-money readiness without the required launch gates;
- any step requires secrets, private keys, live charges, or real fund movement.
