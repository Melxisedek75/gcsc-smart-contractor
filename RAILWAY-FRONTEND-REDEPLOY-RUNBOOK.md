# Railway Frontend Redeploy Runbook

Date: 2026-05-29

This runbook handles the specific case where the canonical site `https://gcsc.store` is current, but the Railway frontend preview service `https://gcsc-store-production.up.railway.app` still serves an older bundle.

## Current Status

Canonical pilot URL:

```text
https://gcsc.store
```

Railway frontend preview URL:

```text
https://gcsc-store-production.up.railway.app
```

Known issue:

- `gcsc.store` is updated from `C:\gcsc-store-pages`.
- Railway frontend may lag if Railway auto-deploy did not trigger for `Melxisedek75/gcsc-store` branch `api-backend`.
- HTTP 200 alone is not enough because stale bundles can still return a valid frontend shell.

## Freshness Check

Run from `C:\gcsc-smart-contractor`:

```powershell
npm --prefix v3 run smoke:production
```

Expected current output for canonical site:

```text
main site: frontend bundle current
```

If Railway is stale but reachable, output includes:

```text
railway frontend: frontend bundle stale warning
```

Strict Railway check:

```powershell
$env:STRICT_RAILWAY_FRONTEND="1"
npm --prefix v3 run smoke:production
Remove-Item Env:\STRICT_RAILWAY_FRONTEND
```

Expected after Railway redeploy:

```text
railway frontend: frontend bundle current
```

## Manual Railway Redeploy

Use this only if Railway frontend is still stale after the GitHub push.

1. Open Railway.
2. Open the project containing the `gcsc-store` frontend service.
3. Open the frontend service, not the backend service.
4. Confirm the source repository is:

```text
Melxisedek75/gcsc-store
```

5. Confirm the connected branch is:

```text
api-backend
```

6. Trigger redeploy from the latest commit.
7. Wait until deployment status is successful.
8. Run:

```powershell
$env:STRICT_RAILWAY_FRONTEND="1"
npm --prefix v3 run smoke:production
Remove-Item Env:\STRICT_RAILWAY_FRONTEND
```

## If Redeploy Still Serves Old Bundle

Check these settings in Railway:

| Setting | Expected |
|---|---|
| Repository | `Melxisedek75/gcsc-store` |
| Branch | `api-backend` |
| Build command | `npm run build` |
| Start command | `npm run preview -- --host 0.0.0.0 --port $PORT` |
| Root directory | empty unless the repo layout changes |

If the branch is `main`, Railway will not receive `api-backend` commits. Either switch Railway to `api-backend` or merge `api-backend` into `main` after review.

## Secret Safety

- Do not paste Railway tokens into chat.
- Do not commit Railway tokens to git.
- If CLI deploy automation is needed later, store the Railway token only in a secret-safe environment variable outside the repository.

## Pilot Rule

For pilot demos, use `https://gcsc.store` as the canonical URL. Treat the Railway frontend URL as a preview/service health URL until strict bundle freshness passes.
