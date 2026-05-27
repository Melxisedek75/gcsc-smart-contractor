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
const XPR_TESTNET_CHAIN_ID = '71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd';
const XPR_TX_VERIFIER_ENABLED = process.env.XPR_TX_VERIFIER_ENABLED !== 'false';
const XPR_TX_VERIFIER_INTERVAL_MS = parseInt(process.env.XPR_TX_VERIFIER_INTERVAL_MS || '300000', 10);
const DEFAULT_XPR_TESTNET_HYPERION_URLS = [
  'https://api-xprnetwork-test.saltant.io',
  'https://testnet-api.xprdata.org',
  'https://testnet-api.xprcore.com',
];
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
    milestone_chain_txs: [],
    user_documents: [],
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

  await queryPostgres(`
    CREATE TABLE IF NOT EXISTS user_documents (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      file_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT '',
      file_data_url TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      file_sha256 TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
      review_note TEXT NOT NULL DEFAULT '',
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await queryPostgres(`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS file_data_url TEXT NOT NULL DEFAULT ''`);
  await queryPostgres(`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS file_size INTEGER NOT NULL DEFAULT 0`);
  await queryPostgres(`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS file_sha256 TEXT NOT NULL DEFAULT ''`);
  await queryPostgres(`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS review_note TEXT NOT NULL DEFAULT ''`);
  await queryPostgres(`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await queryPostgres(`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
  await queryPostgres(`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS reviewed_by INTEGER`);
  await queryPostgres(`ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await queryPostgres(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_documents_user_type ON user_documents (user_id, document_type)`);
  await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_user_documents_status ON user_documents (status)`);

  await queryPostgres(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      homeowner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      budget_min INTEGER NOT NULL DEFAULT 0,
      budget_max INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT '',
      timeline_days INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'open',
      escrow_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await queryPostgres(`
    CREATE TABLE IF NOT EXISTS bids (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      contractor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      proposed_timeline_days INTEGER NOT NULL DEFAULT 30,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await queryPostgres(`
    CREATE TABLE IF NOT EXISTS escrow_contracts (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      homeowner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contractor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await queryPostgres(`
    CREATE TABLE IF NOT EXISTS milestones (
      id SERIAL PRIMARY KEY,
      escrow_id INTEGER NOT NULL REFERENCES escrow_contracts(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      verified_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await queryPostgres(`
    CREATE TABLE IF NOT EXISTS milestone_chain_txs (
      id SERIAL PRIMARY KEY,
      milestone_id INTEGER NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      escrow_id INTEGER NOT NULL REFERENCES escrow_contracts(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('submitmilestone', 'approvemilestone', 'releasemilestone', 'disputemilestone')),
      tx_id TEXT UNIQUE NOT NULL,
      chain_id TEXT NOT NULL DEFAULT '',
      contract_account TEXT NOT NULL DEFAULT 'gcscrow1111',
      actor TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'broadcast',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      verified_at TIMESTAMPTZ,
      verification_error TEXT
    )
  `);

  await queryPostgres(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS escrow_id INTEGER`);
  await queryPostgres(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await queryPostgres(`ALTER TABLE bids ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await queryPostgres(`ALTER TABLE escrow_contracts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await queryPostgres(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await queryPostgres(`ALTER TABLE milestone_chain_txs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'broadcast'`);
  await queryPostgres(`ALTER TABLE milestone_chain_txs ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`);
  await queryPostgres(`ALTER TABLE milestone_chain_txs ADD COLUMN IF NOT EXISTS verification_error TEXT`);
  await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_projects_homeowner ON projects (homeowner_id)`);
  await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status)`);
  await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_bids_project ON bids (project_id)`);
  await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_bids_contractor ON bids (contractor_id)`);
  await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_escrow_homeowner ON escrow_contracts (homeowner_id)`);
  await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_escrow_contractor ON escrow_contracts (contractor_id)`);
  await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_milestones_escrow ON milestones (escrow_id)`);
  await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_milestone_chain_txs_milestone ON milestone_chain_txs (milestone_id)`);
  await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_milestone_chain_txs_escrow ON milestone_chain_txs (escrow_id)`);
  await queryPostgres(`CREATE INDEX IF NOT EXISTS idx_milestone_chain_txs_status ON milestone_chain_txs (status)`);
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

function normalizeDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    document_type: row.document_type,
    file_name: row.file_name || '',
    mime_type: row.mime_type || '',
    file_size: Number(row.file_size) || 0,
    file_sha256: row.file_sha256 || '',
    status: row.status || 'submitted',
    review_note: row.review_note || '',
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at || null,
    reviewed_by: row.reviewed_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listStoredUserDocuments(userId) {
  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `SELECT * FROM user_documents
       WHERE user_id = $1
       ORDER BY submitted_at DESC, id DESC`,
      [userId]
    );
    return result.rows.map(normalizeDocument);
  }

  return db.user_documents
    .filter((doc) => doc.user_id === Number(userId))
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map(normalizeDocument);
}

async function findStoredUserDocumentById(id) {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT * FROM user_documents WHERE id = $1 LIMIT 1', [id]);
    return normalizeDocument(result.rows[0]);
  }

  return normalizeDocument(db.user_documents.find((doc) => doc.id === Number(id)));
}

async function listStoredDocumentsForReview(status = '') {
  if (USE_POSTGRES) {
    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = 'WHERE status = $1';
    }
    const result = await queryPostgres(
      `SELECT * FROM user_documents ${where} ORDER BY submitted_at DESC, id DESC`,
      params
    );
    return result.rows.map(normalizeDocument);
  }

  return db.user_documents
    .filter((doc) => !status || doc.status === status)
    .sort((a, b) => Number(b.id) - Number(a.id))
    .map(normalizeDocument);
}

async function upsertStoredUserDocument(user, body) {
  const document = buildDocumentPayload(user, body);

  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `INSERT INTO user_documents
        (user_id, document_type, file_name, mime_type, file_data_url, file_size, file_sha256, status, review_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, document_type)
       DO UPDATE SET
        file_name = EXCLUDED.file_name,
        mime_type = EXCLUDED.mime_type,
        file_data_url = EXCLUDED.file_data_url,
        file_size = EXCLUDED.file_size,
        file_sha256 = EXCLUDED.file_sha256,
        status = EXCLUDED.status,
        review_note = EXCLUDED.review_note,
        submitted_at = NOW(),
        reviewed_at = NULL,
        reviewed_by = NULL,
        updated_at = NOW()
       RETURNING *`,
      [
        document.user_id,
        document.document_type,
        document.file_name,
        document.mime_type,
        document.file_data_url,
        document.file_size,
        document.file_sha256,
        document.status,
        document.review_note,
      ]
    );
    return normalizeDocument(result.rows[0]);
  }

  const existing = db.user_documents.find((doc) => doc.user_id === user.id && doc.document_type === document.document_type);
  if (existing) {
    Object.assign(existing, {
      ...document,
      id: existing.id,
      submitted_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      updated_at: new Date().toISOString(),
    });
    saveDatabase();
    return normalizeDocument(existing);
  }

  const stored = {
    id: db.nextId('user_documents'),
    ...document,
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.user_documents.push(stored);
  saveDatabase();
  return normalizeDocument(stored);
}

async function reviewStoredUserDocument(document, status, reviewNote, reviewedBy) {
  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `UPDATE user_documents SET status = $1, review_note = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, reviewNote, reviewedBy, document.id]
    );
    return normalizeDocument(result.rows[0]);
  }

  const stored = db.user_documents.find((doc) => doc.id === Number(document.id));
  if (!stored) return null;
  stored.status = status;
  stored.review_note = reviewNote;
  stored.reviewed_by = reviewedBy;
  stored.reviewed_at = new Date().toISOString();
  stored.updated_at = new Date().toISOString();
  saveDatabase();
  return normalizeDocument(stored);
}

async function getUserCount() {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT COUNT(*)::int AS count FROM users');
    return result.rows[0]?.count || 0;
  }
  return db.users.length;
}

function normalizeNumber(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeProject(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    homeowner_id: Number(row.homeowner_id),
    budget_min: normalizeNumber(row.budget_min),
    budget_max: normalizeNumber(row.budget_max),
    timeline_days: normalizeNumber(row.timeline_days, 30),
    escrow_id: row.escrow_id === null || row.escrow_id === undefined ? null : Number(row.escrow_id),
  };
}

function normalizeBid(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    project_id: Number(row.project_id),
    contractor_id: Number(row.contractor_id),
    amount: normalizeNumber(row.amount),
    proposed_timeline_days: normalizeNumber(row.proposed_timeline_days, 30),
  };
}

function normalizeEscrow(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    project_id: Number(row.project_id),
    homeowner_id: Number(row.homeowner_id),
    contractor_id: Number(row.contractor_id),
    total_amount: normalizeNumber(row.total_amount),
  };
}

function normalizeMilestone(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    escrow_id: Number(row.escrow_id),
    amount: normalizeNumber(row.amount),
    chain_txs: Array.isArray(row.chain_txs) ? row.chain_txs.map(normalizeChainTx) : [],
  };
}

function normalizeChainTx(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    milestone_id: Number(row.milestone_id),
    escrow_id: Number(row.escrow_id),
    created_by: row.created_by === null || row.created_by === undefined ? null : Number(row.created_by),
  };
}

function getXprHyperionUrls() {
  const configured = process.env.XPR_TESTNET_HYPERION_URLS || '';
  const urls = configured
    .split(',')
    .map(url => url.trim())
    .filter(Boolean);
  return urls.length ? urls : DEFAULT_XPR_TESTNET_HYPERION_URLS;
}

function normalizeEndpoint(url) {
  return String(url || '').replace(/\/+$/, '');
}

async function getProjectCount() {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT COUNT(*)::int AS count FROM projects');
    return result.rows[0]?.count || 0;
  }
  return db.projects.length;
}

async function getCompletedEscrowCount() {
  if (USE_POSTGRES) {
    const result = await queryPostgres("SELECT COUNT(*)::int AS count FROM escrow_contracts WHERE status = 'completed'");
    return result.rows[0]?.count || 0;
  }
  return db.escrow_contracts.filter(e => e.status === 'completed').length;
}

async function createStoredProject(homeownerId, body) {
  const project = {
    homeowner_id: homeownerId,
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim(),
    category: String(body.category || 'general').trim() || 'general',
    budget_min: normalizeNumber(body.budget_min),
    budget_max: normalizeNumber(body.budget_max),
    location: String(body.location || '').trim(),
    timeline_days: normalizeNumber(body.timeline_days, 30),
    status: 'open',
    created_at: new Date().toISOString(),
  };

  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `INSERT INTO projects (homeowner_id, title, description, category, budget_min, budget_max, location, timeline_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        project.homeowner_id,
        project.title,
        project.description,
        project.category,
        project.budget_min,
        project.budget_max,
        project.location,
        project.timeline_days,
      ]
    );
    return normalizeProject(result.rows[0]);
  }

  const stored = { id: db.nextId('projects'), ...project };
  db.projects.push(stored);
  saveDatabase();
  return stored;
}

async function listStoredProjects(filters = {}) {
  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `SELECT * FROM projects
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::text IS NULL OR category = $2)
         AND ($3::text IS NULL OR location ILIKE '%' || $3 || '%')
       ORDER BY created_at DESC`,
      [filters.status || null, filters.category || null, filters.location || null]
    );
    return result.rows.map(normalizeProject);
  }

  let projects = db.projects;
  if (filters.status) projects = projects.filter(p => p.status === filters.status);
  if (filters.category) projects = projects.filter(p => p.category === filters.category);
  if (filters.location) projects = projects.filter(p => p.location && p.location.includes(filters.location));
  return projects.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function findStoredProjectById(id) {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT * FROM projects WHERE id = $1 LIMIT 1', [id]);
    return normalizeProject(result.rows[0]);
  }
  return db.projects.find(p => p.id === Number(id)) || null;
}

async function listStoredProjectsForUser(user) {
  if (USE_POSTGRES) {
    if (user.role === 'homeowner') {
      const result = await queryPostgres('SELECT * FROM projects WHERE homeowner_id = $1 ORDER BY created_at DESC', [user.userId]);
      return result.rows.map(normalizeProject);
    }
    const result = await queryPostgres(
      `SELECT DISTINCT p.* FROM projects p
       JOIN bids b ON b.project_id = p.id
       WHERE b.contractor_id = $1
       ORDER BY p.created_at DESC`,
      [user.userId]
    );
    return result.rows.map(normalizeProject);
  }

  if (user.role === 'homeowner') return db.projects.filter(p => p.homeowner_id === user.userId);
  const myBidProjectIds = db.bids.filter(b => b.contractor_id === user.userId).map(b => b.project_id);
  return db.projects.filter(p => myBidProjectIds.includes(p.id));
}

async function createStoredBid(contractorId, body) {
  const bid = {
    project_id: normalizeNumber(body.project_id),
    contractor_id: contractorId,
    amount: normalizeNumber(body.amount),
    proposed_timeline_days: normalizeNumber(body.proposed_timeline_days, 30),
    message: String(body.message || '').trim(),
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `INSERT INTO bids (project_id, contractor_id, amount, proposed_timeline_days, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [bid.project_id, bid.contractor_id, bid.amount, bid.proposed_timeline_days, bid.message]
    );
    return normalizeBid(result.rows[0]);
  }

  const stored = { id: db.nextId('bids'), ...bid };
  db.bids.push(stored);
  saveDatabase();
  return stored;
}

async function findStoredBidById(id) {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT * FROM bids WHERE id = $1 LIMIT 1', [id]);
    return normalizeBid(result.rows[0]);
  }
  return db.bids.find(b => b.id === Number(id)) || null;
}

async function listStoredBidsByProject(projectId) {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT * FROM bids WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
    return result.rows.map(normalizeBid);
  }
  return db.bids.filter(b => b.project_id === Number(projectId));
}

async function listStoredBidsForContractor(contractorId) {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT * FROM bids WHERE contractor_id = $1 ORDER BY created_at DESC', [contractorId]);
    return result.rows.map(normalizeBid);
  }
  return db.bids.filter(b => b.contractor_id === contractorId);
}

function publicContractorProfile(user) {
  const profile = { ...defaultProfile(user.role), ...(user.profile || {}) };
  return {
    id: Number(user.id),
    full_name: user.full_name || '',
    companyName: profile.companyName || profile.businessName || '',
    serviceArea: profile.serviceArea || '',
    specialties: Array.isArray(profile.specialties) ? profile.specialties : [],
    yearsInBusiness: profile.yearsInBusiness || '',
    bio: profile.bio || '',
    logoDataUrl: profile.logoDataUrl || '',
  };
}

function publicDocumentOwner(user) {
  const profile = { ...defaultProfile(user.role), ...(user.profile || {}) };
  return {
    id: Number(user.id),
    email: user.email || '',
    role: user.role || '',
    full_name: user.full_name || '',
    companyName: profile.companyName || profile.businessName || '',
    businessName: profile.businessName || profile.companyName || '',
    serviceArea: profile.serviceArea || '',
    accountType: profile.accountType || user.role || '',
    logoDataUrl: profile.logoDataUrl || '',
  };
}

async function enrichDocumentWithUser(document) {
  const normalized = normalizeDocument(document);
  if (!normalized) return normalized;

  const user = await findUserById(normalized.user_id);
  return {
    ...normalized,
    user: user ? publicDocumentOwner(user) : null,
  };
}

async function enrichDocumentsWithUsers(documents) {
  return Promise.all((documents || []).map(enrichDocumentWithUser));
}

async function verificationForContractorId(contractorId) {
  const contractor = await findUserById(contractorId);
  if (!contractor) return { contractor: null, verification: null };

  const documents = await listStoredUserDocuments(contractor.id);
  return {
    contractor,
    verification: complianceForUser(contractor, documents),
  };
}

async function publicContractorDetails(contractorId) {
  const { contractor, verification } = await verificationForContractorId(contractorId);
  if (!contractor || contractor.role !== 'contractor') return null;

  return {
    contractor: publicContractorProfile(contractor),
    verification,
  };
}

async function enrichBidWithContractor(bid) {
  const normalized = normalizeBid(bid);
  if (!normalized) return normalized;

  const contractor = await findUserById(normalized.contractor_id);
  if (!contractor) {
    return {
      ...normalized,
      contractor: null,
      contractor_verification: null,
    };
  }

  const documents = await listStoredUserDocuments(contractor.id);
  return {
    ...normalized,
    contractor: publicContractorProfile(contractor),
    contractor_verification: complianceForUser(contractor, documents),
  };
}

async function enrichBidsWithContractors(bids) {
  return Promise.all((bids || []).map(enrichBidWithContractor));
}

async function acceptStoredBid(bid, project, homeownerId) {
  if (USE_POSTGRES) {
    const accepted = await queryPostgres(
      `UPDATE bids SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      ['accepted', bid.id]
    );
    await queryPostgres(
      `UPDATE bids SET status = 'rejected', updated_at = NOW()
       WHERE project_id = $1 AND id <> $2`,
      [bid.project_id, bid.id]
    );
    const escrow = await queryPostgres(
      `INSERT INTO escrow_contracts (project_id, homeowner_id, contractor_id, total_amount)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [bid.project_id, homeownerId, bid.contractor_id, bid.amount]
    );
    await queryPostgres(
      `UPDATE projects SET status = $1, escrow_id = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      ['in_progress', escrow.rows[0].id, project.id]
    );
    return { bid: normalizeBid(accepted.rows[0]), escrow: normalizeEscrow(escrow.rows[0]) };
  }

  bid.status = 'accepted';
  db.bids.filter(b => b.project_id === bid.project_id && b.id !== bid.id).forEach(b => b.status = 'rejected');
  const escrowId = db.nextId('escrow_contracts');
  const escrow = {
    id: escrowId,
    project_id: bid.project_id,
    homeowner_id: homeownerId,
    contractor_id: bid.contractor_id,
    total_amount: bid.amount,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  db.escrow_contracts.push(escrow);
  project.status = 'in_progress';
  project.escrow_id = escrowId;
  saveDatabase();
  return { bid, escrow };
}

async function findStoredEscrowById(id) {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT * FROM escrow_contracts WHERE id = $1 LIMIT 1', [id]);
    return normalizeEscrow(result.rows[0]);
  }
  return db.escrow_contracts.find(e => e.id === Number(id)) || null;
}

async function listStoredEscrowsForUser(userId) {
  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `SELECT * FROM escrow_contracts
       WHERE homeowner_id = $1 OR contractor_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map(normalizeEscrow);
  }
  return db.escrow_contracts.filter(e => e.homeowner_id === userId || e.contractor_id === userId);
}

async function listStoredMilestonesByEscrow(escrowId) {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT * FROM milestones WHERE escrow_id = $1 ORDER BY id ASC', [escrowId]);
    return attachChainTxsToMilestones(result.rows.map(normalizeMilestone));
  }
  return attachChainTxsToMilestones(db.milestones.filter(m => m.escrow_id === escrowId).map(normalizeMilestone));
}

async function listStoredChainTxsByMilestoneIds(milestoneIds) {
  const ids = milestoneIds.map(Number).filter(Boolean);
  if (ids.length === 0) return [];

  if (USE_POSTGRES) {
    const result = await queryPostgres(
      'SELECT * FROM milestone_chain_txs WHERE milestone_id = ANY($1::int[]) ORDER BY created_at DESC, id DESC',
      [ids]
    );
    return result.rows.map(normalizeChainTx);
  }

  return db.milestone_chain_txs
    .filter(tx => ids.includes(Number(tx.milestone_id)))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0) || Number(b.id) - Number(a.id))
    .map(normalizeChainTx);
}

async function findStoredChainTxByTxId(txId) {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT * FROM milestone_chain_txs WHERE tx_id = $1 LIMIT 1', [txId]);
    return normalizeChainTx(result.rows[0]);
  }
  return normalizeChainTx(db.milestone_chain_txs.find(tx => tx.tx_id === txId));
}

async function listStoredBroadcastChainTxs(limit = 10) {
  if (USE_POSTGRES) {
    const result = await queryPostgres(
      "SELECT * FROM milestone_chain_txs WHERE status = 'broadcast' ORDER BY created_at ASC LIMIT $1",
      [limit]
    );
    return result.rows.map(normalizeChainTx);
  }
  return db.milestone_chain_txs
    .filter(tx => tx.status === 'broadcast')
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    .slice(0, limit)
    .map(normalizeChainTx);
}

async function updateStoredChainTxVerification(txId, status, verificationError = '') {
  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `UPDATE milestone_chain_txs SET status = $1, verification_error = $2, verified_at = NOW()
       WHERE tx_id = $3
       RETURNING *`,
      [status, verificationError || null, txId]
    );
    return normalizeChainTx(result.rows[0]);
  }

  const tx = db.milestone_chain_txs.find(item => item.tx_id === txId);
  if (!tx) return null;
  tx.status = status;
  tx.verification_error = verificationError || null;
  tx.verified_at = new Date().toISOString();
  saveDatabase();
  return normalizeChainTx(tx);
}

async function attachChainTxsToMilestones(milestones) {
  const normalized = milestones.map(normalizeMilestone).filter(Boolean);
  const txs = await listStoredChainTxsByMilestoneIds(normalized.map(m => m.id));
  const byMilestone = new Map();
  for (const tx of txs) {
    const list = byMilestone.get(tx.milestone_id) || [];
    list.push(tx);
    byMilestone.set(tx.milestone_id, list);
  }
  return normalized.map(milestone => ({
    ...milestone,
    chain_txs: byMilestone.get(milestone.id) || [],
  }));
}

const CHAIN_TX_ACTIONS = new Set(['submitmilestone', 'approvemilestone', 'releasemilestone', 'disputemilestone']);

function canUserRecordChainTx(action, escrow, userId) {
  if (action === 'submitmilestone') return escrow.contractor_id === userId;
  if (action === 'approvemilestone') return escrow.homeowner_id === userId;
  if (action === 'releasemilestone') return escrow.homeowner_id === userId;
  if (action === 'disputemilestone') return escrow.homeowner_id === userId || escrow.contractor_id === userId;
  return false;
}

async function createStoredMilestoneChainTx(milestone, escrow, userId, body) {
  const action = String(body.action || '').trim();
  const txId = String(body.tx_id || body.txId || '').trim();
  const chainId = String(body.chain_id || body.chainId || '').trim();
  const contractAccount = String(body.contract_account || body.contractAccount || 'gcscrow1111').trim();
  const actor = String(body.actor || '').trim();
  const status = String(body.status || 'broadcast').trim();

  if (!CHAIN_TX_ACTIONS.has(action)) {
    throw Object.assign(new Error('Invalid chain action'), { status: 400 });
  }
  if (!txId || txId.length < 16 || txId.length > 128) {
    throw Object.assign(new Error('Valid transaction id required'), { status: 400 });
  }
  if (contractAccount !== 'gcscrow1111') {
    throw Object.assign(new Error('Invalid escrow contract account'), { status: 400 });
  }
  if (!canUserRecordChainTx(action, escrow, userId)) {
    throw Object.assign(new Error('Escrow role cannot record this chain action'), { status: 403 });
  }

  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `INSERT INTO milestone_chain_txs
        (milestone_id, escrow_id, action, tx_id, chain_id, contract_account, actor, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tx_id) DO UPDATE SET
        milestone_id = EXCLUDED.milestone_id,
        escrow_id = EXCLUDED.escrow_id,
        action = EXCLUDED.action,
        chain_id = EXCLUDED.chain_id,
        contract_account = EXCLUDED.contract_account,
        actor = EXCLUDED.actor,
        status = EXCLUDED.status,
        created_by = EXCLUDED.created_by
       RETURNING *`,
      [milestone.id, escrow.id, action, txId, chainId, contractAccount, actor, status, userId]
    );
    return normalizeChainTx(result.rows[0]);
  }

  let chainTx = db.milestone_chain_txs.find(tx => tx.tx_id === txId);
  if (chainTx) {
    Object.assign(chainTx, {
      milestone_id: milestone.id,
      escrow_id: escrow.id,
      action,
      chain_id: chainId,
      contract_account: contractAccount,
      actor,
      status,
      created_by: userId,
    });
  } else {
    chainTx = {
      id: db.nextId('milestone_chain_txs'),
      milestone_id: milestone.id,
      escrow_id: escrow.id,
      action,
      tx_id: txId,
      chain_id: chainId,
      contract_account: contractAccount,
      actor,
      status,
      created_by: userId,
      created_at: new Date().toISOString(),
    };
    db.milestone_chain_txs.push(chainTx);
  }
  saveDatabase();
  return normalizeChainTx(chainTx);
}

function getActionAct(action) {
  return action?.act || action?.action_trace?.act || action?.trace?.act || action;
}

function hyperionTransactionHasExpectedAction(payload, chainTx) {
  const actions = Array.isArray(payload?.actions) ? payload.actions : [];
  return actions.some(action => {
    const act = getActionAct(action);
    return act?.account === chainTx.contract_account && act?.name === chainTx.action;
  });
}

async function fetchHyperionTransaction(endpoint, txId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `${normalizeEndpoint(endpoint)}/v2/history/get_transaction?id=${encodeURIComponent(txId)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 404) return { found: false, error: 'transaction not found' };
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { found: false, error: payload?.message || payload?.error || `hyperion ${response.status}` };
    }
    return { found: true, payload };
  } catch (err) {
    return { found: false, error: err.name === 'AbortError' ? 'hyperion timeout' : (err.message || 'hyperion request failed') };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyStoredChainTx(chainTx) {
  let lastError = '';
  for (const endpoint of getXprHyperionUrls()) {
    const result = await fetchHyperionTransaction(endpoint, chainTx.tx_id);
    if (!result.found) {
      lastError = result.error || 'transaction not found';
      continue;
    }

    if (hyperionTransactionHasExpectedAction(result.payload, chainTx)) {
      return updateStoredChainTxVerification(chainTx.tx_id, 'confirmed', '');
    }

    return updateStoredChainTxVerification(
      chainTx.tx_id,
      'failed',
      `transaction does not include ${chainTx.contract_account}::${chainTx.action}`
    );
  }

  return updateStoredChainTxVerification(chainTx.tx_id, 'failed', lastError || 'transaction not found on XPR testnet');
}

async function verifyBroadcastChainTxs() {
  const txs = await listStoredBroadcastChainTxs(10);
  for (const tx of txs) {
    try {
      await verifyStoredChainTx(tx);
    } catch (err) {
      console.error('[CHAIN_TX_VERIFY]', err.message || err);
    }
  }
}

function startChainTxVerifier() {
  if (!XPR_TX_VERIFIER_ENABLED) return;
  if (!Number.isFinite(XPR_TX_VERIFIER_INTERVAL_MS) || XPR_TX_VERIFIER_INTERVAL_MS < 30000) return;

  const timer = setInterval(() => {
    verifyBroadcastChainTxs().catch(err => console.error('[CHAIN_TX_VERIFY]', err.message || err));
  }, XPR_TX_VERIFIER_INTERVAL_MS);

  if (typeof timer.unref === 'function') timer.unref();
}

async function getMilestoneAmountTotal(escrowId) {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT COALESCE(SUM(amount), 0)::int AS total FROM milestones WHERE escrow_id = $1', [escrowId]);
    return normalizeNumber(result.rows[0]?.total);
  }
  return db.milestones
    .filter(m => m.escrow_id === Number(escrowId))
    .reduce((sum, milestone) => sum + normalizeNumber(milestone.amount), 0);
}

async function getReleasedMilestoneAmountTotal(escrowId) {
  if (USE_POSTGRES) {
    const result = await queryPostgres(
      "SELECT COALESCE(SUM(amount), 0)::int AS total FROM milestones WHERE escrow_id = $1 AND status = 'released'",
      [escrowId]
    );
    return normalizeNumber(result.rows[0]?.total);
  }
  return db.milestones
    .filter(m => m.escrow_id === Number(escrowId) && m.status === 'released')
    .reduce((sum, milestone) => sum + normalizeNumber(milestone.amount), 0);
}

async function createStoredMilestone(escrow, body) {
  const amount = normalizeNumber(body.amount);
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const currentTotal = await getMilestoneAmountTotal(escrow.id);

  if (!title) throw Object.assign(new Error('Milestone title required'), { status: 400 });
  if (amount <= 0) throw Object.assign(new Error('Milestone amount must be greater than 0'), { status: 400 });
  if (currentTotal + amount > escrow.total_amount) {
    throw Object.assign(new Error('Milestone total cannot exceed escrow amount'), { status: 400 });
  }

  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `INSERT INTO milestones (escrow_id, title, description, amount, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [escrow.id, title, description, amount, 'pending']
    );
    return normalizeMilestone(result.rows[0]);
  }

  const milestone = {
    id: db.nextId('milestones'),
    escrow_id: escrow.id,
    title,
    description,
    amount,
    status: 'pending',
    verified_by: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.milestones.push(milestone);
  saveDatabase();
  return milestone;
}

async function findStoredMilestoneById(id) {
  if (USE_POSTGRES) {
    const result = await queryPostgres('SELECT * FROM milestones WHERE id = $1 LIMIT 1', [id]);
    return normalizeMilestone(result.rows[0]);
  }
  return db.milestones.find(m => m.id === Number(id)) || null;
}

async function updateStoredMilestoneStatus(milestone, status, verifiedBy = '') {
  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `UPDATE milestones SET status = $1, verified_by = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, verifiedBy, milestone.id]
    );
    return normalizeMilestone(result.rows[0]);
  }

  milestone.status = status;
  milestone.verified_by = verifiedBy;
  milestone.updated_at = new Date().toISOString();
  saveDatabase();
  return milestone;
}

async function updateStoredEscrowStatus(escrow, status) {
  if (USE_POSTGRES) {
    const result = await queryPostgres(
      `UPDATE escrow_contracts SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, escrow.id]
    );
    return normalizeEscrow(result.rows[0]);
  }

  escrow.status = status;
  escrow.updated_at = new Date().toISOString();
  saveDatabase();
  return escrow;
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

const DOCUMENT_TYPES = {
  contractor_license: 'Contractor license',
  insurance_certificate: 'Insurance certificate',
  business_ein: 'Business / EIN document',
};

const REQUIRED_CONTRACTOR_DOCUMENTS = ['contractor_license', 'insurance_certificate', 'business_ein'];
const ALLOWED_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

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

function getDocumentType(value) {
  const documentType = cleanString(value, 80);
  return DOCUMENT_TYPES[documentType] ? documentType : '';
}

function getRequiredDocumentTypes(role) {
  return role === 'contractor' ? REQUIRED_CONTRACTOR_DOCUMENTS : [];
}

function parseDataUrl(value) {
  const input = String(value || '');
  const match = input.match(/^data:([a-z0-9.+/-]+);base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase(),
    payload: match[2],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function buildDocumentPayload(user, body) {
  if (user.role !== 'contractor') {
    const err = new Error('Contractor account required for verification documents');
    err.status = 403;
    throw err;
  }

  const documentType = getDocumentType(body.documentType || body.document_type);
  if (!documentType) {
    const err = new Error('Invalid document type');
    err.status = 400;
    throw err;
  }

  const fileName = cleanString(body.fileName || body.file_name, 180);
  const fileDataUrl = String(body.fileDataUrl || body.file_data_url || '');
  const parsed = parseDataUrl(fileDataUrl);
  const requestedMimeType = cleanString(body.mimeType || body.mime_type, 80).toLowerCase();
  const mimeType = parsed?.mimeType || requestedMimeType;

  if (!fileName) {
    const err = new Error('File name required');
    err.status = 400;
    throw err;
  }
  if (!parsed || !ALLOWED_DOCUMENT_MIME_TYPES.includes(mimeType)) {
    const err = new Error('Document must be a PDF, PNG, JPG, or WEBP data URL');
    err.status = 400;
    throw err;
  }
  if (parsed.buffer.length > 1500000) {
    const err = new Error('Document file is too large. Use a file under 1.5MB');
    err.status = 400;
    throw err;
  }

  return {
    user_id: user.id,
    document_type: documentType,
    file_name: fileName,
    mime_type: mimeType,
    file_data_url: fileDataUrl,
    file_size: parsed.buffer.length,
    file_sha256: crypto.createHash('sha256').update(parsed.buffer).digest('hex'),
    status: 'submitted',
    review_note: cleanString(body.reviewNote || body.review_note, 300),
  };
}

function requiredDocumentsWithStatus(role, documents) {
  const byType = new Map(documents.map((doc) => [doc.document_type, doc]));
  return getRequiredDocumentTypes(role).map((documentType) => {
    const document = byType.get(documentType);
    return {
      document_type: documentType,
      label: DOCUMENT_TYPES[documentType],
      status: document?.status || 'missing',
      document: document || null,
    };
  });
}

function complianceForUser(user, documents) {
  const profile_completion = profileCompletionForUser(user);
  const required_documents = requiredDocumentsWithStatus(user.role, documents);
  const hasRejected = required_documents.some((item) => item.status === 'rejected');
  const documents_submitted = required_documents.length === 0 || required_documents.every((item) => item.status !== 'missing');
  const documents_approved = required_documents.length === 0 || required_documents.every((item) => item.status === 'approved');
  const wallet_connected = !!user.wallet?.accountName;
  let overall_status = 'verified';

  if (!profile_completion.completed) overall_status = 'profile_incomplete';
  else if (hasRejected) overall_status = 'rejected';
  else if (!documents_submitted) overall_status = 'documents_missing';
  else if (!documents_approved) overall_status = 'pending_review';
  else if (!wallet_connected) overall_status = 'wallet_missing';

  return {
    overall_status,
    profile_completion,
    required_documents,
    documents_submitted,
    documents_approved,
    wallet_connected,
    ready_for_bids: overall_status === 'verified',
    checklist: [
      { key: 'profile', label: 'Profile 100%', completed: profile_completion.completed },
      ...required_documents.map((item) => ({
        key: item.document_type,
        label: `${item.label} submitted`,
        completed: item.status === 'submitted' || item.status === 'approved',
        status: item.status,
      })),
      { key: 'wallet', label: 'WebAuth wallet connected', completed: wallet_connected },
    ],
  };
}

function hasProfileValue(user, profile, field) {
  if (field === 'fullName') return !!cleanString(user.full_name, 120);
  if (field === 'phone') return !!cleanString(user.phone, 40);
  if (field === 'specialties') return Array.isArray(profile.specialties) && profile.specialties.length > 0;
  return !!cleanString(profile[field], 240);
}

function profileCompletionForUser(user) {
  const profile = { ...defaultProfile(user.role), ...(user.profile || {}) };
  const required = user.role === 'contractor'
    ? ['fullName', 'phone', 'companyName', 'ein', 'licenseNumber', 'serviceArea', 'specialties']
    : ['fullName', 'phone', 'propertyAddress', 'propertyType', 'budgetRange', 'projectNeeds', 'city', 'state'];
  const missing = required.filter((field) => !hasProfileValue(user, profile, field));
  const completedCount = required.length - missing.length;
  const percent = required.length === 0 ? 100 : Math.round((completedCount / required.length) * 100);

  return {
    percent,
    completed: missing.length === 0,
    missing,
    required,
  };
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
    profile_completion: profileCompletionForUser(user),
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
  profile.updatedAt = new Date().toISOString();
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
    json(res, 200, { users: await getUserCount(), projects: await getProjectCount(), completed_escrows: await getCompletedEscrowCount(), platform: 'GCSC Smart Contractor v3.0' });
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

  'GET /api/auth/documents': async (req, res) => {
    const auth = getUser(req);
    if (!auth) return json(res, 401, { error: 'Unauthorized' });
    const user = await findUserById(auth.userId);
    if (!user) return json(res, 404, { error: 'User not found' });
    if (!user.is_active) return json(res, 403, { error: 'Account is inactive' });

    const documents = await listStoredUserDocuments(user.id);
    json(res, 200, {
      documents,
      required_documents: requiredDocumentsWithStatus(user.role, documents),
    });
  },

  'POST /api/auth/documents': async (req, res) => {
    const auth = getUser(req);
    if (!auth) return json(res, 401, { error: 'Unauthorized' });
    const user = await findUserById(auth.userId);
    if (!user) return json(res, 404, { error: 'User not found' });
    if (!user.is_active) return json(res, 403, { error: 'Account is inactive' });

    try {
      const document = await upsertStoredUserDocument(user, await parseBody(req));
      const documents = await listStoredUserDocuments(user.id);
      json(res, 201, {
        message: 'Document submitted for review',
        document,
        compliance: complianceForUser(user, documents),
      });
    } catch (err) {
      json(res, err.status || 400, { error: err.message || 'Could not submit document' });
    }
  },

  'GET /api/auth/compliance': async (req, res) => {
    const auth = getUser(req);
    if (!auth) return json(res, 401, { error: 'Unauthorized' });
    const user = await findUserById(auth.userId);
    if (!user) return json(res, 404, { error: 'User not found' });
    if (!user.is_active) return json(res, 403, { error: 'Account is inactive' });

    const documents = await listStoredUserDocuments(user.id);
    json(res, 200, {
      ...complianceForUser(user, documents),
      documents,
    });
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

  'GET /api/admin/documents': async (req, res) => {
    const auth = getUser(req);
    if (!auth) return json(res, 401, { error: 'Unauthorized' });
    if (auth.role !== 'admin') return json(res, 403, { error: 'Admin only' });

    const parsed = parse(req.url, true);
    const status = cleanString(parsed.query.status || '', 40);
    const documents = await listStoredDocumentsForReview(status);
    const enrichedDocuments = await enrichDocumentsWithUsers(documents);
    json(res, 200, { documents: enrichedDocuments });
  },

  'PUT /api/admin/documents/:id/review': async (req, res, params) => {
    const auth = getUser(req);
    if (!auth) return json(res, 401, { error: 'Unauthorized' });
    if (auth.role !== 'admin') return json(res, 403, { error: 'Admin only' });

    const document = await findStoredUserDocumentById(parseInt(params.id));
    if (!document) return json(res, 404, { error: 'Document not found' });

    const body = await parseBody(req);
    const status = cleanString(body.status, 40);
    if (status !== 'approved' && status !== 'rejected') {
      return json(res, 400, { error: 'Review status must be approved or rejected' });
    }

    const reviewed = await reviewStoredUserDocument(
      document,
      status,
      cleanString(body.reviewNote || body.review_note, 300),
      auth.userId || null
    );
    const enrichedDocument = await enrichDocumentWithUser(reviewed);
    json(res, 200, { message: 'Document review saved', document: enrichedDocument });
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
    const project = await createStoredProject(user.userId, body);
    json(res, 201, { message: 'Project created', project });
  },

  // List projects
  'GET /api/projects': async (req, res) => {
    const { status, category, location } = parse(req.url, true).query;
    const projects = await listStoredProjects({ status, category, location });
    json(res, 200, { projects });
  },

  // Get single project
  'GET /api/projects/:id': async (req, res, params) => {
    const project = await findStoredProjectById(parseInt(params.id));
    if (!project) return json(res, 404, { error: 'Project not found' });
    const bids = await enrichBidsWithContractors(await listStoredBidsByProject(parseInt(params.id)));
    json(res, 200, { project, bids });
  },

  'GET /api/contractors/:id/public': async (req, res, params) => {
    const details = await publicContractorDetails(parseInt(params.id));
    if (!details) return json(res, 404, { error: 'Contractor profile not found' });
    json(res, 200, details);
  },

  // My projects
  'GET /api/projects/my/projects': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    const projects = await listStoredProjectsForUser(user);
    json(res, 200, { projects });
  },

  // Place bid
  'POST /api/bids': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (user.role !== 'contractor') return json(res, 403, { error: 'Contractors only' });
    
    const body = await parseBody(req);
    if (!body.project_id || !body.amount) return json(res, 400, { error: 'Project ID and amount required' });
    const project = await findStoredProjectById(parseInt(body.project_id));
    if (!project) return json(res, 404, { error: 'Project not found' });

    const bid = await createStoredBid(user.userId, body);
    json(res, 201, { message: 'Bid placed', bid });
  },

  // Accept bid
  'POST /api/bids/:id/accept': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const bid = await findStoredBidById(parseInt(params.id));
    if (!bid) return json(res, 404, { error: 'Bid not found' });
    
    const project = await findStoredProjectById(bid.project_id);
    if (!project || project.homeowner_id !== user.userId) return json(res, 403, { error: 'Not your project' });

    const { verification } = await verificationForContractorId(bid.contractor_id);
    if (!verification?.ready_for_bids) {
      return json(res, 400, {
        error: 'Contractor must be verified before bid acceptance',
        contractor_verification: verification,
      });
    }

    const { escrow } = await acceptStoredBid(bid, project, user.userId);
    json(res, 200, { message: 'Bid accepted, escrow created', escrow_id: escrow.id });
  },

  // My bids
  'GET /api/bids/my/bids': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    const bids = await listStoredBidsForContractor(user.userId);
    json(res, 200, { bids });
  },

  // Get escrow
  'GET /api/escrow/:id': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const escrow = await findStoredEscrowById(parseInt(params.id));
    if (!escrow || (escrow.homeowner_id !== user.userId && escrow.contractor_id !== user.userId)) return json(res, 404, { error: 'Escrow not found' });
    
    const milestones = await listStoredMilestonesByEscrow(escrow.id);
    json(res, 200, { escrow, milestones });
  },

  // Create escrow milestone
  'POST /api/escrow/:id/milestones': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const escrow = await findStoredEscrowById(parseInt(params.id));
    if (!escrow) return json(res, 404, { error: 'Escrow not found' });
    if (escrow.homeowner_id !== user.userId) return json(res, 403, { error: 'Homeowner only' });
    if (escrow.status === 'disputed') return json(res, 400, { error: 'Escrow is disputed' });
    if (escrow.status === 'completed') return json(res, 400, { error: 'Escrow is completed' });

    try {
      const milestone = await createStoredMilestone(escrow, await parseBody(req));
      json(res, 201, { message: 'Milestone created', milestone });
    } catch (err) {
      json(res, err.status || 400, { error: err.message || 'Could not create milestone' });
    }
  },

  // Contractor submits milestone work
  'POST /api/milestones/:id/submit': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const milestone = await findStoredMilestoneById(parseInt(params.id));
    if (!milestone) return json(res, 404, { error: 'Milestone not found' });
    const escrow = await findStoredEscrowById(milestone.escrow_id);
    if (!escrow || escrow.contractor_id !== user.userId) return json(res, 403, { error: 'Contractor only' });
    if (escrow.status === 'disputed') return json(res, 400, { error: 'Escrow is disputed' });
    if (milestone.status !== 'pending') return json(res, 400, { error: 'Milestone must be pending' });

    const updated = await updateStoredMilestoneStatus(milestone, 'submitted', `contractor:${user.userId}`);
    json(res, 200, { message: 'Milestone submitted', milestone: updated });
  },

  // Homeowner approves submitted milestone
  'POST /api/milestones/:id/approve': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const milestone = await findStoredMilestoneById(parseInt(params.id));
    if (!milestone) return json(res, 404, { error: 'Milestone not found' });
    const escrow = await findStoredEscrowById(milestone.escrow_id);
    if (!escrow || escrow.homeowner_id !== user.userId) return json(res, 403, { error: 'Homeowner only' });
    if (escrow.status === 'disputed') return json(res, 400, { error: 'Escrow is disputed' });
    if (milestone.status !== 'submitted') return json(res, 400, { error: 'Milestone must be submitted' });

    const updated = await updateStoredMilestoneStatus(milestone, 'approved', `homeowner:${user.userId}`);
    json(res, 200, { message: 'Milestone approved', milestone: updated });
  },

  // Homeowner marks approved milestone as released without moving on-chain funds yet
  'POST /api/milestones/:id/release': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const milestone = await findStoredMilestoneById(parseInt(params.id));
    if (!milestone) return json(res, 404, { error: 'Milestone not found' });
    const escrow = await findStoredEscrowById(milestone.escrow_id);
    if (!escrow || escrow.homeowner_id !== user.userId) return json(res, 403, { error: 'Homeowner only' });
    if (escrow.status === 'disputed') return json(res, 400, { error: 'Escrow is disputed' });
    if (milestone.status !== 'approved') return json(res, 400, { error: 'Milestone must be approved before release' });

    const updated = await updateStoredMilestoneStatus(milestone, 'released', `homeowner:${user.userId}`);
    const releasedTotal = await getReleasedMilestoneAmountTotal(escrow.id);
    const updatedEscrow = releasedTotal >= escrow.total_amount
      ? await updateStoredEscrowStatus(escrow, 'completed')
      : escrow;
    json(res, 200, { message: 'Milestone released', milestone: updated, escrow: updatedEscrow });
  },

  // Homeowner or contractor disputes a milestone
  'POST /api/milestones/:id/dispute': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const milestone = await findStoredMilestoneById(parseInt(params.id));
    if (!milestone) return json(res, 404, { error: 'Milestone not found' });
    const escrow = await findStoredEscrowById(milestone.escrow_id);
    if (!escrow || (escrow.homeowner_id !== user.userId && escrow.contractor_id !== user.userId)) {
      return json(res, 403, { error: 'Escrow participant only' });
    }
    if (milestone.status === 'released') return json(res, 400, { error: 'Released milestone cannot be disputed' });

    const updated = await updateStoredMilestoneStatus(milestone, 'disputed', `user:${user.userId}`);
    const updatedEscrow = await updateStoredEscrowStatus(escrow, 'disputed');
    json(res, 200, { message: 'Milestone disputed', milestone: updated, escrow: updatedEscrow });
  },

  // Store XPR testnet transaction evidence for a milestone action
  'POST /api/milestones/:id/chain-txs': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const milestone = await findStoredMilestoneById(parseInt(params.id));
    if (!milestone) return json(res, 404, { error: 'Milestone not found' });
    const escrow = await findStoredEscrowById(milestone.escrow_id);
    if (!escrow || (escrow.homeowner_id !== user.userId && escrow.contractor_id !== user.userId)) {
      return json(res, 403, { error: 'Escrow participant only' });
    }

    try {
      const chainTx = await createStoredMilestoneChainTx(milestone, escrow, user.userId, await parseBody(req));
      json(res, 201, { message: 'Chain transaction recorded', chain_tx: chainTx });
    } catch (err) {
      json(res, err.status || 400, { error: err.message || 'Could not record chain transaction' });
    }
  },

  // Verify stored XPR testnet transaction evidence through Hyperion
  'POST /api/milestones/:id/chain-txs/:txId/verify': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const milestone = await findStoredMilestoneById(parseInt(params.id));
    if (!milestone) return json(res, 404, { error: 'Milestone not found' });
    const escrow = await findStoredEscrowById(milestone.escrow_id);
    if (!escrow || (escrow.homeowner_id !== user.userId && escrow.contractor_id !== user.userId)) {
      return json(res, 403, { error: 'Escrow participant only' });
    }

    const chainTx = await findStoredChainTxByTxId(params.txId);
    if (!chainTx || chainTx.milestone_id !== milestone.id) {
      return json(res, 404, { error: 'Chain transaction not found' });
    }

    try {
      const verified = await verifyStoredChainTx(chainTx);
      json(res, 200, { message: 'Chain transaction verified', chain_tx: verified });
    } catch (err) {
      json(res, 502, { error: err.message || 'Could not verify chain transaction' });
    }
  },

  // My escrows
  'GET /api/escrow/my/escrows': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    const escrows = await listStoredEscrowsForUser(user.userId);
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
    startChainTxVerifier();
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
