# AI Review: escrow/milestone lifecycle test coverage

- Author AI: CLAUDE
- Reviewer AI: CODEX (via Google Antigravity)
- Branch: `test/escrow-milestone-coverage` (base: `main` @ `8a8687b`)
- Head for review: `4834362`
- Status: `READY_FOR_REVIEW`
- Prepared at (UTC): `2026-07-16T22:10:00Z`

## Scope

Test-only change. Adds `v3/tests/escrow-milestones.test.js` (32 tests). Does
NOT touch `pure-server.js` or any production code — the route implementations
are unchanged; this file only adds coverage for a path that had zero tests
before: bid accept → milestone create → submit → approve → release → dispute.

## Why this branch exists

During the mobile mock-removal work, the escrow/milestone routes were only
ever exercised by a manual curl smoke script. This is the actual money path
(who gets paid, when, and whether the homeowner or contractor can move it),
and it had no automated regression protection at all.

## What to verify independently

1. Read `v3/tests/escrow-milestones.test.js` end to end — does each assertion
   actually match the route's real behavior in `v3/pure-server.js` (routes
   `POST /api/bids/:id/accept`, `POST /api/escrow/:id/milestones`,
   `POST /api/milestones/:id/{submit,approve,release,dispute}`,
   `GET /api/escrow/:id`, `GET /api/escrow/my/escrows`), or does a test pass
   for the wrong reason (e.g. a bug in the test fixture masking a real bug in
   the route)?
2. Run: `cd v3 && npx jest tests/escrow-milestones.test.js` — expect 32/32.
3. Run together with the existing suites to rule out shared in-memory `db`
   state leaking across files: `npx jest tests/payment-reconciler.test.js
   tests/payments-402.test.js tests/escrow-milestones.test.js --runInBand`
   — expect 68/68.
4. Look for missing cases the author should have covered but didn't — e.g.
   negative/fractional amounts, concurrent accept attempts, the `chain-txs`
   evidence-recording routes (not covered by this branch at all).

## Checks run by author

| Check | Result |
|---|---|
| `npx jest tests/escrow-milestones.test.js` | PASS 32/32, first write, no route changes needed |
| Same, run 3x consecutively | PASS all 3 runs, stable (~3s each) |
| Run together with payments-402 + payment-reconciler, `--runInBand` | PASS 68/68 |

## Known gaps (not covered by this branch)

- ~~`POST /api/milestones/:id/chain-txs` and its `/verify` sibling~~ — **now
  covered**, see "2026-07-17 addendum" below.
- Postgres-mode path not exercised (tests run in json-file mode, same as the
  existing payment test suites); no local Postgres available to test author.

## 2026-07-17 addendum: chain-tx evidence coverage

Added 23 tests (26→49 in this file) for the previously-flagged gap:

- `POST /api/milestones/:id/chain-txs` (10 tests): role gating per action
  (`canUserRecordChainTx`), invalid action/tx_id/contract_account, duplicate
  tx_id → 409, non-participant → 403, missing/unknown milestone → 404, no
  auth → 401.
- `POST /api/milestones/:id/chain-txs/:txId/verify` (7 tests): confirmed
  (matching action found), failed (wrong action found; authoritative
  not-found), pending (stale/unreachable nodes — not condemned), non-participant,
  unknown tx id, no auth. Uses the same `global.fetch` mock technique as
  `tests/payment-reconciler.test.js` since `verifyStoredChainTx` shares
  `fetchHyperionTransaction` with the payment verifier.

Found and fixed one test-infra issue while doing this: the bid-accept route is
rate-limited per client identity, and the limiter's `Map` is module-level state
that isn't reset between tests. This file's total accept-call count crossed the
limiter threshold once the new describes were added, causing cascading
`escrow_id`/`milestone.id` undefined failures several tests in — not a bug in
the routes themselves. Fixed by setting `process.env.RATE_LIMITS_DISABLED =
'true'` at the top of the file, the same sanctioned test-only escape hatch that
`tests/security-env-check-script.test.js` already documents (and asserts must
never be `true` in production).

| Check | Result |
|---|---|
| `npx jest tests/escrow-milestones.test.js` | PASS 49/49 |
| Same, 3x consecutively | PASS all 3 runs, stable (7–15s each) |
| Run with payment-reconciler + payments-402, `--runInBand` | PASS 85/85 |

No production code (`pure-server.js`) touched by this addendum — test file only.

## Reviewer decision

- Reviewer decision: `PENDING`
- Reviewed at (UTC): `PENDING`
