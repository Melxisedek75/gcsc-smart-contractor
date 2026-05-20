/**
 * Contractor Verification System (FIXED: Proper JWT)
 * KYC-style verification for contractors
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable is required'); })();

// FIXME: Move verifications to database table (currently in-memory, data lost on restart)
const verifications = [];
let nextVerificationId = 1;

async function getUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 30,
    });

    if (!decoded.jti) return null;

    const { rows } = await db.query(
      'SELECT * FROM sessions WHERE jti = $1 AND is_revoked = false AND expires_at > NOW()',
      [decoded.jti]
    );

    if (rows.length === 0) return null;

    return decoded;
  } catch {
    return null;
  }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}

// Generate verification token
function generateVerificationToken() {
  return crypto.randomBytes(16).toString('hex');
}

const verificationRoutes = {
  // Submit verification request
  'POST /api/verify': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    if (user.role !== 'contractor') {
      return json(res, 403, { error: 'Contractors only' });
    }

    const body = await parseBody(req);
    const { document_type, document_number, document_image } = body;

    if (!document_type || !document_number) {
      return json(res, 400, { error: 'document_type and document_number required' });
    }

    // Check for existing pending verification
    const existing = verifications.find(v => v.user_id === (user.userId || user.id) && v.status === 'pending');
    if (existing) {
      return json(res, 429, { error: 'Verification already pending' });
    }

    const verification = {
      id: nextVerificationId++,
      user_id: user.userId || user.id,
      document_type,
      document_number,
      document_image: document_image || null,
      status: 'pending',
      token: generateVerificationToken(),
      created_at: new Date().toISOString(),
      verified_at: null,
      verified_by: null,
    };

    verifications.push(verification);

    json(res, 201, {
      message: 'Verification submitted',
      verification_id: verification.id,
      status: 'pending',
      token: verification.token,
    });
  },

  // Get my verification status
  'GET /api/verify/status': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const userId = user.userId || user.id;
    const userVerifications = verifications.filter(v => v.user_id === userId);

    json(res, 200, {
      verifications: userVerifications,
      total: userVerifications.length,
      is_verified: userVerifications.some(v => v.status === 'verified'),
    });
  },

  // Admin: verify contractor (placeholder — no real admin check yet)
  'POST /api/verify/:id/approve': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    // TODO: Add admin role check

    const match = req.url.match(/\/api\/verify\/(\d+)\/approve/);
    if (!match) return json(res, 400, { error: 'Invalid verification ID' });

    const verificationId = parseInt(match[1], 10);
    const verification = verifications.find(v => v.id === verificationId);

    if (!verification) return json(res, 404, { error: 'Verification not found' });

    verification.status = 'verified';
    verification.verified_at = new Date().toISOString();
    verification.verified_by = user.userId || user.id;

    json(res, 200, {
      message: 'Contractor verified',
      verification_id: verification.id,
      status: 'verified',
    });
  },
};

module.exports = verificationRoutes;
