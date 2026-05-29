# GCSC Payment Readiness

Date: 2026-05-29

## Current Status

Stripe support is test-mode only. Real-money processing is not enabled for the controlled pilot until the founder explicitly approves live keys, legal wording, refund policy, payout operations, and security review.

Production backend entrypoint: `node v3/pure-server.js`

Implemented production-safe behavior:

- `POST /api/stripe/create-payment-intent` requires a verified JWT session and homeowner role.
- If `STRIPE_SECRET_KEY` is missing or is not a `sk_test_` key, the endpoint returns `503`.
- The backend refuses to treat live Stripe keys as enabled in the current pilot build.
- `POST /api/stripe/webhook` requires a configured test webhook secret and validates `Stripe-Signature`.
- Invalid webhook signatures return `400`.
- Stripe webhook events can update local/test payment intent status for `succeeded`, `payment_failed`, and `canceled`.
- Payment intent creation records an audit event: `payment.intent.created`.

## Test-Mode Checklist

- [x] Missing Stripe key returns safe `503`.
- [x] Test PaymentIntent creation path is covered with a local Stripe SDK stub.
- [x] Webhook rejects invalid signatures.
- [x] Webhook accepts a locally signed test event.
- [x] No live payment mode is enabled by default.
- [ ] Founder adds Stripe test keys in Railway.
- [ ] Test webhook endpoint is configured in Stripe dashboard.
- [ ] A real Stripe test-mode card payment is run against the deployed backend.
- [ ] Failed test payment and canceled test payment are verified.

## Required Environment Variables

Use test values only until launch approval:

| Variable | Purpose | Example |
|---|---|---|
| `STRIPE_PUBLISHABLE_KEY` | Frontend Stripe publishable key | `pk_test_...` |
| `STRIPE_SECRET_KEY` | Backend test PaymentIntent key | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | `whsec_...` |
| `STRIPE_CONNECT_CLIENT_ID` | Future contractor payout onboarding | `ca_...` |

Do not commit real values to git.

## Webhook Endpoint

Use this endpoint after test keys are added:

```text
https://gcsc-backend-production.up.railway.app/api/stripe/webhook
```

Subscribe to these Stripe test events first:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`

## Live-Mode Blockers

Live payments stay disabled until all items are complete:

- Legal review of escrow, refund, cancellation, contractor payout, and platform fee wording.
- Stripe account business verification complete.
- Stripe webhook test events verified on Railway.
- Stripe Connect contractor onboarding designed and tested.
- Refund and cancellation workflow approved.
- Chargeback/dispute operations runbook created.
- PostgreSQL backup and restore drill completed.
- Monitoring alerts active for backend health and deploy failures.
- Founder explicitly approves live payment enablement.

## Refund And Cancellation Policy

Placeholder requiring legal review:

- Homeowner cancellation before contractor acceptance.
- Homeowner cancellation after bid acceptance but before work starts.
- Milestone dispute and partial refund handling.
- Contractor payout delay and hold policy.
- Platform fee refundability.
- Chargeback response process.

This policy is not approved for production use until reviewed by legal counsel.

## Contractor Payout Readiness

Contractor payouts are not ready for live use yet.

Required before enabling payouts:

- Stripe Connect account onboarding.
- Contractor identity and business verification.
- Payout destination verification.
- Payout delay policy.
- Admin review for failed payouts.
- Audit log events for payout creation, success, failure, and manual override.
- Clear separation between Stripe escrow test payments and XPR on-chain escrow settlement.

## Verification Commands

```powershell
node --check v3\pure-server.js
npm --prefix v3 run test:stripe-readiness
npm --prefix v3 run test:pg-storage
npm --prefix v3 run test:pg-workflow
npm --prefix v3 run smoke:production
```
