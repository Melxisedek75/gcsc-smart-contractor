# Built-in GCSC project agent (Path A)

The agent is wired into both `v3/server.js` (Express) and `v3/pure-server.js` (the runtime exercised by production checks). There is no connector for a personal Muse application.

## Configure and deploy

1. Install the locked dependencies with `npm ci --prefix v3` (Node 18+).
2. Set server-only `MUSE_API_KEY`, `MUSE_BASE_URL=https://api.meta.ai/v1`, and `MUSE_MODEL=muse-spark-1.3`. Do not put the key in a frontend environment variable. The supplied prompt is loaded from `docs/agent/GCSC-agent-system-prompt.md`; missing prompt/key disables chat without a fallback.
3. Back up the database. Run the existing baseline migrations for your actual runtime, then `npm --prefix v3 run db:migrate:agent`. This separate migration is replay-safe. It does not execute Stripe or XPR operations. Expiry values remain unknown until reviewed data is supplied.
4. Deploy the backend and dashboard HTML plus `agent-chat.js` from the same version. Dashboard API_BASE uses its existing configuration. Both root dashboard copies and `v3/public/` copies are updated. The bundled SPA in root `index.html` has no source project-card components in this repository and is not rewritten by this change.
5. Test signed-in contractor and owner accounts in the project card. For a new contractor with no bid or escrow, the owner explicitly grants project access by contractor ID inside the project assistant. Existing bidders/escrow parties have access automatically. No access to all public or unrelated projects is granted.

## API contract

All routes require the current user's Bearer token. Role is re-read from the database. Histories are keyed by project + user + mode; each tool also rejects a different project ID.

| Method | Path after `/api/agent/projects/:projectId` | Body / result |
| --- | --- | --- |
| GET | `/chat` | Private messages and action cards, mode |
| POST | `/chat` | `{ "message": "..." }`, max 5000 characters |
| POST | `/actions/:actionId/approve` | `{ "confirmed": true }` only |
| POST | `/actions/:actionId/reject` | `{ "confirmed": true }` only |
| GET | `/documents` | Issued invoices/change orders shared with project parties; renewal requests remain contractor-private |
| POST | `/access` | Owner only: `{ "contractorId": 123, "confirmed": true }`; grants scope visibility without sharing private chat |

Model tools cannot approve actions. The model gets no approval tool, secrets, request headers, arbitrary SQL or arbitrary URL-fetch tool. Every monetary value is stored in USD cents and rendered as USD. Tool arguments are schema-validated. Unknown warranty/rating/expiry data stays unknown.

`draftProposal` prepares a pending card. UI approval submits a bid, or replaces the contractor's existing pending bid if the exact previous terms still match. Project and bid rows are locked. Other pending drafts become stale when one changes those terms. A race or changed project requires preparing a fresh draft.

Invoices are issued to `agent_documents` after approval and visible to both parties. Change orders are recorded as `awaiting_homeowner`; they do **not** amend scope, escrow amounts or payment obligations. A separate homeowner acceptance workflow is still needed to apply them. Document-update requests create a private renewal task; they do not send external email, upload documents or verify validity.

## Milestone and money boundary

Both modes require a funded escrow and the expected milestone status. Snapshot amount, ID, escrow, project and parties are checked again when executing.

Pure-server approval changes a submitted milestone to approved through its existing route. It does not release money or broadcast XPR transactions. Express approval uses its existing escrow route with exact snapshot checks. The agent's Express path is disabled when `SETTLEMENT_ENABLED=true`, because this repository has no agent-specific provider-review gate for real payouts. The manually reviewed settlement flow remains available. Do not enable automatic agent payouts by removing this guard.

Durable action states prevent duplicate execution: pending → executing → completed. Rejected/expired actions cannot run. A crash or uncertain platform result leaves executing/needs_review and cannot be replayed automatically. Reconcile the bid, invoice or milestone against the action before operator recovery. No automated payout retry is introduced.

## Authentication and limits

Express retains the shared JWT signature/JTI/revoked-session checks. Pure validates HS256 signature, expiry and current database account. When a shared `sessions` table exists, pure also requires an unrevoked JTI session. Legacy pure deployments without that table retain their existing signed-token authentication; they do not gain token revocation from this module. Before financial production, migrate the platform's legacy authentication to revocable sessions as required by AGENTS.md.

Agent requests are limited to 20 per user per minute per process; the existing outer Express limiter/CORS remain in place. A project/user advisory lock prevents concurrent conversation writes. Provider calls have a 15-second timeout, no automatic retries, at most four rounds and ten tool calls per round. Conversation context is capped at 200 KB. Multi-instance deployments need a shared rate-limit store and durable budgeting before large traffic. Chat holds a database transaction during the bounded provider loop.

## Validation and rollback

Run `npm --prefix v3 test -- --runInBand`, migration readiness and the existing backend production checks. `AGENT_TEST_PG_URL` must name a disposable `gcsc_agent_test*` database for `npm --prefix v3 run test:agent-postgres`; the script inserts fixtures and does not accept a production database name. CI provisions PostgreSQL 16. Tests inject model completions; they do not claim a live Muse-key verification.

Rollback by deploying the previous backend and HTML. Leave agent tables intact to preserve approvals and audit evidence; do not drop them during an incident. Before re-enabling, reconcile executing/needs_review records. The migration only adds agent tables and nullable document-expiry columns.

Official provider references: [Quickstart](https://dev.meta.ai/docs/quickstart), [Models](https://dev.meta.ai/docs/models), [Tool calling](https://dev.meta.ai/docs/tool-calling). Chat Completions uses nested `function` definitions, assistant `tool_calls`, and `tool` results linked by `tool_call_id`. Parallel calls returned by Muse are executed sequentially within the project transaction to keep dependent drafts and auditing consistent.
