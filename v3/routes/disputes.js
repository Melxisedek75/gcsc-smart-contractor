/**
 * Dispute Resolution System
 * Handle disputes between homeowners and contractors
 */

const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || 'gcsc-dev-secret-256-bits-minimum-length';

// In-memory disputes storage
const disputes = [];
let nextDisputeId = 1;

function jwtVerify(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString());
  if (payload.exp < Math.floor(Date.now()/1000)) throw new Error('Expired');
  return payload;
}

function getUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try { return jwtVerify(token); } catch { return null; }
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
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const body = await parseBody(req);
    const { escrow_id, reason, evidence, requested_action } = body;
    
    if (!escrow_id || !reason) {
      return json(res, 400, { error: 'escrow_id and reason required' });
    }
    
    const dispute = {
      id: nextDisputeId++,
      escrow_id: parseInt(escrow_id),
      opened_by: user.userId,
      opened_by_role: user.role,
      reason: reason,
      evidence: evidence || '',
      requested_action: requested_action || 'refund',
      status: 'open',
      resolution: null,
      resolved_by: null,
      created_at: new Date().toISOString(),
      resolved_at: null,
      messages: []
    };
    
    disputes.push(dispute);
    
    json(res, 201, {
      message: 'Dispute opened',
      dispute: {
        id: dispute.id,
        status: dispute.status,
        created_at: dispute.created_at
      }
    });
  },
  
  // List disputes (user's own)
  'GET /api/disputes/my': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const userDisputes = disputes.filter(d => d.opened_by === user.userId);
    json(res, 200, { 
      disputes: userDisputes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      total: userDisputes.length 
    });
  },
  
  // Get single dispute
  'GET /api/disputes/:id': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const dispute = disputes.find(d => d.id == parseInt(params.id));
    if (!dispute) return json(res, 404, { error: 'Dispute not found' });
    
    json(res, 200, { dispute });
  },
  
  // Add message to dispute
  'POST /api/disputes/:id/messages': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const body = await parseBody(req);
    const dispute = disputes.find(d => d.id == parseInt(params.id));
    if (!dispute) return json(res, 404, { error: 'Dispute not found' });
    
    const message = {
      id: (dispute.messages.length + 1),
      sender_id: user.userId,
      sender_email: user.email,
      message: body.message,
      created_at: new Date().toISOString()
    };
    
    dispute.messages.push(message);
    json(res, 201, { message: 'Message added', dispute_message: message });
  },
  
  // Resolve dispute (admin only)
  'POST /api/disputes/:id/resolve': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (user.role !== 'admin') return json(res, 403, { error: 'Admin only' });
    
    const body = await parseBody(req);
    const dispute = disputes.find(d => d.id == parseInt(params.id));
    if (!dispute) return json(res, 404, { error: 'Dispute not found' });
    if (dispute.status !== 'open') return json(res, 400, { error: 'Dispute already resolved' });
    
    dispute.status = 'resolved';
    dispute.resolution = body.resolution || 'resolved';
    dispute.resolved_by = user.userId;
    dispute.resolved_at = new Date().toISOString();
    
    json(res, 200, { 
      message: 'Dispute resolved', 
      dispute: {
        id: dispute.id,
        status: dispute.status,
        resolution: dispute.resolution,
        resolved_at: dispute.resolved_at
      }
    });
  },
  
  // List all disputes (admin)
  'GET /api/disputes': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    let result = disputes;
    
    // Non-admin sees only own disputes
    if (user.role !== 'admin') {
      result = disputes.filter(d => d.opened_by === user.userId);
    }
    
    // Filter by status
    const { status } = require('url').parse(req.url, true).query;
    if (status) {
      result = result.filter(d => d.status === status);
    }
    
    json(res, 200, {
      disputes: result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      total: result.length,
      by_status: {
        open: disputes.filter(d => d.status === 'open').length,
        resolved: disputes.filter(d => d.status === 'resolved').length
      }
    });
  }
};

module.exports = disputeRoutes;
