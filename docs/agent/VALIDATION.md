# Validation — 2026-10-06

- Full Jest suite: 5 suites, 97 tests passed (existing payments/reconciliation/milestones plus agent security/UI).
- Agent security/UI rerun after final changes: 10/10 passed.
- Agent migration applied twice and integration smoke passed against the PostgreSQL engine in PGlite locally. Pure-server HTTP routes were exercised, with injected model completions and a PGlite-backed pg Pool adapter. This verifies SQL/data behavior; it is not a native PostgreSQL concurrency benchmark. CI provisions native PostgreSQL 16 for the same smoke script.
- Integration coverage: private conversation persistence across service recreation, role read from database, other project/other user's history blocked, cross-project tools blocked, competitor documents blocked, owner-granted first-contractor access, first proposal and pending proposal replacement, UI approval required, modified approval payload rejected, concurrent/repeated clicks produce one bid change, owner milestone approval, invoice issuance, renewal tasks hidden from owner, reject/expiry/stale amount blocked, audit, invalid JWT and revoked JTI sessions blocked when sessions are enabled.
- Migration readiness and its script test passed.
- Existing PostgreSQL storage smoke passed.
- All 12 production-check script/runbook/workflow validations passed, including CI monitoring after configuring the disposable test database variable without referring to a production database credential.
- Syntax checks and `git diff --check` passed.
- Independent security review performed as required by AGENTS.md section 9; identified privacy, snapshot, funding, logging and proposal-access issues were corrected. Final review supports a draft PR with the limitations below.

## Outstanding acceptance and limitations

- Live Muse API request is not verified: the deployed server's MUSE_API_KEY is not available in this execution environment. No key value was requested or inspected.
- The existing `test:pg-workflow` fails at `tests/postgres-workflow-smoke.js:941`: a missing XPR transaction returns `pending` while the fixture expects `failed`. The identical failure was reproduced on the unmodified main-branch `pure-server.js`; it predates this change. This prevents reporting all production gates as green.
- The dashboard HTML surfaces are integrated. The root bundled SPA has no editable project component source in this repository and is not integrated by editing its compiled bundle. Source/deployment alignment is required if that SPA is the intended evening test surface.
- Native PostgreSQL CI, signed-in browser/mobile testing and live deployment acceptance remain pending. JSDOM tests verify DOM, XSS behavior, comparison rendering and approval requests, not visual layout on an actual phone.
- Express agent approval cannot trigger live settlement while SETTLEMENT_ENABLED=true; a provider-reviewed money path is required. Pure milestone approval does not release money.
- Legacy pure-server deployments without a sessions table retain their existing signed/expiring JWT model. Agent chat transactions and per-process rate limits need capacity planning before multi-instance production traffic.

See INTEGRATION.md for migration, env configuration, exact API semantics and rollback.
