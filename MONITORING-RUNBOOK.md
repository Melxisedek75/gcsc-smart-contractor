# GCSC Production Monitoring Runbook

Date created: 2026-05-29

Purpose: define the minimum monitoring and alerting needed before a controlled production pilot.

This runbook does not require secrets and does not create paid monitoring accounts. It defines what must be monitored and how Codex/founder should verify it.

## Services To Monitor

| Target | URL | Expected |
|---|---|---|
| Backend health | `https://gcsc-backend-production.up.railway.app/health` | HTTP 200, JSON `status=ok`, `database=postgres` |
| Main site | `https://gcsc.store/` | HTTP 200, built frontend shell |
| Railway frontend | `https://gcsc-store-production.up.railway.app/` | HTTP 200, built frontend shell; strict bundle freshness after redeploy |
| Admin audit unauthenticated guard | `https://gcsc-backend-production.up.railway.app/api/admin/audit-events?limit=1` | HTTP 401 without JWT |

## Local Smoke Command

Run after every deploy:

```powershell
npm --prefix v3 run smoke:production
```

The smoke script treats `gcsc.store` as the canonical strict frontend. Railway frontend staleness is reported as a warning until the Railway frontend service is redeployed. After a Railway frontend redeploy, run:

```powershell
$env:STRICT_RAILWAY_FRONTEND="1"
npm --prefix v3 run smoke:production
Remove-Item Env:\STRICT_RAILWAY_FRONTEND
```

For a non-secret daily operations snapshot, run:

```powershell
npm --prefix v3 run ops:status
```

This writes a JSON report under `evidence/`, which is ignored by git. The report includes backend health, admin audit 401 guard, `gcsc.store` bundle freshness, Railway frontend freshness, and the current blocked founder/external items.

Expected output:

```text
backend health: ok, database=postgres
admin audit unauthenticated guard: HTTP 401
main site: HTTP 200
main site: frontend shell ok
railway frontend: HTTP 200
railway frontend: frontend shell ok
```

## Alert Policy

Create alerts for these conditions:

| Condition | Severity | Required response |
|---|---|---|
| Backend `/health` returns non-200 | Critical | Check Railway deployment/logs immediately. |
| Backend health JSON `database` is not `postgres` | Critical | Check `DATABASE_URL`, Postgres service status, and latest deploy. |
| `gcsc.store` returns non-200 | High | Check GitHub Pages/custom domain status. |
| Railway frontend returns non-200 | High | Check Railway frontend deployment. |
| Admin audit endpoint does not return 401 without token | Critical | Treat as auth guard regression; stop admin-sensitive workflows. |
| Repeated backend 5xx | Critical | Check logs, recent commits, database state, and rollback path. |
| Railway deploy failure | High | Inspect build logs; rollback only if live service is affected. |

## Recommended Low/No-Cost Monitoring Options

Do not create accounts or enter credentials autonomously. Founder approval is required before enabling a third-party service.

| Option | Use | Notes |
|---|---|---|
| Railway health checks | Backend container health | Already configured through `railway.json` for `/health`. |
| GitHub Actions scheduled smoke | Public endpoint checks | Free for public repos within GitHub limits; no secrets needed for public URL checks. |
| UptimeRobot free tier | External uptime checks | Good for backend and website HTTP checks; account setup required. |
| Better Stack free tier | Uptime and incident alerts | More polished status/alerting; account setup required. |
| Cron-job.org | Simple HTTP checks | Free/simple external pings; account setup required. |

Recommended starting point:

1. Keep Railway health check active.
2. Add GitHub Actions CI/static checks.
3. Founder chooses one external monitor for backend `/health` and `gcsc.store`.

## Manual Incident Flow

1. Run:

```powershell
npm --prefix v3 run smoke:production
```

2. If backend fails, open Railway `gcsc-backend` logs.
3. If frontend fails, check both:
   - Railway frontend deployment.
   - GitHub Pages `gcsc.store` deployment.
4. If admin audit guard fails, do not approve documents or accept bids until fixed.
5. If database is degraded, do not run migrations or manual updates until a backup exists.
6. If a recent deploy caused the issue, use the rollback flow in `ADMIN-OPERATIONS-RUNBOOK.md`.

## Evidence To Record

After monitoring is configured, record in `ADMIN-OPERATIONS-EVIDENCE.md`:

- Monitoring service name.
- Monitored URLs.
- Alert destination type, not secret values.
- Date/time of first successful alert test.
- Screenshot or copied status summary, if available.
- Local `ops:status` report path or copied non-secret summary.

Do not record:

- API keys.
- Passwords.
- Webhook secrets.
- Private incident channels.
