# Daily Status Runbook

Purpose: make the daily production-readiness check readable without opening local files or exposing secrets.

Use this runbook every morning after the scheduled GitHub Actions run, or any time a manual status check is needed.

## Source Of Truth

Primary automated run:

1. Open GitHub repository `Melxisedek75/gcsc-smart-contractor`.
2. Open Actions.
3. Open the latest `Backend Production Checks` run.
4. Download the `production-status-evidence` artifact.
5. Open `production-gates-*.md` first.
6. Open `production-status-*.json` only if more detail is needed.

The scheduled workflow scans generated evidence before uploading the artifact. If the artifact is missing because the evidence scan failed, treat that as a security stop and inspect the workflow log for the pattern name without copying any suspected secret into chat or docs.

If the latest GitHub Actions run fails before any job steps start with an account/billing lock message, treat it as a founder-controlled GitHub account blocker, not a production code failure. Use the local fallback below until the GitHub account is unlocked.

Local fallback:

```powershell
npm --prefix v3 run smoke:production
npm --prefix v3 run ops:status
npm --prefix v3 run ops:gates
npm --prefix v3 run ops:evidence:scan
```

The local files are written under ignored `evidence/`. The evidence scan must pass before any generated status or gate files are shared outside the local machine.

The local `ops:status` report also checks public GitHub Actions status. If GitHub reports an account/billing lock, the report records warning `github actions scheduled smoke` and blocked item `github-actions-account-lock`.

`ops:gates` writes a `Blocked Items` section before the Gates table. Read that section first because it includes dynamic blockers discovered by live checks, not only the static production gate rows. Example: `github-actions-account-lock` appears there when GitHub refuses to start scheduled monitoring jobs.

## Morning Decision Flow

### 1. Critical failures

If `Critical failures` is greater than `0`:

- Treat the day as incident/recovery work.
- Do not approve a pilot step.
- Check which item failed in `production-status-*.json`.
- Start with backend `/health`, database mode, admin audit guard, and `gcsc.store` freshness.
- Record the failure in the daily note without secrets.

Next action: fix or rollback the failing service before doing feature work.

### 2. Warnings

If `Warnings` is greater than `0`:

- Read the warning list in `production-gates-*.md`.
- Current known warning is usually Railway frontend freshness.
- If `gcsc.store` is current and Railway frontend is stale, the canonical site is still usable for demo.
- If both frontends are stale, stop and redeploy frontend before demo.

Next action: follow `RAILWAY-FRONTEND-REDEPLOY-RUNBOOK.md` if the Railway frontend needs to be current.

### 3. Blocked Items And Blocked Gates

Read the `Blocked Items` list first, then every row under `Blocked gates` or the Gates table.

Dynamic blocked items are operational blockers discovered during the latest status run. They may not have a dedicated production gate row, but they still affect readiness. Current example:

| Blocked item | Meaning | Founder action |
|---|---|---|
| `github-actions-account-lock` | GitHub Actions scheduled smoke cannot be treated as active monitoring because GitHub refused to start the job. | Resolve GitHub account/billing lock, then rerun `Backend Production Checks`. |

Current expected gate blockers:

| Gate | Meaning | Founder action |
|---|---|---|
| `admin-account` | First admin account and bootstrap disablement are not verified. | Set Railway bootstrap variables, log in, then disable bootstrap. |
| `live-trust-workflow` | Live homeowner/contractor/admin rehearsal has not been completed. | Create test users and run `PILOT-RUNBOOK.md`. |
| `audit-log` | Live audit evidence depends on admin login and pilot activity. | Export audit evidence after admin login. |
| `postgres-restore-drill` | Restore has not been proven on a non-production database. | Provide non-production restore target and approve a backup run. |
| `monitoring-alerts` | External alert destination is not configured. | Choose Railway alerts, UptimeRobot, Better Stack, or another provider. |
| `xpr-webauth-settlement` | No real WebAuth-signed testnet escrow transaction has passed. | Use testnet accounts and sign a safe testnet milestone action. |
| `smart-contract-permissions` | Deployed contract permissions are not fully verified. | Confirm XPR testnet contract accounts and permissions. |
| `stripe-readiness` | Stripe test-mode live Railway run is not complete. | Add Stripe test keys and webhook in Railway. |
| `security-review` | Internal controls exist, external review is still pending. | Schedule external security review before real funds. |
| `legal-review` | Legal/compliance signoff is still pending. | Review escrow, token, financing, insurance, refund, and payout language. |
| `founder-approval` | Final real-money approval is not granted. | Approve only after all gates pass. |

Next action: choose the first blocked gate that can be advanced without secrets or real money.

## Safety Rules

- Do not paste secrets into chat, GitHub issues, GitHub Actions logs, or committed docs.
- Do not paste admin passwords, JWTs, database URLs, Stripe keys, webhook secrets, Railway tokens, private keys, or wallet seed phrases.
- Do not enable live payments, live payouts, live lending, insurance assignment, or mainnet token movement from this checklist.
- No real money moves during daily status review.
- Keep `gcsc.store` as the canonical pilot URL unless the deployment plan changes.
- If GitHub Actions is blocked by account/billing status, do not mark scheduled monitoring as active; run local fallback checks and follow `FOUNDER-ACTION-PACKET.md` Priority 0.

## Daily Note Template

```text
Date:
Actions run:
Critical failures:
Warnings:
Blocked gates:
What changed since yesterday:
Next action:
Founder/external input needed:
Real-money status: disabled
```

## Pass Criteria For The Morning

- `Backend Production Checks` completed or local fallback commands passed.
- `Critical failures: 0`.
- `gcsc.store` bundle is current.
- Admin audit unauthenticated guard remains HTTP 401.
- Open blocked gates are understood and assigned to either Codex-safe work or founder/external action.
- Real-money status remains disabled unless every launch gate has passed and founder approval is explicit.
