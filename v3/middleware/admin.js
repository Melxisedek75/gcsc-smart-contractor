/**
 * ============================================================================
 * GCSC Admin Role Middleware
 * ============================================================================
 *
 * Protects admin-only endpoints:
 *   - Dispute resolution
 *   - Contractor verification approval
 *   - User management
 *   - Audit log access
 *
 * Usage:
 *   const { requireAdmin } = require('../middleware/admin');
 *   app.post('/api/disputes/:id/resolve', requireAdmin, disputeResolveHandler);
 *
 * ============================================================================
 */

const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable is required'); })();

/**
 * Extract and verify JWT from request
 */
async function extractUser(req) {
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

/**
 * Middleware: require authentication
 */
async function requireAuth(req, res, next) {
    const user = await extractUser(req);
    if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }
    req.user = user;
    next();
}

/**
 * Middleware: require admin role
 */
async function requireAdmin(req, res, next) {
    const user = await extractUser(req);
    if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }

    if (user.role !== 'admin') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Admin access required' }));
        return;
    }

    req.user = user;
    next();
}

/**
 * Middleware: require specific roles
 * Usage: requireRole('admin', 'mediator')
 */
function requireRole(...allowedRoles) {
    return async function(req, res, next) {
        const user = await extractUser(req);
        if (!user) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }

        if (!allowedRoles.includes(user.role)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Required role: ${allowedRoles.join(' or ')}` }));
            return;
        }

        req.user = user;
        next();
    };
}

/**
 * Middleware: require either homeowner or contractor (for escrow access)
 */
async function requireEscrowParty(req, res, next) {
    const user = await extractUser(req);
    if (!user) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }

    if (user.role !== 'homeowner' && user.role !== 'contractor') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Only homeowners or contractors allowed' }));
        return;
    }

    req.user = user;
    next();
}

module.exports = {
    extractUser,
    requireAuth,
    requireAdmin,
    requireRole,
    requireEscrowParty,
};
