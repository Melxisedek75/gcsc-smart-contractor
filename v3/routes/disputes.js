/**
 * Dispute Resolution System (FIXED: Proper JWT + DB integration)
 * Handle disputes between homeowners and contractors
 */

const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable is required'); })();

// FIXME: Move disputes to database table (currently in-memory, data lost on restart)
const disputes = [];
let nextDisputeId = 1;

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
    
    // In-memory only — FIXME: move to database
    const dispute = {
      id: nextDisputeId++,
      escrow_id,
      user_id: user.userId || user.id,
      reason,
      evidence: evidence || [],
      requested_action: requested_action || 'review',
      status: 'open',
      created_at: new Date().toISOString(),
      resolved_at: null,
      resolution: null,
    };
    
    disputes.push(dispute);
    
    json(res, 201, {
      message: 'Dispute opened',
      dispute_id: dispute.id,
      status: 'open',
    });
  },
  
  // Get disputes for user
  'GET /api/disputes/my': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const userDisputes = disputes.filter(d => d.user_id === (user.userId || user.id));
    
    json(res, 200, { disputes: userDisputes, total: userDisputes.length });
  },
  
  // Get single dispute
  'GET /api/disputes/:id': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const match = req.url.match(/\/api\/disputes\/(\d+)/);
    if (!match) return json(res, 400, { error: 'Invalid dispute ID' });
    
    const disputeId = parseInt(match[1], 10);
    const dispute = disputes.find(d => d.id === disputeId);
    
    if (!dispute) return json(res, 404, { error: 'Dispute not found' });
    if (dispute.user_id !== (user.userId || user.id)) {
      return json(res, 403, { error: 'Access denied' });
    }
    
    json(res, 200, { dispute });
  },
  
  // Resolve dispute (admin or mediator only — placeholder)
  'POST /api/disputes/:id/resolve': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    // TODO: Add admin/mediator role check
    
    const match = req.url.match(/\/api\/disputes\/(\d+)\/resolve/);
    if (!match) return json(res, 400, { error: 'Invalid dispute ID' });
    
    const disputeId = parseInt(match[1], 10);
    const dispute = disputes.find(d => d.id === disputeId);
    
    if (!dispute) return json(res, 404, { error: 'Dispute not found' });
    
    const body = await parseBody(req);
    dispute.status = 'resolved';
    dispute.resolution = body.resolution || 'resolved';
    dispute.resolved_at = new Date().toISOString();
    
    json(res, 200, {
      message: 'Dispute resolved',
      dispute_id: dispute.id,
      status: 'resolved',
    });
  },
};

module.exports = disputeRoutes;
