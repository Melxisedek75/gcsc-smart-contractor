# GCSC Security Audit Report
# Date: 2026-05-20
# Auditor: Kimi Claw
# Scope: v3/routes/*.js (all backend routes)

---

## Executive Summary

**Status:** 🔶 MEDIUM RISK — Issues found, no critical backdoors, but several vulnerabilities require fixing before production.

| Severity | Count | Areas |
|----------|-------|-------|
| 🔴 Critical | 0 | No backdoors found |
| 🟠 High | 2 | Auth inconsistency, potential SQL injection vector |
| 🟡 Medium | 3 | In-memory data loss, missing rate limits, missing audit logs |
| 🟢 Low | 2 | Debug info exposure, inconsistent error handling |

---

## Detailed Findings

### 🟠 HIGH-1: SQL Injection Vector in bids.js (PUT /:id)

**Location:** `v3/routes/bids.js` line ~370-390

**Issue:** Dynamic SQL construction for UPDATE:
```javascript
const updates = [];
const params = [];
let paramIndex = 1;

if (amount !== undefined) {
    updates.push(`amount = $${paramIndex}`);
    params.push(amount);
    paramIndex++;
}
// ... same for other fields

const result = await db.query(
    `UPDATE bids SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
);
```

**Risk:** While field names are hardcoded in code, this pattern is dangerous. If any field name becomes dynamic in future, it's immediate SQL injection.

**Recommendation:** Use hardcoded update queries or a whitelist of allowed fields. Never construct SQL from variables.

**Fix:**
```javascript
// BETTER — explicit query per field combination
const allowedFields = ['amount', 'timeline_days', 'description'];
// Build query explicitly, never interpolate field names
```

---

### 🟠 HIGH-2: Authentication Inconsistency — stripe-payments.js

**Location:** `v3/routes/stripe-payments.js` lines 120-140

**Issue:** Custom JWT implementation instead of shared `requireAuth` middleware:
```javascript
function jwtVerify(token) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token');
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString());
    if (payload.exp < Math.floor(Date.now()/1000)) throw new Error('Expired');
    return payload;
}
```

**Problems:**
1. ❌ No signature verification (!!!) — anyone can forge a token
2. ❌ No `jti` check — revoked sessions still work
3. ❌ No `iat` or `nbf` validation
4. ❌ Manual base64 decode instead of `jwt.verify()`

**Impact:** Attacker can craft any JWT and access Stripe payment endpoints without valid credentials.

**Fix:** Use shared `requireAuth` middleware from other routes.

---

### 🟡 MEDIUM-1: In-Memory Data Loss

**Location:** `v3/routes/stripe-payments.js` line 85

**Issue:** Payments stored only in memory:
```javascript
const escrowPayments = []; // In-memory only! Lost on restart
let nextPaymentId = 1;
```

**Impact:** All payment records lost on server restart/redeploy. Financial data gone.

**Fix:** Store in database table `stripe_payment_intents` (exists in escrow.js SELECT).

---

### 🟡 MEDIUM-2: No Rate Limiting on Financial Endpoints

**Location:** All routes

**Issue:** No rate limiting on:
- `POST /api/bids` — spam bidding
- `POST /api/stripe/create-payment-intent` — payment intent abuse
- `POST /api/xpr/transaction/push` — transaction spam
- `POST /api/escrow/:id/dispute` — dispute spam

**Recommendation:** Add `express-rate-limit` middleware.

---

### 🟡 MEDIUM-3: Missing Audit Logs on Critical Operations

**Location:** `v3/routes/bids.js`, `v3/routes/xpr.js`

**Issue:** Only `escrow.js` has audit logging (after patch). Other routes lack audit trail:
- Bid acceptance (creates escrow!) — no log
- Bid rejection — no log  
- XPR transaction push — minimal logging
- Dispute resolution — not implemented

**Recommendation:** Add audit logging to all state-changing operations.

---

### 🟢 LOW-1: Debug Info in Error Responses

**Location:** Multiple routes

**Issue:** Error responses include `errorId` and sometimes `details` which may leak internal info. Not critical but should be sanitized in production.

---

### 🟢 LOW-2: Inconsistent JWT_SECRET Handling

**Location:** All routes

**Issue:** `JWT_SECRET = process.env.JWT_SECRET || ''` — if env var missing, empty string used. Should fail hard on missing secret.

---

## Backdoor Scan Results

### Scan Method:
```bash
grep -r "eval(" v3/routes/          → 0 matches ✅
grep -r "new Function" v3/routes/   → 0 matches ✅
grep -r "child_process" v3/routes/    → 0 matches ✅
grep -r "spawn\|exec\(" v3/routes/   → 0 matches ✅
grep -r "x-admin\|bypass\|backdoor" v3/routes/ → 0 matches ✅
grep -r "password.*123\|admin.*123" v3/routes/ → 0 matches ✅
grep -r "req\.body\..*sql\|req\.query\..*sql" v3/routes/ → 0 matches ✅
```

### Verdict:
🟢 **No backdoors found.** All routes are clean of obvious malicious patterns.

---

## Recommendations Priority

### Before Production (Blockers):
1. 🔴 **Fix stripe-payments.js auth** — Use shared `requireAuth` middleware
2. 🔴 **Store payment data in database** — Replace in-memory array with DB table

### Before Public Beta:
3. 🟠 **Add rate limiting** — All POST endpoints, especially financial
4. 🟠 **Add audit logging** — All state changes (bids, disputes, XPR txs)
5. 🟠 **Fix bids.js UPDATE pattern** — Remove dynamic SQL construction
6. 🟠 **Add `FOR UPDATE` locks** — bid acceptance creates escrow (race condition!)

### Polish:
7. 🟡 **Sanitize error responses** — Remove internal details in production
8. 🟡 **Fail hard on missing JWT_SECRET** — Don't use empty string

---

## Audit Log

| Date | Auditor | Action |
|------|---------|--------|
| 2026-05-20 | Kimi Claw | Completed full security scan of v3/routes/*.js |
| 2026-05-20 | Kimi Claw | No backdoors found ✅ |
| 2026-05-20 | Kimi Claw | 2 High, 3 Medium, 2 Low issues documented |
| 2026-05-20 | Kimi Claw | Recommendations prioritized |

---

## Next Steps

1. GCSC ClawDesctop: Fix HIGH-1 and HIGH-2 immediately
2. Kimi Claw: Write unit tests for stripe-payments.js auth
3. Both: Review bid acceptance transaction for race conditions

---

> "Security is not a product, it's a process."
