# v3 ARCHITECTURE — SOURCE OF TRUTH

> Audit date: 2026-06-08. Read this BEFORE editing any backend file in `v3/`.
> Purpose: this repo contains TWO implementations of the same backend. Editing the
> wrong one wastes time and money (it has already happened). This file states which
> code is live and which is dead, with proof.

## TL;DR

- **LIVE production backend = `v3/pure-server.js`** (single-file, ~3098 lines, zero external deps for the server itself; uses Postgres when `DATABASE_URL` is set, otherwise a local JSON file).
- **DEAD code = `v3/server.js` + everything it pulls in:** all of `v3/routes/*` (12 files), `v3/middleware/*`, `v3/database/db.js`.
  These are NOT deployed, NOT tested, NOT used by any script. They import only each other.

## gcsc.store is TWO separate repositories

Editing UI in this repo is a trap. The live site is split:

| Part | Repo | Branch | Stack | Deploy | Where to edit |
|---|---|---|---|---|---|
| **Frontend (what users see)** | `Melxisedek75/gcsc-store` (`C:\gcsc-store`) | `api-backend` | Vite + TypeScript + Tailwind (+ shadcn) | Railway service `gcsc-store` | `C:\gcsc-store/src` |
| **Backend (API)** | `Melxisedek75/gcsc-smart-contractor` (this repo) | `main` | `v3/pure-server.js` (Node, zero-dep) | Railway service `gcsc-backend` | `v3/pure-server.js` |

`v3/public/*.html` is vanilla-HTML static served by `pure-server.js`, but the canonical
user-facing UI is the Vite app in `C:\gcsc-store`. UI changes ("Settings", dashboards,
buttons) belong in `C:\gcsc-store/src`, NOT in `v3/public/`.

## Proof (how this was determined)

| Claim | Evidence |
|---|---|
| Prod runs `pure-server.js` | Root `railway.json` → `startCommand: node v3/pure-server.js`; root `Dockerfile` → `CMD ["node","v3/pure-server.js"]` and it `COPY`s **only** `v3/pure-server.js` into the image; root `render.yaml` → `cd v3 && node pure-server.js`; `PRODUCTION-READINESS.md` confirms Railway service `gcsc-backend`, branch `main`, "database mode postgres". |
| Hosting = Railway | `PRODUCTION-READINESS.md` → "Backend Live, Railway service `gcsc-backend`". |
| `server.js` + `routes/` + `middleware/` + `db.js` are dead | grep: `database/db`, `middleware/*`, `routes/*` are required **only** by `server.js` and by each other. No test, no script, no entrypoint imports them. The Dockerfile never copies them. |
| Tests cover the LIVE server | `tests/postgres-storage-smoke.js` and `tests/postgres-workflow-smoke.js` both `spawn(process.execPath, ['pure-server.js'], ...)` with a Postgres `DATABASE_URL`. They exercise the real production code. |

## Misleading files — do NOT trust these

- `v3/render.yaml` and `v3/Dockerfile` point at `server.js`. **They are not used** — deployment is driven by the ROOT configs (`railway.json`, `Dockerfile`, `render.yaml`). Treat the inner ones as stale.
- Root `render.yaml` does NOT set `DATABASE_URL` and does NOT provision a database → if the app were ever deployed via Render with that file, data would land in an ephemeral JSON file and be lost on redeploy. Railway (the actual host) has `DATABASE_URL`, so this is not a live problem today — but the Render config is a trap.
- Root `ARCHITECTURE.md` describes a "Node.js Express REST API" — that matches the DEAD `server.js`, not the live `pure-server.js`. It is a conceptual/aspirational diagram, not the deployed reality.

## Known real gaps in the LIVE code (`pure-server.js`)

These are the only gaps that affect the real site. Fix here, not in the dead modules:

1. **Email OTP does not actually send (CONFIRMED).** `sendEmail` (~line 102) only `console.log`s the code. `pure-server.js` has NO gmail/nodemailer/smtp/googleapis path. Only Twilio SMS Verify is real (homeowner channel). Contractors use the email channel → they never receive the code in production (it lands in Railway logs). Fix needs a founder-chosen email provider (Gmail API or SMTP creds) — blocked on secrets, not code.
2. ~~Escrow milestone race~~ **FIXED 2026-06-13** (commits `5a5b272`, `92792a7`, `4bdfb0f`). See "Money-path atomicity" below.
3. `JWT_SECRET` falls back to a hardcoded dev value (~line 14). Railway generates a real one; only a risk if run without env.

## Money-path atomicity (CAS transitions) — added 2026-06-13

The status-changing money paths use **compare-and-set** updates instead of
read-then-write, so two concurrent requests cannot both succeed. On a conflict
the handler returns **HTTP 409** (`...changed concurrently, refresh and retry`).

| Path | Helper | Atomic guard | On conflict |
|---|---|---|---|
| milestone submit/approve/release/dispute | `transitionStoredMilestoneStatus(m, fromStatuses, to)` | Postgres `UPDATE ... WHERE id=$ AND status = ANY($from)`; JSON mode checks `fromStatuses.includes(status)` | returns `null` → handler sends 409 |
| bid accept (creates escrow) | `acceptStoredBid` | claims project `UPDATE projects SET status='in_progress' WHERE id=$ AND status='open'` first, then accepts bid `WHERE status='pending'`, compensating the project claim if the bid is no longer pending | returns `null` → handler sends 409; handler also rejects already-escrowed projects with 400 |

Regression coverage: `tests/postgres-workflow-smoke.js` asserts a second
accept of the same bid does not create a second escrow, and a second release of
an already-released milestone does not emit a second release event.

**Audit conclusion (2026-06-13):** the other check-then-act handlers are NOT
money-critical and were intentionally left as-is — `wallet/connect` and
`documents/:id/review` are idempotent last-write-wins overwrites;
`financing/prechecks` is a demo INSERT (SETTLEMENT_ENABLED off, multiple allowed
by design).

## Dead-but-notable (in the dead module tree, for reference only)

- `routes/disputes.js` resolve endpoint has `// TODO: add admin/mediator role check` — any authed user could resolve any dispute. Not active (module not mounted), but do not revive as-is.
- `routes/escrow-patched.js` is a partial PATCH SNIPPET, not a runnable module (references `requireAuth`, `sendError`, etc. that it does not define). It cannot be `require`d as a router.
- Duplicate pairs: `escrow.js`↔`escrow-patched.js`, `stripe.js`↔`stripe-payments.js`.

## Recommended consolidation (pending founder OK before deletion)

Because nothing live references the modular tree, it can be safely moved to an archive
folder (e.g. `v3/_dead-modular-archive/`) to end the confusion. Do this as a `git mv`
so it is reversible. Keep `pure-server.js`, `tests/`, `scripts/`, `database/*.sql`
migrations, and the public/ frontend. Until then, **only edit `pure-server.js`**.
