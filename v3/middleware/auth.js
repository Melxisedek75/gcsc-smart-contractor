/**
 * Shared JWT authentication middleware for GCSC Smart Contractor v3.
 *
 * All protected routes must verify JWT signatures with HS256 and validate
 * the session JTI against the database before trusting req.user.
 */

const jwt = require('jsonwebtoken');
const db = require('../database/db');

function getJwtSecret() {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET environment variable is required');
    }
    return process.env.JWT_SECRET;
}

function sendJson(res, status, data) {
    if (typeof res.status === 'function') {
        return res.status(status).json(data);
    }

    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

async function extractUser(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return null;
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret(), {
            algorithms: ['HS256'],
            clockTolerance: 30,
        });

        if (!decoded.jti) {
            return null;
        }

        const { rows } = await db.query(
            'SELECT * FROM sessions WHERE jti = $1 AND is_revoked = false AND expires_at > NOW()',
            [decoded.jti]
        );

        if (rows.length === 0) {
            return null;
        }

        return decoded;
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[Auth] JWT validation failed:', err.message);
        return null;
    }
}

async function requireAuth(req, res, next) {
    const user = await extractUser(req);
    if (!user) {
        return sendJson(res, 401, { error: 'Authentication required.' });
    }

    req.user = user;
    return next();
}

function normalizeRoles(roles) {
    if (roles.length === 1 && Array.isArray(roles[0])) {
        return roles[0];
    }
    return roles;
}

function requireRole(...roles) {
    const allowedRoles = normalizeRoles(roles);

    return async function requireRoleMiddleware(req, res, next) {
        const user = req.user || await extractUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required.' });
        }

        if (!allowedRoles.includes(user.role)) {
            return sendJson(res, 403, { error: 'Access denied.' });
        }

        req.user = user;
        return next();
    };
}

async function requireAdmin(req, res, next) {
    const user = req.user || await extractUser(req);
    if (!user) {
        return sendJson(res, 401, { error: 'Authentication required.' });
    }

    if (user.role !== 'admin') {
        return sendJson(res, 403, { error: 'Admin access required' });
    }

    req.user = user;
    return next();
}

async function requireEscrowParty(req, res, next) {
    const user = req.user || await extractUser(req);
    if (!user) {
        return sendJson(res, 401, { error: 'Authentication required.' });
    }

    if (user.role !== 'homeowner' && user.role !== 'contractor') {
        return sendJson(res, 403, { error: 'Only homeowners or contractors allowed' });
    }

    req.user = user;
    return next();
}

module.exports = {
    extractUser,
    requireAuth,
    requireAdmin,
    requireRole,
    requireEscrowParty,
};
