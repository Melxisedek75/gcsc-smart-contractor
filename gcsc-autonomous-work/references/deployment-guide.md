# Render.com Deployment Guide

## Prerequisites
- GitHub account with gcsc-smart-contractor repo
- Render.com account (free tier)
- Environment variables ready

## Step-by-Step

### 1. Sign Up on Render
1. Go to https://dashboard.render.com
2. Click "Get Started"
3. Sign up with GitHub account
4. Authorize Render access to repos

### 2. Create Blueprint
1. Click "New +" → "Blueprint"
2. Select: Melxisedek75/gcsc-smart-contractor
3. Click "Connect"
4. Click "Apply" — services auto-create

### 3. Add Environment Variables
Click gcsc-backend → Environment → Add:
```
JWT_SECRET=gcsc-secret-256-bits-minimum
ENCRYPTION_SECRET=gcsc-encryption-secret-256
DATABASE_URL=(auto-filled from db)
GOOGLE_CLIENT_ID=(from Google Console)
GOOGLE_CLIENT_SECRET=(from Google Console)
GOOGLE_REFRESH_TOKEN=(from OAuth flow)
EMAIL_FROM=noreply@gcsc.store
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
FRONTEND_URL=https://gcsc.store
```

### 4. Deploy
1. Click "Manual Deploy" → "Deploy latest commit"
2. Wait 2-3 minutes
3. Check logs for errors
4. Test health endpoint:
   ```
   curl https://gcsc-api.onrender.com/health
   ```

### 5. Verify Deployment
```bash
# Test health
curl https://gcsc-api.onrender.com/health

# Test register
curl -X POST https://gcsc-api.onrender.com/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","role":"homeowner"}'

# Test login
curl -X POST https://gcsc-api.onrender.com/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### 6. Connect Frontend
Update frontend API_BASE variable:
```javascript
const API_BASE = 'https://gcsc-api.onrender.com';
```

### 7. Test Full Flow
1. Register at /v3/register.html
2. Login at /v3/login.html
3. Post project from dashboard
4. Place bid as contractor
5. Accept bid as homeowner
6. Fund escrow
7. Complete milestone
8. Release payment

## Troubleshooting

### Database connection failed
- Check DATABASE_URL is set correctly
- Verify database is running in Render dashboard
- Check network access (Render services in same region)

### Server won't start
- Check logs in Render dashboard
- Verify all required env vars are set
- Check node version (should be 20+)

### CORS errors
- Verify FRONTEND_URL matches actual frontend URL
- Check CORS config in server.js

### Stripe webhooks not working
- Register webhook endpoint in Stripe dashboard
- Use https://gcsc-api.onrender.com/api/stripe/webhook
- Set signing secret in env vars
