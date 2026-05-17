#!/usr/bin/env node
/**
 * =============================================================================
 * GCSC Smart Contractor Backend v3.0 — Secure P2P Construction Marketplace
 * =============================================================================
 *
 * Extended from v2.0 with new modules:
 *   - Stripe payment processing (escrow deposits & contractor payouts)
 *   - XPR Network blockchain integration (WebAuth wallet, on-chain escrow)
 *   - Full project CRUD (homeowner project management)
 *   - Bidding system (contractor bid lifecycle)
 *   - Escrow workflow (milestones, disputes, statistics)
 *
 * Security Stack (v2 + v3):
 *   1. Trust proxy — Railway deployment compatibility
 *   2. Request ID generation — per-request log correlation
 *   3. Helmet.js — all security headers (CSP, HSTS, X-Frame-Options, etc.)
 *   4. HTTPS redirect — production-only HTTP->HTTPS redirect
 *   5. CORS whitelist — strict origin validation
 *   6. Rate limiting — general + registration-specific + stripe limits
 *   7. Body parser limits — strict size/type validation
 *   8. Stripe webhook raw body — required for signature verification
 *   9. Input validation — validator.js with role whitelist
 *   10. Morgan logging — structured request logging
 *
 * Auth: JWT tokens with server-side session revocation (PostgreSQL sessions table)
 * Keypair: async crypto.generateKeyPair, ripemd160 npm package, PBKDF2 600k
 * Encryption: AES-256-GCM with unique salt/IV per operation, PBKDF2-SHA256 600k
 * Storage: Google Drive OAuth2 with request timeouts
 * Email: Gmail API (OAuth2), HTML-escaped, OTP verification
 * Database: PostgreSQL with parameterized queries (pg library)
 * Payments: Stripe (PaymentIntent, Connect, Webhook signature verification)
 * Blockchain: XPR Network (@proton/api for reads, @proton/js for transactions)
 *
 * NEVER send err.message to client. NEVER trust client-sent role.
 * NEVER expose private keys in any response.
 *
 * @author    GCSC Engineering Team
 * @version   3.0.0
 * @license   UNLICENSED
 * =============================================================================
 */

// ---------------------------------------------------------------------------
// SECTION 0: ENVIRONMENT LOADING (must be first)
// ---------------------------------------------------------------------------

require('dotenv').config();

// ---------------------------------------------------------------------------
// SECTION 1: CORE IMPORTS
// ---------------------------------------------------------------------------

const express      = require('express');
const crypto       = require('crypto');
const fs           = require('fs');
const path         = require('path');
const { google }   = require('googleapis');
const jwt          = require('jsonwebtoken');
const morgan       = require('morgan');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const cors         = require('cors');
const validator    = require('validator');
const RIPEMD160    = require('ripemd160');

// PostgreSQL database module
const db = require('./database/db');

// ---------------------------------------------------------------------------
// SECTION 2: V3 ROUTE IMPORTS
// ---------------------------------------------------------------------------

const stripeRoutes  = require('./routes/stripe');
const xprRoutes     = require('./routes/xpr');
const projectRoutes = require('./routes/projects');
const bidRoutes     = require('./routes/bids');
const escrowRoutes  = require('./routes/escrow');

// ---------------------------------------------------------------------------
// SECTION 3: ENVIRONMENT VARIABLE VALIDATION
// ---------------------------------------------------------------------------

/** @type {string[]} List of all required environment variables */
const REQUIRED_ENV_VARS = [
  'NODE_ENV',
  'PORT',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'ENCRYPTION_SECRET',
  'OTP_EXPIRY_MINUTES',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_REFRESH_TOKEN',
  'EMAIL_FROM',
  'XPR_CHAIN_ID',
  'CORS_ORIGIN_WHITELIST',
];

/** @type {string[]} Tracks any missing variables */
const missingVars = [];

for (const v of REQUIRED_ENV_VARS) {
  if (!process.env[v] || process.env[v].trim() === '' || process.env[v].startsWith('YOUR_')) {
    missingVars.push(v);
  }
}

if (missingVars.length > 0) {
  // eslint-disable-next-line no-console
  console.error('[FATAL] Missing required environment variables:');
  missingVars.forEach(v => {
    // eslint-disable-next-line no-console
    console.error(`  - ${v}`);
  });
  // eslint-disable-next-line no-console
  console.error('[FATAL] Copy .env.template to .env and configure all values.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// SECTION 4: ENCRYPTION SECRET ENTROPY VALIDATION
// ---------------------------------------------------------------------------

const ENC_SECRET = process.env.ENCRYPTION_SECRET;

if (ENC_SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.error('[FATAL] ENCRYPTION_SECRET must be at least 32 characters long.');
  process.exit(1);
}

const hasUpper   = /[A-Z]/.test(ENC_SECRET);
const hasLower   = /[a-z]/.test(ENC_SECRET);
const hasDigit   = /[0-9]/.test(ENC_SECRET);
const hasSymbol  = /[^A-Za-z0-9]/.test(ENC_SECRET);
const entropyScore = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;

if (entropyScore < 4) {
  // eslint-disable-next-line no-console
  console.error('[FATAL] ENCRYPTION_SECRET must contain uppercase, lowercase, digits, and symbols.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// SECTION 5: CONSTANTS & CONFIGURATION
// ---------------------------------------------------------------------------

const NODE_ENV        = process.env.NODE_ENV        || 'development';
const IS_PRODUCTION   = NODE_ENV === 'production';
const PORT            = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET      = process.env.JWT_SECRET;
const JWT_EXPIRES_IN  = process.env.JWT_EXPIRES_IN  || '24h';
const OTP_EXPIRY_MS   = (parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10)) * 60 * 1000;
const EMAIL_FROM      = process.env.EMAIL_FROM;
const XPR_CHAIN_ID    = process.env.XPR_CHAIN_ID;
const FRONTEND_URL    = process.env.FRONTEND_URL    || 'http://localhost:3000';

// CORS whitelist
const CORS_WHITELIST = (process.env.CORS_ORIGIN_WHITELIST || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Security constants
const AES_KEY_SIZE      = 32;
const AES_IV_SIZE       = 16;
const AES_TAG_SIZE      = 16;
const PBKDF2_ITERATIONS = 600000;
const SALT_SIZE         = 32;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX       = 100;
const REG_LIMIT_WINDOW_MS  = 60 * 60 * 1000;
const REG_LIMIT_MAX        = 5;

// Stripe rate limiter (stricter for payment operations)
const STRIPE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const STRIPE_LIMIT_MAX       = 30;

// Google Drive file constants
const DRIVE_KEY_FILE    = 'gcsc_keypairs.json';
const REQUEST_TIMEOUT_MS = 25000;

// ---------------------------------------------------------------------------
// SECTION 6: OTP HASHING HELPER
// ---------------------------------------------------------------------------

function hashOtp(otp) {
  return crypto.createHmac('sha256', JWT_SECRET).update(otp).digest('hex');
}

function parseJwtExpiryToMs(expiry) {
  if (typeof expiry !== 'string') return 24 * 60 * 60 * 1000;
  const match = expiry.match(/^(\d+)\s*([dhms])$/i);
  if (!match) return 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  return value * (multipliers[unit] || 3600000);
}

// ---------------------------------------------------------------------------
// SECTION 7: GOOGLE DRIVE SETUP (OAuth2 with Auto-Refresh)
// ---------------------------------------------------------------------------

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

oauth2Client.on('tokens', (tokens) => {
  // eslint-disable-next-line no-console
  console.log('[GoogleAuth] Access token refreshed.');
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// ---------------------------------------------------------------------------
// SECTION 8: HELPER FUNCTIONS
// ---------------------------------------------------------------------------

function generateRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

function generateOTP() {
  const buf = crypto.randomBytes(4);
  const num = buf.readUInt32BE(0);
  return String(num % 1000000).padStart(6, '0');
}

function generateErrorId() {
  return crypto.randomBytes(6).toString('hex');
}

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendError(res, status, message, err = null, errorId = '') {
  if (err && errorId) {
    // eslint-disable-next-line no-console
    console.error(`[Error:${errorId}]`, err.message || '', err.stack || '');
  }
  res.status(status).json({ error: message, ...(errorId && { errorId }) });
}

function withTimeout(promise, ms, context = 'Operation') {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${context} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// ---------------------------------------------------------------------------
// SECTION 9: ENCRYPTION / DECRYPTION (AES-256-GCM with PBKDF2)
// ---------------------------------------------------------------------------

function encrypt(plaintext) {
  const salt = crypto.randomBytes(SALT_SIZE);
  const iv   = crypto.randomBytes(AES_IV_SIZE);

  const key = crypto.pbkdf2Sync(
    ENC_SECRET,
    salt,
    PBKDF2_ITERATIONS,
    AES_KEY_SIZE,
    'sha256'
  );

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([salt, iv, authTag, encrypted]);
  return combined.toString('base64');
}

function decrypt(ciphertext) {
  const combined = Buffer.from(ciphertext, 'base64');

  const salt      = combined.subarray(0, SALT_SIZE);
  const iv        = combined.subarray(SALT_SIZE, SALT_SIZE + AES_IV_SIZE);
  const authTag   = combined.subarray(SALT_SIZE + AES_IV_SIZE, SALT_SIZE + AES_IV_SIZE + AES_TAG_SIZE);
  const encrypted = combined.subarray(SALT_SIZE + AES_IV_SIZE + AES_TAG_SIZE);

  const key = crypto.pbkdf2Sync(
    ENC_SECRET,
    salt,
    PBKDF2_ITERATIONS,
    AES_KEY_SIZE,
    'sha256'
  );

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

// ---------------------------------------------------------------------------
// SECTION 10: XPR KEYPAIR GENERATION
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(buffer) {
  let num = BigInt('0x' + buffer.toString('hex'));
  const base = BigInt(58);
  let encoded = '';

  while (num > 0) {
    const remainder = num % base;
    encoded = BASE58_ALPHABET[Number(remainder)] + encoded;
    num = num / base;
  }

  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0) {
      encoded = '1' + encoded;
    } else {
      break;
    }
  }

  return encoded;
}

function sha256Checksum(buffer) {
  return crypto.createHash('sha256')
    .update(crypto.createHash('sha256').update(buffer).digest())
    .digest()
    .subarray(0, 4);
}

async function generateXPRKeypair() {
  const { publicKey: pubKey, privateKey: privKey } = await crypto.generateKeyPair('ec', {
    namedCurve: 'secp256k1',
    publicKeyEncoding: { type: 'uncompressed', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  const privBytes = privKey.subarray(privKey.length - 32);

  const pubKeyHash = crypto.createHash('sha256').update(pubKey).digest();
  const ripemd = new RIPEMD160();
  const pubKeyRipemd = ripemd.update(pubKeyHash).digest();

  const accountHex = pubKeyRipemd.toString('hex');
  const accountName = accountHex.substring(0, 12).replace(/[o0]/g, '1').replace(/[6-9]/g, '5');

  const pubKeyData = Buffer.concat([Buffer.from([0x03]), pubKey]);
  const pubKeyCheck = sha256Checksum(pubKeyData);
  const publicKey = 'PUB_K1_' + base58Encode(Buffer.concat([pubKeyData, pubKeyCheck]));

  const wifVersion = Buffer.from([0x80]);
  const wifCompression = Buffer.from([0x01]);
  const wifPayload = Buffer.concat([wifVersion, privBytes, wifCompression]);
  const wifCheck = sha256Checksum(wifPayload);
  const wifPrivateKey = base58Encode(Buffer.concat([wifPayload, wifCheck]));

  const result = {
    publicKey,
    wifPrivateKey,
    accountName,
  };

  privBytes.fill(0);

  return result;
}

// ---------------------------------------------------------------------------
// SECTION 11: GOOGLE DRIVE OPERATIONS
// ---------------------------------------------------------------------------

async function uploadToDrive(accountName, encryptedData, requestId) {
  const fileMetadata = {
    name: `${accountName}.enc`,
    parents: ['appDataFolder'],
  };
  const media = {
    mimeType: 'application/octet-stream',
    body: encryptedData,
  };

  const response = await withTimeout(
    drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id',
    }),
    REQUEST_TIMEOUT_MS,
    'Google Drive upload'
  );

  return response.data.id;
}

async function loadKeyRegistry(requestId) {
  try {
    const response = await withTimeout(
      drive.files.list({
        q: `name='${DRIVE_KEY_FILE}' and 'appDataFolder' in parents and trashed=false`,
        spaces: 'appDataFolder',
        fields: 'files(id, modifiedTime)',
      }),
      REQUEST_TIMEOUT_MS,
      'Google Drive registry search'
    );

    const files = response.data.files;
    if (!files || files.length === 0) {
      return { accounts: [] };
    }

    const fileId = files[0].id;
    const contentResponse = await withTimeout(
      drive.files.get({ fileId, alt: 'media' }),
      REQUEST_TIMEOUT_MS,
      'Google Drive registry download'
    );

    if (typeof contentResponse.data === 'string') {
      return JSON.parse(contentResponse.data);
    }
    return contentResponse.data;
  } catch (err) {
    const errorId = generateErrorId();
    // eslint-disable-next-line no-console
    console.error(`[${requestId}] [Error:${errorId}] Failed to load key registry:`, err.message);
    return { accounts: [] };
  }
}

async function saveKeyRegistry(registry, requestId) {
  const content = JSON.stringify(registry, null, 2);

  const response = await withTimeout(
    drive.files.list({
      q: `name='${DRIVE_KEY_FILE}' and 'appDataFolder' in parents and trashed=false`,
      spaces: 'appDataFolder',
      fields: 'files(id)',
    }),
    REQUEST_TIMEOUT_MS,
    'Google Drive registry search'
  );

  const files = response.data.files;

  if (files && files.length > 0) {
    await withTimeout(
      drive.files.update({
        fileId: files[0].id,
        media: {
          mimeType: 'application/json',
          body: content,
        },
      }),
      REQUEST_TIMEOUT_MS,
      'Google Drive registry update'
    );
  } else {
    await withTimeout(
      drive.files.create({
        requestBody: {
          name: DRIVE_KEY_FILE,
          parents: ['appDataFolder'],
        },
        media: {
          mimeType: 'application/json',
          body: content,
        },
      }),
      REQUEST_TIMEOUT_MS,
      'Google Drive registry create'
    );
  }
}

// ---------------------------------------------------------------------------
// SECTION 12: EMAIL SYSTEM (Gmail API)
// ---------------------------------------------------------------------------

async function sendEmail(to, subject, htmlBody, textBody, requestId) {
  const boundary = `gcsc_${crypto.randomBytes(8).toString('hex')}`;
  const messageParts = [
    `From: ${EMAIL_FROM}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    textBody,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ];

  const rawMessage = messageParts.join('\r\n');

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await withTimeout(
    gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    }),
    REQUEST_TIMEOUT_MS,
    'Gmail API send'
  );
}

async function sendVerificationEmail(email, otp, requestId) {
  const safeEmail = escapeHtml(email);
  const safeOTP   = escapeHtml(otp);
  const safeApp   = escapeHtml('GCSC Smart Contractor');

  const subject = 'Your GCSC Verification Code';

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Verification Code</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 500px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; }
    .otp { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a73e8; margin: 20px 0; }
    .footer { font-size: 12px; color: #666; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Verify Your Email</h2>
    <p>Hello,</p>
    <p>Your verification code for <strong>${safeApp}</strong> is:</p>
    <div class="otp">${safeOTP}</div>
    <p>This code will expire in 10 minutes.</p>
    <p>If you did not request this code, please ignore this email.</p>
    <div class="footer">
      <p>This email was sent to ${safeEmail}.</p>
      <p>&copy; GCSC. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

  const textBody = `
Hello,

Your verification code for GCSC Smart Contractor is: ${safeOTP}

This code will expire in 10 minutes.

If you did not request this code, please ignore this email.

This email was sent to ${safeEmail}.
`;

  await sendEmail(email, subject, htmlBody, textBody, requestId);
}

// ---------------------------------------------------------------------------
// SECTION 13: JWT AUTHENTICATION MIDDLEWARE
// ---------------------------------------------------------------------------

function requireAuth(req, res, next) {
  (async () => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      const token = authHeader.substring(7);

      const decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'],
        clockTolerance: 30,
      });

      if (!decoded.jti) {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      const { rows } = await db.query(
        'SELECT * FROM sessions WHERE jti = $1 AND is_revoked = false AND expires_at > NOW()',
        [decoded.jti]
      );

      if (rows.length === 0) {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      req.user = decoded;
      next();
    } catch (err) {
      const errorId = generateErrorId();
      // eslint-disable-next-line no-console
      console.error(`[${req.requestId}] [Error:${errorId}] JWT validation failed:`, err.message);
      return res.status(401).json({ error: 'Authentication required.', errorId });
    }
  })();
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      const errorId = generateErrorId();
      // eslint-disable-next-line no-console
      console.error(`[${req.requestId}] [Error:${errorId}] Role denied: ${req.user.role} not in [${allowedRoles.join(',')}]. Email: ${req.user.email}`);
      return res.status(403).json({ error: 'Access denied.', errorId });
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// SECTION 14: EXPRESS APP CONFIGURATION
// ---------------------------------------------------------------------------

const app = express();

// (1) Trust proxy
app.set('trust proxy', 1);

// (2) Request ID
app.use((req, res, next) => {
  req.requestId = generateRequestId();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// (3) Helmet.js — comprehensive security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'"],
      imgSrc:     ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc:    ["'self'"],
      objectSrc:  ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  dnsPrefetchControl: { allow: false },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// (4) HTTPS redirect — production-only
if (IS_PRODUCTION) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    if (!req.secure) {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// (5) CORS whitelist
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (CORS_WHITELIST.includes(origin)) {
      return callback(null, true);
    }
    const errorId = generateErrorId();
    // eslint-disable-next-line no-console
    console.error(`[CORS] Blocked origin: ${origin} (errorId: ${errorId})`);
    callback(new Error(`CORS policy: origin not allowed. Error ID: ${errorId}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  credentials: false,
  maxAge: 86400,
};
app.use(cors(corsOptions));

app.use((err, req, res, next) => {
  if (err.message && err.message.startsWith('CORS policy')) {
    return res.status(403).json({ error: 'Request not allowed.' });
  }
  next(err);
});

// (6) Rate limiting

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress || 'unknown',
  handler: (req, res) => {
    const errorId = generateErrorId();
    // eslint-disable-next-line no-console
    console.error(`[RateLimit] General limit exceeded for IP: ${req.ip} (errorId: ${errorId})`);
    res.status(429).json({ error: 'Too many requests. Please try again later.', errorId });
  },
});
app.use(generalLimiter);

// Registration rate limiter
const registrationLimiter = rateLimit({
  windowMs: REG_LIMIT_WINDOW_MS,
  max: REG_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress || 'unknown',
  handler: (req, res) => {
    const errorId = generateErrorId();
    // eslint-disable-next-line no-console
    console.error(`[RateLimit] Registration limit exceeded for IP: ${req.ip} (errorId: ${errorId})`);
    res.status(429).json({ error: 'Registration limit reached. Please try again later.', errorId });
  },
});

// Stripe rate limiter (stricter)
const stripeLimiter = rateLimit({
  windowMs: STRIPE_LIMIT_WINDOW_MS,
  max: STRIPE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress || 'unknown',
  handler: (req, res) => {
    const errorId = generateErrorId();
    // eslint-disable-next-line no-console
    console.error(`[RateLimit] Stripe limit exceeded for IP: ${req.ip} (errorId: ${errorId})`);
    res.status(429).json({ error: 'Payment request limit reached. Please try again later.', errorId });
  },
});

// (7) Body parser — MUST have raw body for Stripe webhooks before JSON parser

// Stripe webhook needs raw body for signature verification
app.use('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }));

// Regular JSON parser for all other routes
app.use(express.json({
  limit: '100kb',
  strict: true,
}));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// (8) Custom input validation
const VALID_ROLES = ['homeowner', 'contractor'];

function validateRegistrationInput(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid request format.' };
  }

  const { email, role } = data;

  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required.' };
  }

  if (!validator.isEmail(email, { allow_utf8_local_part: false })) {
    return { valid: false, error: 'Invalid email format.' };
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (normalizedEmail.length > 254) {
    return { valid: false, error: 'Email address too long.' };
  }

  if (!role || typeof role !== 'string') {
    return { valid: false, error: 'Role is required.' };
  }

  if (!VALID_ROLES.includes(role.toLowerCase().trim())) {
    return { valid: false, error: 'Invalid role. Must be homeowner or contractor.' };
  }

  return {
    valid: true,
    email: normalizedEmail,
    role: role.toLowerCase().trim(),
  };
}

// (9) Morgan logging
app.use(morgan((tokens, req, res) => {
  return [
    `[${new Date().toISOString()}]`,
    `[${req.requestId || 'no-id'}]`,
    tokens.method(req, res),
    tokens.url(req, res),
    tokens.status(req, res),
    `- ${tokens['response-time'](req, res)}ms`,
    `- ${req.ip}`,
  ].join(' ');
}, {
  // eslint-disable-next-line no-console
  stream: { write: (msg) => console.log(msg.trim()) },
}));

// ---------------------------------------------------------------------------
// SECTION 15: HEALTH CHECK
// ---------------------------------------------------------------------------

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// SECTION 16: V3 API ROUTES
// ---------------------------------------------------------------------------
// Mount all v3 route modules under /api/
// ---------------------------------------------------------------------------

// Stripe routes — with stripe-specific rate limiting (webhook excluded by router)
app.use('/api/stripe', stripeLimiter, stripeRoutes);

// XPR Network blockchain routes
app.use('/api/xpr', xprRoutes);

// Project management routes
app.use('/api/projects', projectRoutes);

// Bid management routes
app.use('/api/bids', bidRoutes);

// Escrow workflow routes
app.use('/api/escrow', escrowRoutes);

// ---------------------------------------------------------------------------
// SECTION 17: V2 REGISTRATION ENDPOINTS
// ---------------------------------------------------------------------------

/**
 * POST /api/register — Step 1: Start registration
 */
app.post('/api/register', registrationLimiter, async (req, res) => {
  const requestId = req.requestId;

  try {
    const validation = validateRegistrationInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { email, role } = validation;

    const existingUser = await db.selectOne('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser) {
      return res.status(200).json({
        message: 'If this email is not registered, a verification code has been sent.',
      });
    }

    const pendingOtp = await db.selectOne(
      'SELECT * FROM otp_verifications WHERE email = $1 AND expires_at > NOW() AND is_used = false',
      [email]
    );
    if (pendingOtp) {
      return res.status(429).json({
        error: 'Verification code already sent. Please wait before requesting a new one.',
      });
    }

    const otp = generateOTP();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await db.query('DELETE FROM otp_verifications WHERE email = $1', [email]);
    await db.query(
      `INSERT INTO otp_verifications (email, otp_hash, role, attempts, expires_at)
       VALUES ($1, $2, $3, 0, $4)`,
      [email, otpHash, role, expiresAt]
    );

    await sendVerificationEmail(email, otp, requestId);

    // eslint-disable-next-line no-console
    console.log(`[${requestId}] OTP sent to ${email} (role: ${role})`);

    return res.status(200).json({
      message: 'If this email is not registered, a verification code has been sent.',
    });

  } catch (err) {
    const errorId = generateErrorId();
    // eslint-disable-next-line no-console
    console.error(`[${requestId}] [Error:${errorId}] Registration step 1 failed:`, err.message, err.stack);
    return sendError(res, 500, 'Registration failed. Please try again.', err, errorId);
  }
});

/**
 * POST /api/verify — Step 2: Verify OTP and create account
 */
app.post('/api/verify', registrationLimiter, async (req, res) => {
  const requestId = req.requestId;

  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request format.' });
    }

    const { email, otp } = req.body;

    if (!email || typeof email !== 'string' || !validator.isEmail(email, { allow_utf8_local_part: false })) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }
    const normalizedEmail = email.toLowerCase().trim();

    if (!otp || typeof otp !== 'string' || /^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'OTP must be a 6-digit code.' });
    }

    const pending = await db.selectOne(
      `SELECT * FROM otp_verifications
       WHERE email = $1 AND expires_at > NOW() AND is_used = false
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedEmail]
    );

    if (!pending) {
      return res.status(400).json({ error: 'No pending verification found for this email.' });
    }

    if (pending.attempts >= 5) {
      await db.query('UPDATE otp_verifications SET is_used = true WHERE id = $1', [pending.id]);
      return res.status(400).json({ error: 'Too many failed attempts. Please request a new verification code.' });
    }

    const otpHash = hashOtp(otp);
    const hashMatch = crypto.timingSafeEqual(
      Buffer.from(pending.otp_hash),
      Buffer.from(otpHash)
    );

    if (!hashMatch) {
      await db.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1', [pending.id]);
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    const role = pending.role;
    await db.query('UPDATE otp_verifications SET is_used = true WHERE id = $1', [pending.id]);

    const existingUser = await db.selectOne('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (existingUser) {
      return res.status(409).json({ error: 'This email is already registered.' });
    }

    const { publicKey, wifPrivateKey, accountName } = await generateXPRKeypair();

    const keyData = JSON.stringify({
      account: accountName,
      publicKey,
      wifPrivateKey,
      createdAt: new Date().toISOString(),
    });
    const encryptedKey = encrypt(keyData);

    let driveFileId;
    try {
      driveFileId = await uploadToDrive(accountName, encryptedKey, requestId);
    } catch (driveErr) {
      const errorId = generateErrorId();
      // eslint-disable-next-line no-console
      console.error(`[${requestId}] [Error:${errorId}] Drive upload failed:`, driveErr.message);
      return sendError(res, 500, 'Registration failed. Please try again.', driveErr, errorId);
    }

    try {
      const registry = await loadKeyRegistry(requestId);
      registry.accounts.push({
        email: normalizedEmail,
        account: accountName,
        publicKey,
        driveFileId,
        role,
        createdAt: new Date().toISOString(),
      });
      await saveKeyRegistry(registry, requestId);
    } catch (regErr) {
      const errorId = generateErrorId();
      // eslint-disable-next-line no-console
      console.error(`[${requestId}] [Error:${errorId}] Registry update failed:`, regErr.message);
    }

    const jti = generateRequestId();
    const tokenPayload = {
      email: normalizedEmail,
      role,
      account: accountName,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: JWT_EXPIRES_IN,
      jwtid: jti,
    });

    const sessionExpiry = new Date(Date.now() + parseJwtExpiryToMs(JWT_EXPIRES_IN));

    await db.transaction(async (client) => {
      const userResult = await client.query(
        `INSERT INTO users (email, role, xpr_account, xpr_public_key, google_drive_folder_id, encrypted_key_file_id, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [normalizedEmail, role, accountName, publicKey, null, driveFileId, true]
      );
      const newUser = userResult.rows[0];

      await client.query(
        `INSERT INTO sessions (user_id, jti, expires_at) VALUES ($1, $2, $3)`,
        [newUser.id, jti, sessionExpiry]
      );
    });

    // eslint-disable-next-line no-console
    console.log(`[${requestId}] User registered: ${normalizedEmail}, role: ${role}, account: ${accountName}`);

    return res.status(201).json({
      token,
      user: {
        email: normalizedEmail,
        role,
        account: accountName,
        publicKey,
      },
    });

  } catch (err) {
    const errorId = generateErrorId();
    // eslint-disable-next-line no-console
    console.error(`[${requestId}] [Error:${errorId}] Registration verification failed:`, err.message, err.stack);
    return sendError(res, 500, 'Registration failed. Please try again.', err, errorId);
  }
});

// ---------------------------------------------------------------------------
// SECTION 18: V2 LOGIN ENDPOINTS
// ---------------------------------------------------------------------------

/**
 * POST /api/login — Authenticate existing user
 */
app.post('/api/login', registrationLimiter, async (req, res) => {
  const requestId = req.requestId;

  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request format.' });
    }

    const { email } = req.body;

    if (!email || typeof email !== 'string' || !validator.isEmail(email, { allow_utf8_local_part: false })) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }
    const normalizedEmail = email.toLowerCase().trim();

    const user = await db.selectOne('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (!user) {
      return res.status(200).json({
        message: 'If this email is registered, a verification code has been sent.',
      });
    }

    const pendingOtp = await db.selectOne(
      'SELECT * FROM otp_verifications WHERE email = $1 AND expires_at > NOW() AND is_used = false',
      [normalizedEmail]
    );
    if (pendingOtp) {
      return res.status(429).json({
        error: 'Verification code already sent. Please wait before requesting a new one.',
      });
    }

    const otp = generateOTP();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await db.query('DELETE FROM otp_verifications WHERE email = $1', [normalizedEmail]);
    await db.query(
      `INSERT INTO otp_verifications (email, otp_hash, role, attempts, expires_at)
       VALUES ($1, $2, $3, 0, $4)`,
      [normalizedEmail, otpHash, user.role, expiresAt]
    );

    await sendVerificationEmail(normalizedEmail, otp, requestId);

    // eslint-disable-next-line no-console
    console.log(`[${requestId}] Login OTP sent to ${normalizedEmail}`);

    return res.status(200).json({
      message: 'If this email is registered, a verification code has been sent.',
    });

  } catch (err) {
    const errorId = generateErrorId();
    // eslint-disable-next-line no-console
    console.error(`[${requestId}] [Error:${errorId}] Login failed:`, err.message, err.stack);
    return sendError(res, 500, 'Login failed. Please try again.', err, errorId);
  }
});

/**
 * POST /api/login/verify — Verify login OTP
 */
app.post('/api/login/verify', registrationLimiter, async (req, res) => {
  const requestId = req.requestId;

  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request format.' });
    }

    const { email, otp } = req.body;

    if (!email || typeof email !== 'string' || !validator.isEmail(email, { allow_utf8_local_part: false })) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }
    const normalizedEmail = email.toLowerCase().trim();

    if (!otp || typeof otp !== 'string' || /^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'OTP must be a 6-digit code.' });
    }

    const pending = await db.selectOne(
      `SELECT * FROM otp_verifications
       WHERE email = $1 AND expires_at > NOW() AND is_used = false
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedEmail]
    );

    if (!pending) {
      return res.status(400).json({ error: 'No pending verification found for this email.' });
    }

    if (pending.attempts >= 5) {
      await db.query('UPDATE otp_verifications SET is_used = true WHERE id = $1', [pending.id]);
      return res.status(400).json({ error: 'Too many failed attempts. Please request a new verification code.' });
    }

    const otpHash = hashOtp(otp);
    const hashMatch = crypto.timingSafeEqual(
      Buffer.from(pending.otp_hash),
      Buffer.from(otpHash)
    );

    if (!hashMatch) {
      await db.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1', [pending.id]);
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    await db.query('UPDATE otp_verifications SET is_used = true WHERE id = $1', [pending.id]);

    const user = await db.selectOne('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    const jti = generateRequestId();
    const tokenPayload = {
      email: normalizedEmail,
      role: user.role,
      account: user.xpr_account,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: JWT_EXPIRES_IN,
      jwtid: jti,
    });

    const sessionExpiry = new Date(Date.now() + parseJwtExpiryToMs(JWT_EXPIRES_IN));
    await db.query(
      `INSERT INTO sessions (user_id, jti, expires_at) VALUES ($1, $2, $3)`,
      [user.id, jti, sessionExpiry]
    );

    // eslint-disable-next-line no-console
    console.log(`[${requestId}] User logged in: ${normalizedEmail}`);

    return res.status(200).json({
      token,
      user: {
        email: normalizedEmail,
        role: user.role,
        account: user.xpr_account,
        publicKey: user.xpr_public_key,
      },
    });

  } catch (err) {
    const errorId = generateErrorId();
    // eslint-disable-next-line no-console
    console.error(`[${requestId}] [Error:${errorId}] Login verification failed:`, err.message, err.stack);
    return sendError(res, 500, 'Login failed. Please try again.', err, errorId);
  }
});

// ---------------------------------------------------------------------------
// SECTION 19: V2 LOGOUT
// ---------------------------------------------------------------------------

app.post('/api/logout', requireAuth, async (req, res) => {
  const requestId = req.requestId;

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.substring(7);

    const decoded = jwt.decode(token);
    if (decoded && decoded.jti) {
      await db.query('UPDATE sessions SET is_revoked = true WHERE jti = $1', [decoded.jti]);
    }

    // eslint-disable-next-line no-console
    console.log(`[${requestId}] User logged out: ${req.user.email}`);

    return res.status(200).json({ message: 'Logged out successfully.' });

  } catch (err) {
    const errorId = generateErrorId();
    // eslint-disable-next-line no-console
    console.error(`[${requestId}] [Error:${errorId}] Logout failed:`, err.message);
    return sendError(res, 500, 'Logout failed. Please try again.', err, errorId);
  }
});

// ---------------------------------------------------------------------------
// SECTION 20: V2 USER INFO
// ---------------------------------------------------------------------------

app.get('/api/me', requireAuth, async (req, res) => {
  const requestId = req.requestId;

  try {
    const user = await db.selectOne('SELECT * FROM users WHERE email = $1', [req.user.email]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.status(200).json({
      email: user.email,
      role: user.role,
      account: user.xpr_account,
      publicKey: user.xpr_public_key,
      createdAt: user.created_at,
    });

  } catch (err) {
    const errorId = generateErrorId();
    // eslint-disable-next-line no-console
    console.error(`[${requestId}] [Error:${errorId}] Get user failed:`, err.message);
    return sendError(res, 500, 'Failed to retrieve user information.', err, errorId);
  }
});

// ---------------------------------------------------------------------------
// SECTION 21: V2 DASHBOARD ENDPOINTS (Protected + Role-based)
// ---------------------------------------------------------------------------

app.get('/api/contractor/dashboard', requireAuth, requireRole(['contractor']), (req, res) => {
  const requestId = req.requestId;

  try {
    return res.status(200).json({
      message: 'Welcome to the contractor dashboard.',
      account: req.user.account,
    });
  } catch (err) {
    const errorId = generateErrorId();
    // eslint-disable-next-line no-console
    console.error(`[${requestId}] [Error:${errorId}] Dashboard error:`, err.message);
    return sendError(res, 500, 'Failed to load dashboard.', err, errorId);
  }
});

app.get('/api/homeowner/dashboard', requireAuth, requireRole(['homeowner']), (req, res) => {
  const requestId = req.requestId;

  try {
    return res.status(200).json({
      message: 'Welcome to the homeowner dashboard.',
      account: req.user.account,
    });
  } catch (err) {
    const errorId = generateErrorId();
    // eslint-disable-next-line no-console
    console.error(`[${requestId}] [Error:${errorId}] Dashboard error:`, err.message);
    return sendError(res, 500, 'Failed to load dashboard.', err, errorId);
  }
});

// ---------------------------------------------------------------------------
// SECTION 22: OAUTH HELPER ENDPOINTS (DEVELOPMENT ONLY)
// ---------------------------------------------------------------------------

const oauthStates = new Map();

function cleanupOAuthStates() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [state, data] of oauthStates.entries()) {
    if (data.createdAt < cutoff) {
      oauthStates.delete(state);
    }
  }
}

if (!IS_PRODUCTION) {
  setInterval(cleanupOAuthStates, 5 * 60 * 1000);

  app.get('/dev/oauth/start', (req, res) => {
    const requestId = req.requestId;

    try {
      const state = crypto.randomBytes(32).toString('hex');
      oauthStates.set(state, { createdAt: Date.now() });

      const scopes = [
        'https://www.googleapis.com/auth/drive.appdata',
        'https://www.googleapis.com/auth/gmail.send',
      ];

      const authorizeUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: scopes,
        state,
      });

      // eslint-disable-next-line no-console
      console.log(`[${requestId}] OAuth flow started with state: ${state.substring(0, 8)}...`);

      res.redirect(authorizeUrl);

    } catch (err) {
      const errorId = generateErrorId();
      // eslint-disable-next-line no-console
      console.error(`[${requestId}] [Error:${errorId}] OAuth start failed:`, err.message);
      return sendError(res, 500, 'Failed to start OAuth flow.', err, errorId);
    }
  });

  app.get('/dev/oauth/callback', async (req, res) => {
    const requestId = req.requestId;

    try {
      const { code, state, error: googleError, error_description } = req.query;

      if (googleError) {
        const safeError = escapeHtml(String(googleError));
        const safeDesc = escapeHtml(String(error_description || 'No details provided.'));
        // eslint-disable-next-line no-console
        console.error(`[${requestId}] Google OAuth error: ${safeError} - ${safeDesc}`);
        return res.status(400).send(`<!DOCTYPE html>
<html><head><title>OAuth Error</title></head>
<body>
  <h1>Authorization Failed</h1>
  <p><strong>Error:</strong> ${safeError}</p>
  <p><strong>Description:</strong> ${safeDesc}</p>
  <p><a href="/dev/oauth/start">Try Again</a></p>
</body></html>`);
      }

      if (!state || !oauthStates.has(state)) {
        // eslint-disable-next-line no-console
        console.error(`[${requestId}] Invalid or expired state parameter.`);
        return res.status(400).send(`<!DOCTYPE html>
<html><head><title>Invalid State</title></head>
<body>
  <h1>Invalid or Expired State</h1>
  <p>The state parameter is missing or has expired. This may indicate a CSRF attack.</p>
  <p><a href="/dev/oauth/start">Start Over</a></p>
</body></html>`);
      }

      oauthStates.delete(state);

      if (!code || typeof code !== 'string') {
        return res.status(400).send(`<!DOCTYPE html>
<html><head><title>Missing Code</title></head>
<body>
  <h1>Missing Authorization Code</h1>
  <p>No authorization code was received from Google.</p>
  <p><a href="/dev/oauth/start">Try Again</a></p>
</body></html>`);
      }

      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        // eslint-disable-next-line no-console
        console.warn(`[${requestId}] No refresh_token returned.`);
        return res.status(400).send(`<!DOCTYPE html>
<html><head><title>Missing Refresh Token</title></head>
<body>
  <h1>No Refresh Token Received</h1>
  <p>Google did not return a refresh token.</p>
  <p><a href="/dev/oauth/start">Try Again</a></p>
</body></html>`);
      }

      // eslint-disable-next-line no-console
      console.log('============================================================');
      // eslint-disable-next-line no-console
      console.log('  GOOGLE REFRESH TOKEN (SAVE THIS IN .env):');
      // eslint-disable-next-line no-console
      console.log(`  ${tokens.refresh_token}`);
      // eslint-disable-next-line no-console
      console.log('============================================================');

      res.send(`<!DOCTYPE html>
<html><head><title>OAuth Success</title></head>
<body>
  <h1>Authorization Successful!</h1>
  <p>The refresh token has been printed to the <strong>server console</strong>.</p>
  <p>Copy it from the terminal and paste it into your <code>.env</code> file.</p>
  <p style="color: #d32f2f; font-weight: bold;">Never share this token or commit it to version control.</p>
</body></html>`);

    } catch (err) {
      const errorId = generateErrorId();
      // eslint-disable-next-line no-console
      console.error(`[${requestId}] [Error:${errorId}] OAuth callback failed:`, err.message, err.stack);
      res.status(500).send(`<!DOCTYPE html>
<html><head><title>OAuth Error</title></head>
<body>
  <h1>Authorization Failed</h1>
  <p>Failed to complete OAuth authorization.</p>
  <p><a href="/dev/oauth/start">Try Again</a></p>
</body></html>`);
    }
  });

} else {
  // Production: OAuth endpoints return 404
  app.get('/dev/oauth/start', (req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });
  app.get('/dev/oauth/callback', (req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });
}

// ---------------------------------------------------------------------------
// SECTION 23: GLOBAL ERROR HANDLER
// ---------------------------------------------------------------------------

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Global error handler
app.use((err, req, res, _next) => {
  const requestId = req.requestId || 'no-id';
  const errorId = generateErrorId();

  // eslint-disable-next-line no-console
  console.error(`[${requestId}] [Error:${errorId}] Unhandled error:`, err.message || 'Unknown error');
  // eslint-disable-next-line no-console
  console.error(`[${requestId}] [Error:${errorId}] Stack:`, err.stack || 'No stack trace');
  // eslint-disable-next-line no-console
  console.error(`[${requestId}] [Error:${errorId}] URL: ${req.method} ${req.url}`);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    error: 'An unexpected error occurred. Please try again later.',
    errorId,
  });
});

// ---------------------------------------------------------------------------
// SECTION 24: SERVER STARTUP
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Server] GCSC backend v3 started on port ${PORT} in ${NODE_ENV} mode.`);
  // eslint-disable-next-line no-console
  console.log(`[Server] Registered routes: /api/stripe, /api/xpr, /api/projects, /api/bids, /api/escrow`);
  // eslint-disable-next-line no-console
  console.log(`[Server] V2 endpoints preserved: /api/register, /api/verify, /api/login, /api/me`);

  // Async DB health check
  db.healthCheck().then((healthy) => {
    if (healthy) {
      // eslint-disable-next-line no-console
      console.log('[Server] Database connection: OK');
    } else {
      // eslint-disable-next-line no-console
      console.error('[Server] Database connection: FAILED');
    }
  });
});

module.exports = app;
