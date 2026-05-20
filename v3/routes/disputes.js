/**
 * Dispute Resolution System (FIXED: Database persistence + proper JWT)
 * Handle disputes between homeowners and contractors
 */

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

const disputeRoutes = {
  // Open dispute
  'POST /api/disputes': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const body = await parseBody(req);
    const { escrow_id, reason, evidence, requested_action } = body;

    if (!escrow_id || !reason) {
      return json(res, 400, { error: 'escrow_id and reason required' });
    }

    try {
      const result = await db.query(
        `INSERT INTO disputes (escrow_id, user_id, reason, evidence, requested_action, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'open', NOW())
         RETURNING *`,
        [
          parseInt(escrow_id, 10),
          user.userId || user.id,
          reason,
          JSON.stringify(evidence || []),
          requested_action || 'review'
        ]
      );

      const dispute = result.rows[0];

      json(res, 201, {
        message: 'Dispute opened',
        dispute_id: dispute.id,
        status: dispute.status,
      });
    } catch (err) {
      console.error('[Dispute Error]', err.message);
      json(res, 500, { error: 'Failed to create dispute', details: err.message });
    }
  },

  // Get disputes for user
  'GET /api/disputes/my': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    try {
      const result = await db.query(
        `SELECT d.*, e.project_id, e.status as escrow_status
         FROM disputes d
         JOIN escrow_contracts e ON d.escrow_id = e.id
         WHERE d.user_id = $1
         ORDER BY d.created_at DESC`,
        [user.userId || user.id]
      );

      json(res, 200, { disputes: result.rows, total: result.rows.length });
    } catch (err) {
      console.error('[Dispute Error]', err.message);
      json(res, 500, { error: 'Failed to retrieve disputes' });
    }
  },

  // Get single dispute
  'GET /api/disputes/:id': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    const match = req.url.match(/\/api\/disputes\/(\d+)/);
    if (!match) return json(res, 400, { error: 'Invalid dispute ID' });

    const disputeId = parseInt(match[1], 10);

    try {
      const result = await db.query(
        `SELECT d.*, e.project_id, e.status as escrow_status
         FROM disputes d
         JOIN escrow_contracts e ON d.escrow_id = e.id
         WHERE d.id = $1`,
        [disputeId]
      );

      if (result.rows.length === 0) {
        return json(res, 404, { error: 'Dispute not found' });
      }

      const dispute = result.rows[0];

      // Check access — user must be involved in the escrow
      const escrowResult = await db.query(
        'SELECT * FROM escrow_contracts WHERE id = $1',
        [dispute.escrow_id]
      );
      const escrow = escrowResult.rows[0];

      if (!escrow) {
        return json(res, 404, { error: 'Escrow not found' });
      }

      const userId = user.userId || user.id;
      if (escrow.homeowner_id !== userId && escrow.contractor_id !== userId) {
        return json(res, 403, { error: 'Access denied' });
      }

      json(res, 200, { dispute });
    } catch (err) {
      console.error('[Dispute Error]', err.message);
      json(res, 500, { error: 'Failed to retrieve dispute' });
    }
  },

  // Resolve dispute (admin or mediator only — placeholder)
  'POST /api/disputes/:id/resolve': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    // TODO: Add admin/mediator role check

    const match = req.url.match(/\/api\/disputes\/(\d+)\/resolve/);
    if (!match) return json(res, 400, { error: 'Invalid dispute ID' });

    const disputeId = parseInt(match[1], 10);
    const body = await parseBody(req);

    try {
      const result = await db.query(
        `UPDATE disputes
         SET status = 'resolved', resolution = $1, resolved_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [body.resolution || 'resolved', disputeId]
      );

      if (result.rows.length === 0) {
        return json(res, 404, { error: 'Dispute not found' });
      }

      const dispute = result.rows[0];

      json(res, 200, {
        message: 'Dispute resolved',
        dispute_id: dispute.id,
        status: dispute.status,
      });
    } catch (err) {
      console.error('[Dispute Error]', err.message);
      json(res, 500, { error: 'Failed to resolve dispute' });
    }
  },
};

module.exports = disputeRoutes;
