/**
 * Contractor Verification System (FIXED: Database persistence + proper JWT)
 * KYC-style verification for contractors
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable is required'); })();

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

    try {
      const result = await db.query(
        `INSERT INTO contractor_verifications 
         (user_id, document_type, document_number, document_image_url, status, verification_token, created_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, NOW())
         ON CONFLICT (user_id) WHERE status = 'pending' DO NOTHING
         RETURNING *`,
        [
          user.userId || user.id,
          document_type,
          document_number,
          document_image || null,
          generateVerificationToken()
        ]
      );

      if (result.rows.length === 0) {
        return json(res, 429, { error: 'Verification already pending' });
      }

      const verification = result.rows[0];

      json(res, 201, {
        message: 'Verification submitted',
        verification_id: verification.id,
        status: verification.status,
        token: verification.verification_token,
      });
    } catch (err) {
      console.error('[Verification Error]', err.message);
      json(res, 500, { error: 'Failed to submit verification' });
    }
  },

  // Get my verification status
  'GET /api/verify/status': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    try {
      const result = await db.query(
        `SELECT * FROM contractor_verifications 
         WHERE user_id = $1 
         ORDER BY created_at DESC`,
        [user.userId || user.id]
      );

      json(res, 200, {
        verifications: result.rows,
        total: result.rows.length,
        is_verified: result.rows.some(v => v.status === 'verified'),
      });
    } catch (err) {
      console.error('[Verification Error]', err.message);
      json(res, 500, { error: 'Failed to retrieve verification status' });
    }
  },

  // Admin: verify contractor
  'POST /api/verify/:id/approve': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    // Admin check
    if (user.role !== 'admin') {
      return json(res, 403, { error: 'Admin access required' });
    }

    const match = req.url.match(/\/api\/verify\/(\d+)\/approve/);
    if (!match) return json(res, 400, { error: 'Invalid verification ID' });

    const verificationId = parseInt(match[1], 10);
    if (Number.isNaN(verificationId)) return json(res, 400, { error: 'Verification ID must be a number' });

    try {
      const result = await db.query(
        `UPDATE contractor_verifications
         SET status = 'verified', verified_at = NOW(), verified_by = $1
         WHERE id = $2
         RETURNING *`,
        [user.userId || user.id, verificationId]
      );

      if (result.rows.length === 0) {
        return json(res, 404, { error: 'Verification not found' });
      }

      const verification = result.rows[0];

      json(res, 200, {
        message: 'Contractor verified',
        verification_id: verification.id,
        status: verification.status,
      });
    } catch (err) {
      console.error('[Verification Error]', err.message);
      json(res, 500, { error: 'Failed to verify contractor' });
    }
  },
};

module.exports = verificationRoutes;
