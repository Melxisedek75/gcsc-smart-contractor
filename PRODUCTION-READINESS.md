# GCSC Smart Contractor Production Readiness

Date: 2026-05-28

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
| Security hardening | Partial | CORS whitelist and endpoint rate limits are implemented; external review still pending. |

## Ready To Demonstrate

- Register/login flow.
- Dashboard with real account state instead of a fake demo account.
- Homeowner and contractor profile flows.
- Contractor compliance document submission.
- Admin document review.
- Admin audit log for trust events.
- Contractor verification guard before bid acceptance.
- Public contractor profile/details view.
- Basic WebAuth wallet connection metadata.

## Not Ready For Real-Money Production

- Admin account must be created with the one-time bootstrap variables and then bootstrap must be disabled.
- On-chain escrow settlement needs a full live XPR test with real accounts and contract permissions.
- Stripe payments and contractor payouts need a production-mode verification run.
- Database backups, log retention, monitoring alerts, and incident response process are not fully documented.
- External security review and legal review are still required before holding real customer funds.
- WebAuth integration currently stores wallet identity; full signed transaction flows are not complete.

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
   - Add deploy rollback runbook.
   - Define admin access policy and log review cadence.

3. Complete payment and compliance controls:
   - Stripe live-mode smoke test.
   - Contractor payout verification.
   - Legal review of escrow/payment copy and token wording.
   - External security review before marketing real-money usage.

## Recommended Next Build Sequence

1. Create the first admin account in Railway using `ADMIN_BOOTSTRAP_ENABLED=true`.
2. Log in, verify Admin Documents and Audit Log.
3. Disable admin bootstrap and redeploy.
4. Run a complete homeowner -> contractor -> bid -> verification -> accept flow.
5. Add on-chain WebAuth signing and escrow settlement smoke tests.
