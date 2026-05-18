/**
 * Contractor Verification System
 * KYC-style verification for contractors
 */

const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || 'gcsc-dev-secret-256-bits-minimum-length';

// In-memory verification storage
const verifications = [];
let nextVerificationId = 1;

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

const verificationRoutes = {
  // Submit verification request
  'POST /api/verification': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (user.role !== 'contractor') return json(res, 403, { error: 'Contractors only' });
    
    const body = await parseBody(req);
    
    // Check if already verified
    const existing = verifications.find(v => v.user_id === user.userId && v.status === 'approved');
    if (existing) return json(res, 409, { error: 'Already verified' });
    
    // Check if pending
    const pending = verifications.find(v => v.user_id === user.userId && v.status === 'pending');
    if (pending) return json(res, 409, { error: 'Verification already pending' });
    
    const verification = {
      id: nextVerificationId++,
      user_id: user.userId,
      user_email: user.email,
      full_name: body.full_name || '',
      business_name: body.business_name || '',
      license_number: body.license_number || '',
      years_experience: parseInt(body.years_experience) || 0,
      specialties: body.specialties || [],
      portfolio_urls: body.portfolio_urls || [],
      id_document_hash: body.id_document_hash || '',
      insurance_document_hash: body.insurance_document_hash || '',
      status: 'pending',
      badge_level: 'none',
      reviewed_by: null,
      review_notes: '',
      created_at: new Date().toISOString(),
      reviewed_at: null
    };
    
    verifications.push(verification);
    
    json(res, 201, {
      message: 'Verification submitted',
      verification: {
        id: verification.id,
        status: verification.status,
        badge_level: verification.badge_level,
        created_at: verification.created_at
      }
    });
  },
  
  // Get my verification status
  'GET /api/verification/my': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const verification = verifications
      .filter(v => v.user_id === user.userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    
    if (!verification) {
      return json(res, 200, { 
        status: 'not_submitted',
        badge_level: 'none',
        message: 'No verification submitted yet'
      });
    }
    
    json(res, 200, {
      status: verification.status,
      badge_level: verification.badge_level,
      submitted_at: verification.created_at,
      reviewed_at: verification.reviewed_at,
      review_notes: verification.review_notes
    });
  },
  
  // List all verifications (admin)
  'GET /api/verifications': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (user.role !== 'admin') return json(res, 403, { error: 'Admin only' });
    
    const { status } = require('url').parse(req.url, true).query;
    let result = verifications;
    
    if (status) {
      result = result.filter(v => v.status === status);
    }
    
    json(res, 200, {
      verifications: result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      total: result.length,
      pending: verifications.filter(v => v.status === 'pending').length,
      approved: verifications.filter(v => v.status === 'approved').length,
      rejected: verifications.filter(v => v.status === 'rejected').length
    });
  },
  
  // Approve verification (admin)
  'POST /api/verifications/:id/approve': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (user.role !== 'admin') return json(res, 403, { error: 'Admin only' });
    
    const body = await parseBody(req);
    const verification = verifications.find(v => v.id == parseInt(params.id));
    if (!verification) return json(res, 404, { error: 'Verification not found' });
    if (verification.status !== 'pending') return json(res, 400, { error: 'Already processed' });
    
    verification.status = 'approved';
    verification.badge_level = body.badge_level || 'verified'; // verified, pro, elite
    verification.reviewed_by = user.userId;
    verification.review_notes = body.notes || '';
    verification.reviewed_at = new Date().toISOString();
    
    json(res, 200, {
      message: 'Verification approved',
      verification: {
        id: verification.id,
        status: verification.status,
        badge_level: verification.badge_level,
        reviewed_at: verification.reviewed_at
      }
    });
  },
  
  // Reject verification (admin)
  'POST /api/verifications/:id/reject': async (req, res, params) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (user.role !== 'admin') return json(res, 403, { error: 'Admin only' });
    
    const body = await parseBody(req);
    const verification = verifications.find(v => v.id == parseInt(params.id));
    if (!verification) return json(res, 404, { error: 'Verification not found' });
    if (verification.status !== 'pending') return json(res, 400, { error: 'Already processed' });
    
    verification.status = 'rejected';
    verification.reviewed_by = user.userId;
    verification.review_notes = body.reason || '';
    verification.reviewed_at = new Date().toISOString();
    
    json(res, 200, {
      message: 'Verification rejected',
      verification: {
        id: verification.id,
        status: verification.status,
        review_notes: verification.review_notes,
        reviewed_at: verification.reviewed_at
      }
    });
  }
};

module.exports = verificationRoutes;
