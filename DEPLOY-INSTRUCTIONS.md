# GCSC Backend — Deploy to Render.com (5 minutes)

## What You Get
- Live API server at `https://gcsc-api.onrender.com`
- PostgreSQL database (auto-created)
- All features: auth, projects, bids, escrow, Stripe, XPR

---

## Step 1: Sign Up on Render (1 minute)
1. Go to **https://dashboard.render.com**
2. Click **"Get Started"** or **"Sign Up"**
3. Sign up with your **GitHub account** (click "Connect GitHub")
4. Authorize Render to access your repositories

---

## Step 2: Create Blueprint (2 minutes)
1. In Render dashboard, click **"New +"** (blue button, top right)
2. Select **"Blueprint"**
3. Find and select your repo: **Melxisedek75/gcsc-smart-contractor**
4. Click **"Connect"**
5. Render will find the `render.yaml` file and show:
   - **Web Service**: gcsc-backend
   - **Database**: gcsc-db
6. Click **"Apply"** — services will be created automatically

---

## Step 3: Add Environment Variables (2 minutes)

Click on **gcsc-backend** service, then **Environment** tab.

Add these variables (click "Add Environment Variable" for each):

| Variable | Value | What it is |
|----------|-------|------------|
| `JWT_SECRET` | `gcsc-super-secret-key-2026-xpr` | Any random long string |
| `ENCRYPTION_SECRET` | `gcsc-encryption-secret-256-bits` | Any random long string |
| `GOOGLE_CLIENT_ID` | *(your Google OAuth ID)* | For Gmail OTP |
| `GOOGLE_CLIENT_SECRET` | *(your Google secret)* | For Gmail OTP |
| `GOOGLE_REFRESH_TOKEN` | *(your refresh token)* | For Gmail OTP |
| `EMAIL_FROM` | `noreply@gcsc.store` | Sender email |
| `STRIPE_SECRET_KEY` | `sk_test_...` | From Stripe dashboard |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | From Stripe dashboard |
| `TWILIO_ACCOUNT_SID` | `AC...` | From Twilio console |
| `TWILIO_AUTH_TOKEN` | `...` | From Twilio console |
| `TWILIO_PHONE_NUMBER` | `+1202555...` | Your Twilio number |

### How to get these values:

**JWT_SECRET & ENCRYPTION_SECRET**: Type any random long text, e.g., `my-super-secret-256-bit-key-for-gcsc-2026`

**Google values** (for email OTP):
1. Go to https://console.cloud.google.com
2. Create project → Enable Gmail API → Create OAuth credentials
3. Or use the existing token from your v1 setup

**Stripe values**:
1. Go to https://dashboard.stripe.com
2. Sign up → Developers → API Keys
3. Copy "Secret key" (starts with `sk_test_`)

**Twilio values** (for SMS OTP):
1. Go to https://www.twilio.com/try-twilio
2. Sign up (free trial gives $15 credit)
3. Get Account SID, Auth Token, and a phone number

---

## Step 4: Deploy! (automatic)

After adding variables, click **"Manual Deploy"** → **"Deploy latest commit"**

Render will:
1. Install all dependencies (30 seconds)
2. Build the app (20 seconds)
3. Start the server (10 seconds)
4. Run database migrations

**Your API is live at:** `https://gcsc-api.onrender.com`

---

## Step 5: Verify (1 minute)

Open in browser: **https://gcsc-api.onrender.com/health**

You should see:
```json
{
  "status": "ok",
  "version": "3.0.0",
  "services": {
    "database": "connected",
    "twilio": "connected"
  }
}
```

---

## Frontend URLs After Backend is Live

| Page | URL |
|------|-----|
| Landing | https://gcsc.store |
| Login | https://gcsc.store/v3/login.html |
| Register | https://gcsc.store/v3/register.html |
| Homeowner Dashboard | https://gcsc.store/v3/dashboard-homeowner.html |
| Contractor Dashboard | https://gcsc.store/v3/dashboard-contractor.html |

---

## Free Tier Limits (Render)
- **Web service**: Free (sleeps after 15 min idle, wakes on request)
- **PostgreSQL**: Free (1 GB storage)
- **Stripe**: Free testing (no real charges)
- **Twilio**: Free trial ($15 credit)

## Total Cost: $0/month while testing
