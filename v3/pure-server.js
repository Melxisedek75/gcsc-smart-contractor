/**
 * GCSC Pure Node.js Server — Zero External Dependencies
 * Uses only Node.js built-in modules
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parse } = require('url');

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'gcsc-dev-secret-256-bits-minimum-length';
const DB_FILE = path.join(__dirname, 'gcsc.db');
const USE_POSTGRES = !!process.env.DATABASE_URL;
let pgPool = null;

// Lightweight JSON persistence keeps real account/profile data between process restarts.
// A managed PostgreSQL database should replace this before real-money production.
const db = loadDatabase();
attachDbHelpers(db);
seedDefaultUsers();

// ===== UTILS =====
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  return hash === crypto.scryptSync(pw, salt, 64).toString('hex');
}
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function jwtSign(payload, exp = '7d') {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const seconds = typeof exp === 'string' ? parseDuration(exp) : exp;
  const body = base64Url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + seconds }));
  const sig = base64Url(crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest());
  return header + '.' + body + '.' + sig;
}
function jwtVerify(token) {
  const [h, b, s] = token.split('.');
  if (!h || !b || !s) throw new Error('Invalid token');
  const expSig = base64Url(crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + b).digest());
  if (s !== expSig) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(b.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Expired');
  return payload;
}
function base64Url(buf) {
  return Buffer.isBuffer(buf) ? buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    : Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function parseDuration(str) {
  const m = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  const match = String(str).match(/^(\d+)([smhdw])$/);
  return match ? parseInt(match[1]) * (m[match[2]] || 3600) : 3600;
}
function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}
function sendEmail(to, subject, html) {
  console.log(`\n>>> EMAIL TO: ${to} <<<`);
  console.log(`Subject: ${subject}`);
  console.log(`Code: ${html.match(/\d{6}/)?.[0] || 'N/A'}`);
  console.log(`>>> END EMAIL <<<\n`);
  return Promise.resolve(true);
}

function createEmptyDatabase() {
  return {
    users: [],
    sessions: [],
    otp_verifications: [],
    projects: [],
    bids: [],
    escrow_contracts: [],
    milestones: [],
    reviews: [],
  };
}

function attachDbHelpers(database) {
  database.nextId = (table) => {
    const rows = Array.isArray(database[table]) ? database[table] : [];
    return rows.length > 0 ? Math.max(...rows.map(r => Number(r.id) || 0)) + 1 : 1;
  };
}

function loadDatabase() {
  const database = createEmptyDatabase();
  if (!fs.existsSync(DB_FILE)) return database;

  try {
    const saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    for (const key of Object.keys(database)) {
      if (Array.isArray(saved[key])) database[key] = saved[key];
    }
  } catch (err) {
    console.error('[DB] Failed to load database, starting clean:', err.message);
  }
  return database;
}

function saveDatabase() {
  const plain = {};
  for (const key of Object.keys(createEmptyDatabase())) {
    plain[key] = Array.isArray(db[key]) ? db[key] : [];
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(plain, null, 2));
}

function getPgPool() {
  if (!USE_POSTGRES) return null;
  if (!pgPool) {
    const { Pool } = require('pg');
    const config = { connectionString: process.env.DATABASE_URL };
    if (process.env.PGSSL === 'true') {
      config.ssl = { rejectUnauthorized: false };
    }
    pgPool = new Pool(config);
  }
  return pgPool;
}

async function queryPostgres(text, params = []) {
  const pool = getPgPool();
  if (!pool) throw new Error('PostgreSQL is not configured');
  return pool.query(text, params);
}

async function initStorage() {
  if (!USE_POSTGRES) return;

  await queryPostgres(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('homeowner', 'contractor', 'admin')),
      full_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      profile JSONB NOT NULL DEFAULT '{}'::jsonb,
      wallet JSONB,
      is_verified BOOLEAN NOT NULL DEFAULT TRUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await queryPostgres(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT ''`);
  await queryPostgres(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT ''`);
  await queryPostgres(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await queryPostgres(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet JSONB`);
  await queryPostgres(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE`);
  await queryPostgres(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
  await queryPostgres(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email))`);
  await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)`);
}

function normalizeStoredUser(row) {
  if (!row) return null;
  return {
    ...row,
    full_name: row.full_name || row.name || row.email,
    phone: row.phone || '',
    profile: typeof row.profile === 'string' ? JSON.parse(row.profile || '{}') : (row.profile || defaultProfile(row.role)),
    wallet: typeof row.wallet === 'string' ? JSON.parse(row.wallet || 'null') : (row.wallet || null),
    is_verified: row.is_verified !== undefined ? row.is_verified : row.verified,
    is_active: row.is_active !== undefined ? row.is_active : true,
  };
}

async function findUserByEmail(email) {
  if (USE_POSTGRES) {
    const result = await queryPostgres(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    return normalizeStoredUser(result.rows[0]);
  }

  return db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase()) || null;
}

async function findUserById(id) {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    return normalizeStoredUser(result.rows[0]);
  }

  return db.users.find(u => u.id === Number(id)) || null;
}

async function createStoredUser(input) {
  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `INSERT INTO users (email, password_hash, role, full_name, phone, profile, wallet, is_verified, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE)
       RETURNING *`,
      [
        input.email,
        input.password_hash,
        input.role,
        input.full_name,
        input.phone || '',
        input.profile || defaultProfile(input.role),
        input.wallet || null,
      ]
    );
    return normalizeStoredUser(result.rows[0]);
  }

  const user = { id: db.nextId('users'), ...input };
  db.users.push(user);
  saveDatabase();
  return user;
}

async function updateStoredProfile(user, body) {
  updateProfileFromBody(user, body);

  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `UPDATE users SET profile = $3, full_name = $1, phone = $2, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [user.full_name, user.phone || '', user.profile, user.id]
    );
    return normalizeStoredUser(result.rows[0]);
  }

  saveDatabase();
  return user;
}

async function updateStoredWallet(user, wallet) {
  user.wallet = wallet;

  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `UPDATE users SET wallet = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [wallet, user.id]
    );
    return normalizeStoredUser(result.rows[0]);
  }

  saveDatabase();
  return user;
}

async function getUserCount() {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT COUNT(*)::int AS count FROM users');
    return result.rows[0]?.count || 0;
  }
  return db.users.length;
}

function seedDefaultUsers() {
  let changed = false;

  for (const user of db.users) {
    if (!user.profile) {
      user.profile = defaultProfile(user.role);
      changed = true;
    }
    if (!user.wallet) {
      user.wallet = null;
      changed = true;
    }
  }

  if (changed) saveDatabase();
}

function normalizeRole(role) {
  const value = String(role || '').toLowerCase().trim();
  if (value === 'builder' || value === 'contractor') return 'contractor';
  if (value === 'owner' || value === 'homeowner') return 'homeowner';
  return '';
}

function defaultProfile(role) {
  const normalizedRole = normalizeRole(role) || 'homeowner';
  return {
    accountType: normalizedRole,
    companyName: '',
    businessName: '',
    ein: '',
    licenseNumber: '',
    serviceArea: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    specialties: [],
    yearsInBusiness: '',
    website: '',
    bio: '',
    logoDataUrl: '',
    projectNeeds: '',
    propertyAddress: '',
    propertyType: '',
    budgetRange: '',
  };
}

function cleanString(value, maxLength = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanArray(value, maxItems = 12, maxLength = 48) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/,|\n/);
  return raw.map(item => cleanString(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function isValidLogoDataUrl(value) {
  if (!value) return true;
  if (String(value).length > 750000) return false;
  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(String(value));
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    fullName: user.full_name,
    phone: user.phone || '',
    is_verified: !!user.is_verified,
    profile: user.profile || defaultProfile(user.role),
    wallet: user.wallet || null,
    created_at: user.created_at,
  };
}

function createTokenForUser(user) {
  return jwtSign({ userId: user.id, email: user.email, role: user.role });
}

function updateProfileFromBody(user, body) {
  const profile = { ...defaultProfile(user.role), ...(user.profile || {}) };
  const allowedTextFields = [
    'companyName', 'businessName', 'ein', 'licenseNumber', 'serviceArea', 'address',
    'city', 'state', 'zip', 'yearsInBusiness', 'website', 'bio', 'projectNeeds',
    'propertyAddress', 'propertyType', 'budgetRange'
  ];

  if (body.fullName !== undefined || body.full_name !== undefined) {
    user.full_name = cleanString(body.fullName || body.full_name, 120);
  }
  if (body.phone !== undefined) user.phone = cleanString(body.phone, 40);

  for (const field of allowedTextFields) {
    if (body[field] !== undefined) profile[field] = cleanString(body[field], field === 'bio' ? 700 : 240);
  }

  if (body.specialties !== undefined) profile.specialties = cleanArray(body.specialties);
  if (body.logoDataUrl !== undefined) {
    if (!isValidLogoDataUrl(body.logoDataUrl)) {
      const err = new Error('Logo must be a PNG, JPG, WEBP, or GIF data URL under 750KB');
      err.status = 400;
      throw err;
    }
    profile.logoDataUrl = body.logoDataUrl || '';
  }

  profile.accountType = user.role;
  user.profile = profile;
  user.updated_at = new Date().toISOString();
}

// ===== CORS & AUTH HELPERS =====
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
function getUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try { return jwtVerify(token); } catch { return null; }
}

// ===== RESPONSE HELPERS =====
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ===== ROUTER =====
const routes = {
  // Dev helper: get latest OTP for testing
  'GET /api/dev/otp': async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const email = url.searchParams.get('email');
    if (!email) return json(res, 400, { error: 'Email required' });
    const record = db.otp_verifications.filter(o => o.email === email).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (!record) return json(res, 404, { error: 'No OTP found' });
    json(res, 200, { email, otp: record.otp, expires_at: record.expires_at });
  },

  // Health
  'GET /health': async (req, res) => {
    if (USE_POSTGRES) await queryPostgres('SELECT 1 AS ok');
    json(res, 200, { status: 'ok', version: '3.0.0', database: USE_POSTGRES ? 'postgres' : 'json-file', timestamp: new Date().toISOString(), uptime: process.uptime() });
  },
  
  // Stats
  'GET /api/stats': async (req, res) => {
    json(res, 200, { users: await getUserCount(), projects: db.projects.length, completed_escrows: db.escrow_contracts.filter(e => e.status === 'completed').length, platform: 'GCSC Smart Contractor v3.0' });
  },

  // Direct auth API used by the production dashboard
  'POST /api/auth/register': async (req, res) => {
    const body = await parseBody(req);
    const email = cleanString(body.email, 160).toLowerCase();
    const password = String(body.password || '');
    const role = normalizeRole(body.role);

    if (!email || !email.includes('@')) return json(res, 400, { error: 'Valid email required' });
    if (password.length < 8) return json(res, 400, { error: 'Password must be at least 8 characters' });
    if (!role) return json(res, 400, { error: 'Role must be homeowner/owner or contractor/builder' });
    if (await findUserByEmail(email)) return json(res, 409, { error: 'Email already registered' });

    const user = await createStoredUser({
      email,
      password_hash: hashPassword(password),
      role,
      full_name: cleanString(body.fullName || body.full_name || email.split('@')[0], 120),
      phone: cleanString(body.phone, 40),
      is_verified: 1,
      is_active: 1,
      profile: defaultProfile(role),
      wallet: null,
      created_at: new Date().toISOString(),
    });

    json(res, 201, { message: 'Registration successful', token: createTokenForUser(user), user: publicUser(user) });
  },

  'POST /api/auth/login': async (req, res) => {
    const body = await parseBody(req);
    const email = cleanString(body.email, 160).toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return json(res, 400, { error: 'Email and password required' });

    const user = await findUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return json(res, 401, { error: 'Invalid email or password' });
    }
    if (!user.is_active) return json(res, 403, { error: 'Account is inactive' });

    if (!user.profile) user.profile = defaultProfile(user.role);
    if (user.wallet === undefined) user.wallet = null;

    json(res, 200, { message: 'Login successful', token: createTokenForUser(user), user: publicUser(user) });
  },

  'GET /api/auth/profile': async (req, res) => {
    const auth = getUser(req);
    if (!auth) return json(res, 401, { error: 'Unauthorized' });
    const user = await findUserById(auth.userId);
    if (!user) return json(res, 404, { error: 'User not found' });
    if (!user.is_active) return json(res, 403, { error: 'Account is inactive' });
    json(res, 200, { user: publicUser(user) });
  },

  'PUT /api/auth/profile': async (req, res) => {
    const auth = getUser(req);
    if (!auth) return json(res, 401, { error: 'Unauthorized' });
    const user = await findUserById(auth.userId);
    if (!user) return json(res, 404, { error: 'User not found' });
    if (!user.is_active) return json(res, 403, { error: 'Account is inactive' });

    let updatedUser;
    try {
      updatedUser = await updateStoredProfile(user, await parseBody(req));
    } catch (err) {
      return json(res, err.status || 400, { error: err.message || 'Invalid profile data' });
    }

    json(res, 200, { message: 'Profile updated', user: publicUser(updatedUser) });
  },

  'POST /api/wallet/connect': async (req, res) => {
    const auth = getUser(req);
    if (!auth) return json(res, 401, { error: 'Unauthorized' });
    const user = await findUserById(auth.userId);
    if (!user) return json(res, 404, { error: 'User not found' });
    if (!user.is_active) return json(res, 403, { error: 'Account is inactive' });

    const body = await parseBody(req);
    const accountName = cleanString(body.accountName || body.account || body.actor, 12).toLowerCase();
    const permission = cleanString(body.permission || 'active', 12).toLowerCase();
    if (!/^[a-z1-5.]{1,12}$/.test(accountName)) return json(res, 400, { error: 'Valid XPR account name required' });
    if (!/^[a-z1-5]{1,12}$/.test(permission)) return json(res, 400, { error: 'Valid XPR permission required' });

    const wallet = {
      accountName,
      permission,
      publicKey: cleanString(body.publicKey || '', 80),
      walletType: cleanString(body.walletType || 'webauth', 40),
      connectedAt: new Date().toISOString(),
    };
    const updatedUser = await updateStoredWallet(user, wallet);

    json(res, 200, { message: 'Wallet connected', wallet: updatedUser.wallet, user: publicUser(updatedUser) });
  },

  'GET /api/wallet/me': async (req, res) => {
    const auth = getUser(req);
    if (!auth) return json(res, 401, { error: 'Unauthorized' });
    const user = await findUserById(auth.userId);
    if (!user) return json(res, 404, { error: 'User not found' });
    if (!user.is_active) return json(res, 403, { error: 'Account is inactive' });
    json(res, 200, { wallet: user.wallet || null });
  },

  // Register Step 1
  'POST /api/register': async (req, res) => {
    const body = await parseBody(req);
    if (!body.email || !body.email.includes('@')) return json(res, 400, { error: 'Valid email required' });
    if (!['homeowner', 'contractor'].includes(body.role)) return json(res, 400, { error: 'Role must be homeowner or contractor' });
    
    if (await findUserByEmail(body.email)) return json(res, 409, { error: 'Email already registered' });
    
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    db.otp_verifications.push({ id: db.nextId('otp_verifications'), email: body.email, otp, purpose: 'registration', expires_at: expiresAt.toISOString(), created_at: new Date().toISOString() });
    saveDatabase();
    
    await sendEmail(body.email, 'GCSC Registration OTP', `Your code: ${otp}`);
    json(res, 200, { message: 'OTP sent', email: body.email });
  },

  // Verify OTP & Complete Registration
  'POST /api/verify': async (req, res) => {
    const body = await parseBody(req);
    if (!body.email || !body.otp) return json(res, 400, { error: 'Email and OTP required' });
    
    const otpRecord = db.otp_verifications.find(o => o.email === body.email && o.otp === body.otp && o.purpose === 'registration' && new Date(o.expires_at) > new Date());
    if (!otpRecord) return json(res, 400, { error: 'Invalid or expired OTP' });
    
    const password = body.password || Math.random().toString(36).slice(-12);
    const role = normalizeRole(body.role) || 'homeowner';
    const createdUser = await createStoredUser({
      email: body.email,
      password_hash: hashPassword(password),
      role,
      full_name: body.full_name || body.email.split('@')[0],
      phone: body.phone || '',
      is_verified: 1,
      is_active: 1,
      profile: defaultProfile(role),
      wallet: null,
      created_at: new Date().toISOString()
    });
    
    db.otp_verifications = db.otp_verifications.filter(o => o.id !== otpRecord.id);
    saveDatabase();
    
    const token = createTokenForUser(createdUser);
    json(res, 200, { message: 'Registration successful', token, user: publicUser(createdUser) });
  },

  // Login Step 1
  'POST /api/login': async (req, res) => {
    const body = await parseBody(req);
    if (!body.email || !body.email.includes('@')) return json(res, 400, { error: 'Valid email required' });
    
    const user = await findUserByEmail(body.email);
    if (!user) return json(res, 404, { error: 'User not found' });
    if (!user.is_active) return json(res, 403, { error: 'Account is inactive' });
    
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    db.otp_verifications.push({ id: db.nextId('otp_verifications'), email: body.email, otp, purpose: 'login', expires_at: expiresAt.toISOString() });
    saveDatabase();
    
    await sendEmail(body.email, 'GCSC Login OTP', `Your code: ${otp}`);
    json(res, 200, { message: 'OTP sent', email: body.email });
  },

  // Verify Login
  'POST /api/login/verify': async (req, res) => {
    const body = await parseBody(req);
    if (!body.email || !body.otp) return json(res, 400, { error: 'Email and OTP required' });
    
    const otpRecord = db.otp_verifications.find(o => o.email === body.email && o.otp === body.otp && o.purpose === 'login' && new Date(o.expires_at) > new Date());
    if (!otpRecord) return json(res, 400, { error: 'Invalid or expired OTP' });
    
    const user = await findUserByEmail(body.email);
    if (!user) return json(res, 404, { error: 'User not found' });
    if (!user.is_active) return json(res, 403, { error: 'Account is inactive' });
    
    db.otp_verifications = db.otp_verifications.filter(o => o.id !== otpRecord.id);
    saveDatabase();
    
    const token = jwtSign({ userId: user.id, email: user.email, role: user.role });
    json(res, 200, { message: 'Login successful', token, user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name } });
  },

  // Get current user
  'GET /api/me': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    const u = await findUserById(user.userId);
    if (!u) return json(res, 404, { error: 'User not found' });
    json(res, 200, { user: publicUser(u) });
  },

  // Create project
  'POST /api/projects': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (user.role !== 'homeowner') return json(res, 403, { error: 'Homeowners only' });
    
    const body = await parseBody(req);
    if (!body.title || !body.description) return json(res, 400, { error: 'Title and description required' });
    
    const id = db.nextId('projects');
    db.projects.push({ id, homeowner_id: user.userId, title: body.title, description: body.description, category: body.category || 'general', budget_min: body.budget_min || 0, budget_max: body.budget_max || 0, location: body.location || '', timeline_days: body.timeline_days || 30, status: 'open', created_at: new Date().toISOString() });
    saveDatabase();
    
    json(res, 201, { message: 'Project created', project: db.projects.find(p => p.id === id) });
  },

  // List projects
  'GET /api/projects': async (req, res) => {
    const { status, category, location } = parse(req.url, true).query;
    let projects = db.projects;
    if (status) projects = projects.filter(p => p.status === status);
    if (category) projects = projects.filter(p => p.category === category);
    if (location) projects = projects.filter(p => p.location && p.location.includes(location));
    json(res, 200, { projects: projects.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) });
  },

  // Get single project
  'GET /api/projects/:id': async (req, res, params) => {
    const project = db.projects.find(p => p.id === parseInt(params.id));
    if (!project) return json(res, 404, { error: 'Project not found' });
    const bids = db.bids.filter(b => b.project_id === parseInt(params.id));
    json(res, 200, { project, bids });
  },

  // My projects
  'GET /api/projects/my/projects': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    let projects;
    if (user.role === 'homeowner') {
      projects = db.projects.filter(p => p.homeowner_id === user.userId);
    } else {
      const myBidProjectIds = db.bids.filter(b => b.contractor_id === user.userId).map(b => b.project_id);
      projects = db.projects.filter(p => myBidProjectIds.includes(p.id));
    }
    json(res, 200, { projects });
  },

  // Place bid
  'POST /api/bids': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (user.role !== 'contractor') return json(res, 403, { error: 'Contractors only' });
    
    const body = await parseBody(req);
    if (!body.project_id || !body.amount) return json(res, 400, { error: 'Project ID and amount required' });
    
    const id = db.nextId('bids');
    db.bids.push({ id, project_id: parseInt(body.project_id), contractor_id: user.userId, amount: parseInt(body.amount), proposed_timeline_days: body.proposed_timeline_days || 30, message: body.message || '', status: 'pending', created_at: new Date().toISOString() });
    saveDatabase();
    
    json(res, 201, { message: 'Bid placed', bid: db.bids.find(b => b.id === id) });
  },

  // Accept bid
  'POST /api/bids/:id/accept': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const bid = db.bids.find(b => b.id === parseInt(params.id));
    if (!bid) return json(res, 404, { error: 'Bid not found' });
    
    const project = db.projects.find(p => p.id === bid.project_id);
    if (!project || project.homeowner_id !== user.userId) return json(res, 403, { error: 'Not your project' });
    
    bid.status = 'accepted';
    db.bids.filter(b => b.project_id === bid.project_id && b.id !== bid.id).forEach(b => b.status = 'rejected');
    
    const escrowId = db.nextId('escrow_contracts');
    db.escrow_contracts.push({ id: escrowId, project_id: bid.project_id, homeowner_id: user.userId, contractor_id: bid.contractor_id, total_amount: bid.amount, status: 'pending', created_at: new Date().toISOString() });
    
    project.status = 'in_progress';
    project.escrow_id = escrowId;
    saveDatabase();
    
    json(res, 200, { message: 'Bid accepted, escrow created', escrow_id: escrowId });
  },

  // My bids
  'GET /api/bids/my/bids': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    const bids = db.bids.filter(b => b.contractor_id === user.userId);
    json(res, 200, { bids });
  },

  // Get escrow
  'GET /api/escrow/:id': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const escrow = db.escrow_contracts.find(e => e.id === parseInt(params.id) && (e.homeowner_id === user.userId || e.contractor_id === user.userId));
    if (!escrow) return json(res, 404, { error: 'Escrow not found' });
    
    const milestones = db.milestones.filter(m => m.escrow_id === escrow.id);
    json(res, 200, { escrow, milestones });
  },

  // My escrows
  'GET /api/escrow/my/escrows': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    const escrows = db.escrow_contracts.filter(e => e.homeowner_id === user.userId || e.contractor_id === user.userId);
    json(res, 200, { escrows });
  },
};

// ===== SERVER =====
const server = http.createServer(async (req, res) => {
  setCORS(res);
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = parse(req.url, true);
  const method = req.method;
  const pathname = parsed.pathname;
  
  // Match routes
  let matched = false;
  for (const [pattern, handler] of Object.entries(routes)) {
    const [pMethod, pPath] = pattern.split(' ');
    if (pMethod !== method) continue;
    
    // Simple path matching with :params
    const pathParts = pathname.split('/').filter(Boolean);
    const patternParts = pPath.split('/').filter(Boolean);
    
    if (pathParts.length !== patternParts.length) continue;
    
    const params = {};
    let match = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }
    
    if (match) {
      try {
        await handler(req, res, params);
      } catch (err) {
        console.error('[ERROR]', err);
        json(res, 500, { error: 'Internal server error' });
      }
      matched = true;
      break;
    }
  }
  
  if (!matched) {
    json(res, 404, { error: 'Not found', path: pathname });
  }
});

initStorage().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`╔══════════════════════════════════════════╗`);
    console.log(`║   GCSC Backend v3.0 — RUNNING            ║`);
    console.log(`║   Port: ${PORT}                            ║`);
    console.log(`║   Health: http://0.0.0.0:${PORT}/health      ║`);
    console.log(`║   JWT: custom (zero deps)                ║`);
    console.log(`║   DB: ${USE_POSTGRES ? 'postgres' : 'json-file'}                         ║`);
    console.log(`╚══════════════════════════════════════════╝`);
  });
}).catch((err) => {
  console.error('[STARTUP] Storage initialization failed:', err.message);
  process.exit(1);
});

module.exports = server;
