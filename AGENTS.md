# GCSC Agent Operating Rules

This file is the persistent operating contract for coding agents working in this repository.

## 1. Mission

Global Construction Smart Contract (GCSC) is a construction workflow and settlement platform. Preserve production safety, financial correctness, auditability, mobile/desktop parity, and separation of concerns.

## 2. Current Architecture

Treat the repository architecture in `ARCHITECTURE.md` as authoritative unless a task explicitly updates it.

### Layer 1 — Product / Marketplace
- Repository: `gcsc-smart-contractor`
- Backend: Node.js + Express
- Main server: `v3/server.js`
- Database: PostgreSQL under `v3/database/`
- Routes: `v3/routes/`
- Auth: verified JWT middleware under `v3/middleware/auth.js`
- User workflows: homeowners, contractors, projects, bids, escrow records, disputes, reviews, verification, payments
- Stripe is part of the fiat payment workflow.

### Layer 2 — XPR Settlement
- XPR Network / Antelope-style contracts are the on-chain settlement layer.
- Do NOT assume Solidity or EVM unless the task explicitly introduces an EVM component.
- Customer workflow state belongs in Layer 1; finalized settlement instructions may flow to Layer 2.

### Layer 3 — Autonomous Treasury / xprclaw
- Must remain isolated from homeowner escrow funds.
- Never permit autonomous trading/treasury logic to custody, route, or risk customer escrow balances.

## 3. Non-Negotiable Financial Safety Rules

For every money-moving path:
- Preserve idempotency.
- Preserve audit logs.
- Use retry-safe state transitions.
- Never silently retry a payment, payout, settlement, or blockchain action if duplicate execution is possible.
- Reconcile project, milestone, user, amount, provider transaction ID/hash, and status.
- Never log secrets, private keys, seed phrases, bearer tokens, card data, or full sensitive payment payloads.
- Never place real secrets in source control.
- Never bypass auth, KYC/provider-review gates, escrow approval gates, or dispute locks to make tests pass.

## 4. Wallet and Mobile/Desktop Rules

GCSC has both desktop web wallet flows and mobile application/mobile-wallet flows. They are separate test surfaces.

When changing wallet connection, signing, payment, escrow, or XPR flows:
- Test desktop web flow and mobile flow separately.
- Do not assume a fix on desktop fixes mobile.
- Preserve testnet/dev-mode support where required.
- Handle cancellation, reconnect, expired session, rejected signature, duplicate callback, deep-link return, timeout, and network-switch errors explicitly.
- Avoid storing signing secrets locally in application code.

## 5. Backend Agent Scope

Backend-focused agents should own primarily:
- `v3/server.js`
- `v3/routes/**`
- `v3/database/**`
- `v3/middleware/**`
- payment and reconciliation services
- XPR settlement adapters
- API contracts and tests
- backend CI / production checks

Backend agents must avoid broad UI refactors unless required to keep an API change compatible.

## 6. Frontend Agent Scope

Frontend-focused agents should own primarily:
- customer-facing web UI
- contractor/homeowner dashboards
- wallet connection UX
- milestone verification UX
- upload flows
- responsive/mobile web behavior
- frontend tests

Frontend agents must not invent backend API shapes. If an API change is needed, document it as an explicit contract change and coordinate through the integration branch/PR.

## 7. Parallel Agent Rules

Use isolated Git worktrees/branches for substantial parallel tasks.

Recommended branch pattern:
- `agent/backend-<task>`
- `agent/frontend-<task>`
- `agent/mobile-wallet-<task>`
- `agent/payments-<task>`
- `agent/qa-<task>`
- `agent/security-<task>`

Rules:
- One agent owns one worktree and one task branch.
- Never run two write-capable agents in the same worktree.
- Keep commits small and task-scoped.
- Do not merge directly to `main` until tests and review pass.
- Prefer pull requests or an integration branch for cross-cutting changes.
- Rebase/merge from latest `main` before final integration when practical.

## 8. Required Task Procedure

Before editing:
1. Read this file.
2. Read `ARCHITECTURE.md`.
3. Read task-relevant runbooks/docs.
4. Inspect existing implementation before proposing replacement architecture.
5. State the files/components expected to change.

During implementation:
1. Make the smallest coherent change.
2. Preserve compatibility unless the task explicitly authorizes a breaking change.
3. Add/update tests for changed behavior.
4. Do not weaken validation, auth, payment checks, or security controls to satisfy tests.

Before completion:
1. Run relevant tests.
2. Run lint/type/build checks where available.
3. Run backend production checks when backend/payment/auth code changes.
4. Review `git diff` for accidental or unrelated edits.
5. Report: changed files, tests run, failures/blockers, migration/env changes, rollback concerns.

## 9. High-Risk Change Gate

The following require extra review before merge:
- authentication/authorization
- Stripe or any real-money payment code
- escrow release/cancellation/dispute logic
- XPR signing or on-chain settlement
- database migrations touching money/state ownership
- secrets/env handling
- autonomous treasury logic
- KYC/provider verification gates

For these changes, require a second agent review or human review and explicit test evidence.

## 10. Frontend/Backend Contract Discipline

When backend and frontend agents work in parallel:
- Agree on request/response schema first.
- Prefer OpenAPI/typed/shared schemas if already present.
- Backend changes that alter API behavior must include a compatibility note.
- Frontend work may use mocks only if clearly marked and removed/replaced before production merge.

## 11. Context Efficiency

Do not repeatedly reread the entire repository.
- Start from this file, `ARCHITECTURE.md`, and task-relevant files.
- Search narrowly by route, service, component, error, or feature name.
- Summarize findings in the task thread/PR so the next agent can continue without rediscovery.

## 12. Definition of Done

A task is not done because code was written. It is done when:
- implementation is complete,
- relevant tests pass,
- no unrelated diff remains,
- financial/security invariants are preserved,
- desktop/mobile surfaces are tested when applicable,
- integration notes are provided,
- the branch is ready for review/merge.
