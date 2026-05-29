# Admin Operations Evidence Template

Date:

Prepared by:

Purpose: record non-secret evidence for controlled pilot readiness. Do not paste passwords, JWTs, database URLs, Stripe keys, Railway tokens, private keys, seed phrases, customer private data, or full payment details into this file.

## Admin Bootstrap Evidence

| Check | Result | Notes |
|---|---|---|
| First admin account created | Pending |  |
| `ADMIN_BOOTSTRAP_ENABLED=false` after first login | Pending |  |
| Admin can log in at `https://gcsc.store/dashboard` | Pending |  |
| Admin sidebar shows Admin Review | Pending |  |
| Admin sidebar shows Audit Log | Pending |  |
| Unauthenticated admin audit endpoint returns HTTP 401 | Pending |  |
| Non-admin admin endpoint access returns HTTP 403 | Pending |  |

## Railway Frontend Freshness Evidence

| Check | Result | Notes |
|---|---|---|
| `gcsc.store` bundle current | Pending |  |
| Railway frontend strict bundle check current | Pending |  |

Command:

```powershell
$env:STRICT_RAILWAY_FRONTEND="1"
npm --prefix v3 run smoke:production
Remove-Item Env:\STRICT_RAILWAY_FRONTEND
```

## Role-By-Role Pilot Evidence

| Step | Result | Notes |
|---|---|---|
| Contractor profile completed | Pending |  |
| Contractor wallet metadata connected | Pending |  |
| Contractor documents submitted | Pending |  |
| Admin approved or rejected document with note | Pending |  |
| Homeowner project created | Pending |  |
| Contractor bid submitted | Pending |  |
| Homeowner reviewed public contractor profile | Pending |  |
| Unverified contractor acceptance blocked | Pending |  |
| Verified contractor bid accepted | Pending |  |
| Milestone flow demonstrated without real funds | Pending |  |

## Audit Export Evidence

Use only a local terminal session. Do not commit the exported JSON file.

```powershell
$env:ADMIN_JWT="<admin-jwt-from-local-login-session>"
npm --prefix v3 run audit:export
Remove-Item Env:\ADMIN_JWT
```

Evidence file:

```text
evidence\audit-events-YYYY-MM-DDTHH-MM-SS-msZ.json
```

Summary:

| Event | Observed | Notes |
|---|---|---|
| `profile.updated` | Pending |  |
| `document.submitted` | Pending |  |
| `document.reviewed` | Pending |  |
| `wallet.connected` | Pending |  |
| `project.created` | Pending |  |
| `bid.submitted` | Pending |  |
| `bid.accepted` | Pending |  |
| `escrow.milestone.created` | Pending |  |
| `escrow.milestone.submitted` | Pending |  |
| `escrow.milestone.approved` | Pending |  |
| `escrow.milestone.released` | Pending |  |
| `escrow.milestone.disputed` | Pending |  |
| `escrow.chain_tx.recorded` | Pending |  |
| `escrow.chain_tx.confirmed` | Pending |  |
| `escrow.chain_tx.failed` | Pending |  |
| `financing.precheck.created` | Pending |  |
| `payment.intent.created` | Pending |  |

## Backup And Restore Evidence

| Check | Result | Notes |
|---|---|---|
| Production backup created | Pending |  |
| Backup file ignored by git | Pending |  |
| Restore completed into non-production DB | Pending |  |
| Core tables query successfully | Pending |  |
| Production DB not modified | Pending |  |

Record only aggregate counts. Do not record database connection strings.

## Final Notes

- Real-money status:
- Real token movement status:
- Blockers remaining:
