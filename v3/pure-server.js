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

// In-memory database (SQLite requires npm install)
const db = {
  users: [],
  sessions: [],
  otp_verifications: [],
  projects: [],
  bids: [],
  escrow_contracts: [],
  milestones: [],
  reviews: [],
  nextId: (table) => (db[table].length > 0 ? Math.max(...db[table].map(r => r.id)) + 1 : 1),
};

// Seed sample data
db.users.push({
  id: 1, email: 'demo@gcsc.store', password_hash: hashPassword('demo123'),
  role: 'homeowner', full_name: 'Demo Homeowner', phone: '',
  is_verified: 1, is_active: 1, created_at: new Date().toISOString()
});
db.users.push({
  id: 2, email: 'contractor@gcsc.store', password_hash: hashPassword('demo123'),
  role: 'contractor', full_name: 'Demo Contractor', phone: '',
  is_verified: 1, is_active: 1, created_at: new Date().toISOString()
});

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
    json(res, 200, { status: 'ok', version: '3.0.0', database: 'memory', timestamp: new Date().toISOString(), uptime: process.uptime() });
  },
  
  // Stats
  'GET /api/stats': async (req, res) => {
    json(res, 200, { users: db.users.length, projects: db.projects.length, completed_escrows: db.escrow_contracts.filter(e => e.status === 'completed').length, platform: 'GCSC Smart Contractor v3.0' });
  },

  // Register Step 1
  'POST /api/register': async (req, res) => {
    const body = await parseBody(req);
    if (!body.email || !body.email.includes('@')) return json(res, 400, { error: 'Valid email required' });
    if (!['homeowner', 'contractor'].includes(body.role)) return json(res, 400, { error: 'Role must be homeowner or contractor' });
    
    if (db.users.find(u => u.email === body.email)) return json(res, 409, { error: 'Email already registered' });
    
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    db.otp_verifications.push({ id: db.nextId('otp_verifications'), email: body.email, otp, purpose: 'registration', expires_at: expiresAt.toISOString(), created_at: new Date().toISOString() });
    
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
    const userId = db.nextId('users');
    db.users.push({
      id: userId, email: body.email, password_hash: hashPassword(password),
      role: body.role, full_name: body.full_name || body.email.split('@')[0], phone: body.phone || '',
      is_verified: 1, is_active: 1, created_at: new Date().toISOString()
    });
    
    db.otp_verifications = db.otp_verifications.filter(o => o.id !== otpRecord.id);
    
    const token = jwtSign({ userId, email: body.email, role: body.role });
    json(res, 200, { message: 'Registration successful', token, user: { id: userId, email: body.email, role: body.role, full_name: body.full_name || body.email.split('@')[0] } });
  },

  // Login Step 1
  'POST /api/login': async (req, res) => {
    const body = await parseBody(req);
    if (!body.email || !body.email.includes('@')) return json(res, 400, { error: 'Valid email required' });
    
    const user = db.users.find(u => u.email === body.email && u.is_active);
    if (!user) return json(res, 404, { error: 'User not found' });
    
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    db.otp_verifications.push({ id: db.nextId('otp_verifications'), email: body.email, otp, purpose: 'login', expires_at: expiresAt.toISOString() });
    
    await sendEmail(body.email, 'GCSC Login OTP', `Your code: ${otp}`);
    json(res, 200, { message: 'OTP sent', email: body.email });
  },

  // Verify Login
  'POST /api/login/verify': async (req, res) => {
    const body = await parseBody(req);
    if (!body.email || !body.otp) return json(res, 400, { error: 'Email and OTP required' });
    
    const otpRecord = db.otp_verifications.find(o => o.email === body.email && o.otp === body.otp && o.purpose === 'login' && new Date(o.expires_at) > new Date());
    if (!otpRecord) return json(res, 400, { error: 'Invalid or expired OTP' });
    
    const user = db.users.find(u => u.email === body.email);
    if (!user) return json(res, 404, { error: 'User not found' });
    
    db.otp_verifications = db.otp_verifications.filter(o => o.id !== otpRecord.id);
    
    const token = jwtSign({ userId: user.id, email: user.email, role: user.role });
    json(res, 200, { message: 'Login successful', token, user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name } });
  },

  // Get current user
  'GET /api/me': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    const u = db.users.find(x => x.id === user.userId);
    if (!u) return json(res, 404, { error: 'User not found' });
    json(res, 200, { user: { id: u.id, email: u.email, role: u.role, full_name: u.full_name, phone: u.phone, location: u.location, bio: u.bio } });
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║   GCSC Backend v3.0 — RUNNING            ║`);
  console.log(`║   Port: ${PORT}                            ║`);
  console.log(`║   Health: http://0.0.0.0:${PORT}/health      ║`);
  console.log(`║   JWT: custom (zero deps)                ║`);
  console.log(`║   DB: in-memory (auto-seeded)            ║`);
  console.log(`╚══════════════════════════════════════════╝`);
});

module.exports = server;
