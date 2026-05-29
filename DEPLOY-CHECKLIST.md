# GCSC Smart Contractor Deploy Checklist

Current platform: Railway  
Current backend: `v3/pure-server.js`  
Current database: PostgreSQL through `DATABASE_URL`

This checklist reflects the active Railway MVP backend. Older Render notes are kept where useful because they explain the previous 503 failure mode, but Railway is now the live deployment path.

Live backend:

```text
https://gcsc-backend-production.up.railway.app
```

Live frontend:

```text
https://gcsc.store
```

## 0. Current Railway Setup Order

1. Create or open the Railway project.
2. Connect repository `Melxisedek75/gcsc-smart-contractor`.
3. Use branch `main`.
4. Keep the root directory empty because `railway.json` and `Dockerfile` live at the repository root.
5. Railway uses `railway.json`:

```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "node v3/pure-server.js",
    "healthcheckPath": "/health"
  }
}
```

6. Add PostgreSQL first, then copy its `DATABASE_URL` into the backend service variables.
7. Add `JWT_SECRET`, CORS settings, and admin bootstrap variables if an admin account must be created.
8. Deploy and smoke test `/health`.
9. For first-admin setup, document review, audit review, backup, and rollback operations, follow `ADMIN-OPERATIONS-RUNBOOK.md`.

## 1. Render Setup Order

1. Create PostgreSQL first.
   - Render Dashboard -> New -> PostgreSQL.
   - Name: `gcsc-db`.
   - Copy the internal host, database, user, password, and port.

2. Create the web service.
   - Render Dashboard -> New -> Web Service.
   - Repository: `Melxisedek75/gcsc-smart-contractor`.
   - Root Directory: `v3`.
   - Build Command: `npm install`.
   - Start Command: `node server.js`.
   - Health Check Path: `/health`.

3. Add database environment variables.
   - Do this before first deploy.
   - Current code reads `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, not only `DATABASE_URL`.

4. Add security secrets.
   - Add `JWT_SECRET`.
   - Add `ENCRYPTION_SECRET`.

5. Configure Google OAuth and Gmail.
   - Add Google OAuth credentials.
   - Add refresh token.
   - Add sender email.

6. Configure Stripe.
   - Start with Stripe test keys.
   - Add webhook endpoint after the backend URL is live.

7. Configure XPR Network.
   - Add chain ID, API endpoint, and escrow contract account.

8. Run migrations.
   - Apply the SQL files in the order listed below.

9. Redeploy and smoke test.

## 2. Important Render Warning

The root `render.yaml` currently starts:

```bash
cd v3 && node pure-server.js
```

That runs the in-memory demo server. It is useful for quick demos, but it is not the real PostgreSQL production backend.

For production, use:

```bash
cd v3 && node server.js
```

If deploying manually with Root Directory set to `v3`, use:

```bash
npm install
node server.js
```

## 3. Environment Variables

Values marked "secret" must be created in Render Environment and never committed.

| Variable | Required | Description | Example |
|---|---:|---|---|
| `NODE_ENV` | yes | Runtime mode. Must be production on Render. | `production` |
| `PORT` | yes | Render usually injects this. Use 10000 if setting manually. | `10000` |
| `JWT_SECRET` | yes | Secret for HS256 JWT signing. Use 64+ random chars. | `openssl rand -hex 64` |
| `JWT_EXPIRES_IN` | yes | JWT lifetime used by `jsonwebtoken`. | `24h` |
| `ENCRYPTION_SECRET` | yes | AES/PBKDF2 secret. Must be 32+ chars and include uppercase, lowercase, digit, symbol. | `openssl rand -base64 48` |
| `OTP_EXPIRY_MINUTES` | yes | Email OTP lifetime. | `10` |
| `FRONTEND_URL` | yes | Public frontend origin used by backend links/CORS logic. | `https://gcsc.store` |
| `CORS_ALLOWED_ORIGINS` | yes | Comma-separated allowed browser origins read by `v3/pure-server.js`. | `https://gcsc.store,https://www.gcsc.store,http://localhost:5173` |
| `EMAIL_FROM` | yes | Gmail sender address. | `gcscdao@gmail.com` |
| `GOOGLE_CLIENT_ID` | yes | Google OAuth client ID. | `1234567890-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | yes | Google OAuth client secret. | secret |
| `GOOGLE_REDIRECT_URI` | yes | OAuth callback URL configured in Google Cloud. | `https://gcsc-backend.onrender.com/dev/oauth/callback` |
| `GOOGLE_REFRESH_TOKEN` | yes | Refresh token for Gmail/Drive API. | secret |
| `DATABASE_URL` | yes on Railway | PostgreSQL connection string. `v3/pure-server.js` uses it automatically. | `postgresql://...` |
| `PGHOST` | yes for Render / optional on Railway | Render Postgres internal hostname. | `dpg-xxxxx-a.oregon-postgres.render.com` |
| `PGPORT` | yes | PostgreSQL port. | `5432` |
| `PGDATABASE` | yes | Database name. | `gcsc_db` |
| `PGUSER` | yes | Database user. | `gcsc_admin` |
| `PGPASSWORD` | yes | Database password. | secret |
| `PGSSL` | yes on Render | Enables SSL in `v3/database/db.js`. | `true` |
| `PGSSL_REJECT_UNAUTHORIZED` | recommended | Set false unless you provide a CA cert. | `false` |
| `PGMAXPOOL` | optional | Max PostgreSQL pool size. | `20` |
| `PGTIMEOUT` | optional | Query timeout in ms. | `30000` |
| `ADMIN_BOOTSTRAP_ENABLED` | optional | Set to `true` once to create the first admin account at boot. Disable after the account exists. | `true` |
| `ADMIN_EMAIL` | required when bootstrap enabled | First admin email. Must be the email you will use to log in. | `admin@gcsc.store` |
| `ADMIN_PASSWORD` | required when bootstrap enabled | First admin password. Must be 12+ characters. Store only in Railway variables. | secret |
| `ADMIN_FULL_NAME` | optional | Display name for first admin account. | `GCSC Admin` |
| `RATE_LIMIT_WINDOW_MS` | recommended | Default rate limit window for protected groups. | `900000` |
| `AUTH_RATE_LIMIT_MAX` | recommended | Max auth attempts per IP/window. | `20` |
| `AUTH_RATE_LIMIT_WINDOW_MS` | recommended | Auth-specific window. | `900000` |
| `PROFILE_RATE_LIMIT_MAX` | recommended | Profile endpoint max requests per user/IP/window. | `120` |
| `PROFILE_RATE_LIMIT_WINDOW_MS` | recommended | Profile-specific window. | `900000` |
| `DOCUMENT_RATE_LIMIT_MAX` | recommended | Document upload/review endpoint max requests. | `45` |
| `DOCUMENT_RATE_LIMIT_WINDOW_MS` | recommended | Document-specific window. | `900000` |
| `WALLET_RATE_LIMIT_MAX` | recommended | Wallet endpoint max requests. | `45` |
| `WALLET_RATE_LIMIT_WINDOW_MS` | recommended | Wallet-specific window. | `900000` |
| `BID_ACCEPT_RATE_LIMIT_MAX` | recommended | Bid acceptance endpoint max requests. | `30` |
| `BID_ACCEPT_RATE_LIMIT_WINDOW_MS` | recommended | Bid acceptance-specific window. | `900000` |
| `RATE_LIMIT_STORE_MAX_KEYS` | optional | In-memory limiter cleanup threshold. | `5000` |
| `RATE_LIMITS_DISABLED` | local/test only | Disable rate limits for smoke tests. Never use in production. | `false` |
| `STRIPE_PUBLISHABLE_KEY` | yes for payments | Stripe publishable key for frontend/client config. | `pk_test_...` |
| `STRIPE_SECRET_KEY` | yes for payments | Stripe secret key for PaymentIntent and payouts. | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | yes for webhooks | Stripe webhook signing secret. | `whsec_...` |
| `STRIPE_CONNECT_CLIENT_ID` | optional | Stripe Connect OAuth client ID for contractor payouts. | `ca_...` |
| `XPR_CHAIN_ID` | yes | XPR chain ID. Mainnet should use full chain ID. | `384da888ccb047ea0000000000000000000000000000000000` |
| `XPR_API_ENDPOINT` | yes | XPR API endpoint. | `https://api.protonchain.com` |
| `XPR_ESCROW_CONTRACT` | yes for on-chain escrow | Deployed escrow contract account. | `gcscrow1111` |
| `TWILIO_ACCOUNT_SID` | optional | SMS OTP provider account. | `AC...` |
| `TWILIO_AUTH_TOKEN` | optional | SMS OTP provider token. | secret |
| `TWILIO_PHONE_NUMBER` | optional | SMS sender phone number. | `+12065550123` |

The checked `.env.template` currently includes only the core v2 values. For v3 Render deployment, add the v3 values above.

## 4. Generate Secrets

Run locally:

```bash
openssl rand -hex 64
openssl rand -base64 48
```

Use the first output for `JWT_SECRET`. Use the second output for `ENCRYPTION_SECRET`. If the base64 value does not contain uppercase, lowercase, digits, and symbols, generate again because `v3/server.js` checks entropy at startup.

## 4A. First Admin Account

The production Dashboard admin screens require a real user with role `admin`. The backend can create the first admin account safely during startup.

Operational details are in `ADMIN-OPERATIONS-RUNBOOK.md`.
The founder-facing action list is in `FOUNDER-ACTION-PACKET.md`.

Set these Railway variables:

```text
ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_EMAIL=<your-admin-email>
ADMIN_PASSWORD=<strong-password-12-plus-chars>
ADMIN_FULL_NAME=GCSC Admin
```

Before redeploy, a local or Railway shell can validate presence without printing secrets:

```bash
npm --prefix v3 run admin:bootstrap:check
```

Deploy once, log in with that email and password, then set:

```text
ADMIN_BOOTSTRAP_ENABLED=false
```

Redeploy after disabling bootstrap. This keeps the bootstrap path from running on every future boot.

Important safety behavior:

- If the email already exists and is already admin, the backend leaves it alone.
- If the email already exists but is not admin, the backend refuses to upgrade it automatically.
- Passwords are stored as bcrypt hashes, never plain text.

## 4B. Security Defaults For Railway

Use a strict CORS list:

```text
FRONTEND_URL=https://gcsc.store
CORS_ALLOWED_ORIGINS=https://gcsc.store,https://www.gcsc.store
```

Recommended rate limit variables:

```text
RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=20
PROFILE_RATE_LIMIT_MAX=120
DOCUMENT_RATE_LIMIT_MAX=45
WALLET_RATE_LIMIT_MAX=45
BID_ACCEPT_RATE_LIMIT_MAX=30
RATE_LIMIT_STORE_MAX_KEYS=5000
RATE_LIMITS_DISABLED=false
```

## 5. Google OAuth Setup

1. Open Google Cloud Console.
2. Create or open the GCSC project.
3. Enable Gmail API and Google Drive API.
4. Create OAuth Client credentials.
5. Add authorized redirect URI:

```text
https://gcsc-backend.onrender.com/dev/oauth/callback
```

6. Generate a refresh token using the existing helper flow.
7. Put these in Render:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GOOGLE_REFRESH_TOKEN
EMAIL_FROM
```

## 6. Stripe Setup

1. Start in Stripe test mode.
2. Add:

```text
STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
```

3. After Render backend is live, create a Stripe webhook endpoint:

```text
https://gcsc-backend.onrender.com/api/stripe/webhook
```

4. Subscribe to payment intent events.
5. Copy the webhook signing secret into:

```text
STRIPE_WEBHOOK_SECRET
```

## 7. XPR Setup

Start with mainnet read endpoint:

```text
XPR_CHAIN_ID=384da888ccb047ea0000000000000000000000000000000000
XPR_API_ENDPOINT=https://api.protonchain.com
XPR_ESCROW_CONTRACT=gcscrow1111
```

If testing before mainnet deployment, use the testnet chain ID and testnet endpoint consistently. Do not mix mainnet accounts with testnet transactions.

## 8. PostgreSQL Migrations

Before running migrations, verify the expected production migration files and order:

```bash
npm --prefix v3 run db:migrations:check
```

Run these from the repository root, using the Render database connection string in your terminal:

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/gcsc_db?sslmode=require"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f v3/database/schema_v3_migration.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f v3/database/persistent-storage-migration.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f v3/database/stripe-payments-migration.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f v3/database/escrow-audit-migration.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f v3/database/bid-audit-migration.sql
```

Do not run `database/migrations/001-add-contractor-verifications.sql` for the v3 backend unless you first compare columns. The v3 route `v3/routes/verification.js` expects `document_image_url` and `verification_token`, which are created by `v3/database/persistent-storage-migration.sql`.

Verify tables:

```bash
psql "$DATABASE_URL" -c "\dt"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM users;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM sessions;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM projects;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM bids;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM escrow_contracts;"
```

## 9. Why The Old Render Backend Returned 503

Historic symptom:

```bash
curl -i https://gcsc-backend.onrender.com/health
```

returns HTTP 503 with database degraded/error.

Exact cause on the old Render setup:

`v3/server.js` returns 503 from `/health` only when this PostgreSQL check fails:

```sql
SELECT 1
```

`v3/database/db.js` does not currently read Render's `DATABASE_URL`. It builds the connection from:

```text
PGHOST
PGPORT
PGDATABASE
PGUSER
PGPASSWORD
PGSSL
```

But `v3/render.yaml` provides `DATABASE_URL`, not those `PG*` values. Result: the backend defaults to `localhost:5432`, cannot reach PostgreSQL on Render, and `/health` returns 503.

Exact fix without code changes:

1. Open Render Dashboard.
2. Open the PostgreSQL service.
3. Copy internal connection values.
4. Open the web service.
5. Go to Environment.
6. Add:

```text
PGHOST=<Render internal postgres host>
PGPORT=5432
PGDATABASE=gcsc_db
PGUSER=gcsc_admin
PGPASSWORD=<Render postgres password>
PGSSL=true
PGSSL_REJECT_UNAUTHORIZED=false
```

7. Make sure all required non-database variables are also set.
8. Redeploy.
9. Run:

```bash
curl -s https://gcsc-backend.onrender.com/health
```

Expected:

```json
{
  "status": "ok",
  "services": {
    "database": "connected"
  }
}
```

Alternative Render code fix:

Update `v3/database/db.js` to use `connectionString: process.env.DATABASE_URL` when `DATABASE_URL` exists. That would let Render's `fromDatabase` env work directly.

## 10. Health Check Commands

Current Railway backend:

```bash
curl -i https://gcsc-backend-production.up.railway.app/health
curl -s https://gcsc-backend-production.up.railway.app/health
```

Repeatable production smoke command from the repository root:

```bash
npm --prefix v3 run smoke:production
npm --prefix v3 run security:cors:smoke
```

Repeatable non-secret operations status report:

```bash
npm --prefix v3 run ops:status
```

The GitHub Actions workflow also runs the public smoke/status checks daily at `14:00 UTC` without secrets.

Expected:

```json
{
  "status": "ok",
  "database": "postgres"
}
```

Frontend freshness note:

- The smoke command requires the canonical `https://gcsc.store` bundle to include current production markers.
- Railway frontend may show `frontend bundle stale warning` until its frontend service is redeployed.
- After Railway frontend redeploy, run strict verification:

```powershell
$env:STRICT_RAILWAY_FRONTEND="1"
npm --prefix v3 run smoke:production
Remove-Item Env:\STRICT_RAILWAY_FRONTEND
```

Use `RAILWAY-FRONTEND-REDEPLOY-RUNBOOK.md` for the manual Railway redeploy steps.

Admin audit endpoint after admin login:

```bash
curl -i "https://gcsc-backend-production.up.railway.app/api/admin/audit-events?limit=20" \
  -H "Authorization: Bearer $ADMIN_JWT"
```

Expected: HTTP 200 and an `events` array. Non-admin JWTs must return 403.

Replace `https://gcsc-backend.onrender.com` with the actual Render URL.

Core backend and database:

```bash
curl -i https://gcsc-backend.onrender.com/health
curl -s https://gcsc-backend.onrender.com/health
```

Database direct:

```bash
psql "$DATABASE_URL" -c "SELECT 1;"
```

Public 404 check:

```bash
curl -i https://gcsc-backend.onrender.com/not-real
```

Expected: HTTP 404 JSON. This confirms Express is serving requests.

Registration email check:

```bash
curl -i -X POST https://gcsc-backend.onrender.com/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"your-test-email@example.com","role":"homeowner"}'
```

Expected: success message and Gmail delivery attempt in logs.

Authenticated API check after login:

```bash
curl -i https://gcsc-backend.onrender.com/api/me \
  -H "Authorization: Bearer $JWT"
```

Stripe availability check after creating a test user/project:

```bash
curl -i -X POST https://gcsc-backend.onrender.com/api/stripe/create-payment-intent \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"project_id":1,"amount_usd":5000}'
```

If Stripe keys are missing, this returns 503 `Payment service unavailable`.

XPR read check after login:

```bash
curl -i https://gcsc-backend.onrender.com/api/xpr/account/eosio \
  -H "Authorization: Bearer $JWT"
```

If XPR packages or endpoint are unavailable, this returns 503 `XPR chain API unavailable`.

## 11. Smoke Test Checklist

- `/health` returns HTTP 200.
- `/health` JSON shows PostgreSQL mode on Railway, or `services.database=connected` on the older Render backend.
- `npm --prefix v3 run security:cors:smoke` passes: `https://gcsc.store` is allowed, an external origin is rejected, and admin audit guard remains HTTP 401 without JWT.
- Render logs show `Database connection: OK`.
- Railway logs show the server listening on the injected `PORT`.
- Registration sends OTP email.
- OTP verification creates a user and returns a JWT.
- `GET /api/me` works with the JWT.
- First admin account can log in after one-time bootstrap.
- Admin can open Dashboard -> Audit Log and read `/api/admin/audit-events`.
- Admin can export audit evidence locally with `npm --prefix v3 run audit:export` using a short-lived `ADMIN_JWT`; exported JSON stays under ignored `evidence/`.
- Operator can run `npm --prefix v3 run ops:status`; generated status JSON stays under ignored `evidence/`.
- Non-admin user cannot read `/api/admin/audit-events`.
- Admin can approve/reject contractor documents.
- Homeowner can create a project.
- Contractor can submit a bid.
- Homeowner cannot accept a bid from an unverified contractor.
- Homeowner can accept a bid and create escrow record.
- Contractor public profile opens from the homeowner review flow.
- Stripe test PaymentIntent can be created.
- Stripe webhook receives and validates a signed test event.
- XPR account lookup does not return 503.
- Escrow milestone completion and approval endpoints update PostgreSQL.
- Audit events receive profile, document, wallet, and bid acceptance rows.
- No logs print secrets, JWTs, private keys, or Stripe secret values.

## 12. Rollback

If deploy breaks:

1. In Render, open the web service.
2. Go to Events.
3. Select the previous successful deploy.
4. Click Rollback.
5. Do not rollback PostgreSQL schema unless a migration caused data corruption.
6. If schema rollback is required, take a database backup first.
