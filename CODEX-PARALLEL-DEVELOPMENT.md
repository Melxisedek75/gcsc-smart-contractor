# GCSC Parallel Development with Codex, Worktrees, and Astra

## Purpose

This runbook defines a safe, fast multi-agent workflow for completing GCSC with Codex App / Codex CLI and Git worktrees.

## Core Principle

Codex is the coding agent. A "worker" should be treated as a parallel task/agent, not as a special frontend-only product. Git worktrees isolate parallel tasks at the filesystem and branch level.

Use ChatGPT Work for broader multi-step research, documentation, planning, connected-app workflows, and finished deliverables. Use Codex for software engineering.

## Recommended GCSC Agent Topology

### Agent A — Lead Architect / Backend
Branch: `agent/backend-core`
Worktree: `../gcsc-backend`
Primary responsibilities:
- backend architecture
- Express routes/services
- PostgreSQL
- auth
- API contracts
- reconciliation
- coordination of high-risk changes

Preferred model: GPT-6 Astra when available; otherwise strongest available Codex-capable model.

### Agent B — Frontend / UX
Branch: `agent/frontend-ui`
Worktree: `../gcsc-frontend`
Primary responsibilities:
- homeowner dashboard
- contractor dashboard
- milestone verification UI
- wallet UX
- responsive behavior
- frontend tests

### Agent C — Mobile Wallet / WebAuth
Branch: `agent/mobile-wallet`
Worktree: `../gcsc-mobile-wallet`
Primary responsibilities:
- mobile wallet connect/reconnect
- deep links / callback handling
- XPR signing UX
- payment/signature failures
- testnet/dev-mode behavior
- parity testing against desktop flow

### Agent D — Payments / Settlement
Branch: `agent/payments-settlement`
Worktree: `../gcsc-payments`
Primary responsibilities:
- Stripe
- escrow state machine
- payment idempotency
- XPR settlement adapter
- reconciliation and failure recovery

This agent is high-risk. Do not merge its changes without independent review.

### Agent E — QA / Integration
Branch: `agent/qa-integration`
Worktree: `../gcsc-qa`
Primary responsibilities:
- integration tests
- E2E tests
- regression reproduction
- CI failures
- desktop/mobile parity matrix
- pre-merge verification

QA should usually review code from other branches rather than author broad feature changes.

### Agent F — Security Reviewer
Branch: normally no long-lived feature branch required; use review task or temporary branch/worktree.
Primary responsibilities:
- auth review
- payment/escrow review
- secret handling
- injection / authorization / replay / duplicate-payment risks
- high-risk PR review

## Do Not Use One Permanent Backend Branch and One Permanent Frontend Branch Forever

Prefer task-scoped branches such as:
- `agent/backend-fix-payment-idempotency`
- `agent/frontend-contractor-dashboard`
- `agent/mobile-wallet-reconnect`

Long-lived feature branches drift and create painful merges. Use a small number of stable worktree directories if convenient, but reset/recreate their task branches as work changes.

## Initial Local Setup

Run from the main local clone after updating it:

```bash
git checkout main
git pull --ff-only origin main
git worktree add ../gcsc-backend -b agent/backend-core main
git worktree add ../gcsc-frontend -b agent/frontend-ui main
git worktree add ../gcsc-mobile-wallet -b agent/mobile-wallet main
git worktree add ../gcsc-payments -b agent/payments-settlement main
git worktree add ../gcsc-qa -b agent/qa-integration main
```

Install dependencies independently in each worktree as required by the actual package structure. Do not blindly run `npm install` at the repository root unless that is how the repository is configured.

## Codex CLI Version and Astra

GPT-6 Astra requires Codex CLI 0.153.0 or newer. Upgrade Codex CLI and the ChatGPT Desktop app before selecting Astra.

Verify version:

```bash
codex --version
```

If Astra is not visible in the account yet, do not block work. Use the strongest available Codex model and switch to Astra when rollout reaches the account.

## Startup Sequence Per Agent

Each agent should receive a task prompt that tells it to:
1. Read `AGENTS.md`.
2. Read `ARCHITECTURE.md`.
3. Inspect relevant code before editing.
4. Work only in its branch/worktree.
5. Add tests.
6. Run relevant validation.
7. Commit task-scoped changes.
8. Return a concise handoff containing changed files, tests, blockers, and integration notes.

## Integration Strategy

Do not merge both large branches directly into `main` back-to-back.

Preferred flow:
1. Each agent commits to its task branch.
2. QA/reviewer inspects diff and test evidence.
3. Merge low-risk isolated changes through PRs.
4. For changes that must land together, use an integration branch such as `integration/<feature>`.
5. Resolve API contract conflicts in the integration branch.
6. Run the full relevant test suite.
7. Merge to `main` only after CI passes.

## API Contract-First Parallelism

Backend and frontend can only move quickly in parallel if the interface is frozen first.

For each feature, establish before implementation:
- endpoint
- HTTP method
- auth requirements
- request body
- response body
- errors/status codes
- retry/idempotency behavior
- loading/pending/failed/success states

Then backend and frontend can implement independently.

## GCSC Recommended Work Queue

Order work by risk and dependency, not by visual appeal.

### Wave 1 — Stabilize
- failing production CI
- auth consistency
- database migrations
- payment state machine
- wallet/session reliability
- desktop/mobile bug reproduction

### Wave 2 — Finish Critical Flows
- project -> bid -> contract
- funding/deposit
- milestone evidence
- approval/review
- payout/settlement
- dispute/cancellation
- audit trail

### Wave 3 — Frontend Polish
- homeowner dashboard
- contractor dashboard
- milestone timeline
- payment status UX
- wallet error recovery UX
- responsive/mobile polish

### Wave 4 — Integration / Production Readiness
- E2E
- mobile device testing
- real provider test modes
- observability
- security review
- backup/restore drill
- deployment checks

## Merge Gates

No merge to `main` for financial/auth/wallet code unless all applicable gates pass:
- tests pass
- CI passes
- no secrets in diff
- idempotency verified
- duplicate callback/retry behavior tested
- authorization checked
- rollback/migration plan understood
- second review completed

## Recommended Daily Operating Loop

1. Lead agent reads CI and blockers.
2. Split independent tasks across worktrees.
3. Freeze API contracts where backend/frontend overlap.
4. Let agents implement in parallel.
5. QA agent tests completed branches.
6. Security reviewer checks high-risk diffs.
7. Merge only green changes.
8. Update backlog with discovered defects.

## Important Correction to Common Worktree Advice

Worktrees reduce file collisions, but they do not eliminate logical conflicts. Two agents can safely edit isolated files yet still create incompatible APIs, migrations, or assumptions. Coordination through explicit contracts, tests, and review remains mandatory.

## Important Correction for GCSC Smart Contracts

GCSC's documented settlement layer is XPR Network / Antelope-style infrastructure. Do not instruct Codex to build Solidity escrow contracts by default. Only use Solidity if a deliberate EVM component is introduced and documented.
