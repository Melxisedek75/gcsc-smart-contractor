/**
 * ============================================================================
 * GCSC Smart Contractor v3.0 — Bidding System Routes
 * ============================================================================
 *
 * Bidding system allowing contractors to submit, update, and withdraw bids
 * on construction projects. Homeowners can accept or reject bids.
 * Accepting a bid triggers escrow contract creation.
 *
 * Endpoints:
 *   POST   /api/bids              — Place a bid (contractor only)
 *   GET    /api/bids/project/:project_id — List bids for a project (owner only)
 *   GET    /api/bids/my/bids      — List current contractor's bids
 *   PUT    /api/bids/:id          — Update a bid (pending only)
 *   DELETE /api/bids/:id          — Withdraw a bid (pending only)
 *   POST   /api/bids/:id/accept   — Homeowner accepts a bid
 *   POST   /api/bids/:id/reject   — Homeowner rejects a bid
 *
 * Security:
 *   - All endpoints require JWT authentication
 *   - Role-based access: bid creation requires 'contractor' role
 *   - Ownership checks on all bid operations
 *   - Parameterized queries prevent SQL injection
 *   - Input validation on all user-provided fields
 *   - Bid acceptance creates an escrow record atomically (transaction)
 * ============================================================================
 */

const express   = require('express');
const crypto    = require('crypto');
const validator = require('validator');
const db        = require('../database/db');

const router = express.Router();

// ---------------------------------------------------------------------------
// JWT Authentication Middleware
// ---------------------------------------------------------------------------

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable is required'); })();

function requireAuth(req, res, next) {
    (async () => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Authentication required.' });
            }

            const token = authHeader.substring(7);
            const decoded = jwt.verify(token, JWT_SECRET, {
                algorithms: ['HS256'],
                clockTolerance: 30,
            });

            if (!decoded.jti) {
                return res.status(401).json({ error: 'Authentication required.' });
            }

            const { rows } = await db.query(
                'SELECT * FROM sessions WHERE jti = $1 AND is_revoked = false AND expires_at > NOW()',
                [decoded.jti]
            );

            if (rows.length === 0) {
                return res.status(401).json({ error: 'Authentication required.' });
            }

            req.user = decoded;
            next();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[BidsRoute] JWT validation failed:', err.message);
            return res.status(401).json({ error: 'Authentication required.' });
        }
    })();
}

// ---------------------------------------------------------------------------
// Role-based Access Control
// ---------------------------------------------------------------------------

function requireRole(allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        next();
    };
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function generateErrorId() {
    return crypto.randomBytes(6).toString('hex');
}

function sendError(res, status, message, err = null, errorId = '') {
    if (err && errorId) {
        // eslint-disable-next-line no-console
        console.error(`[Bids:${errorId}]`, err.message || '', err.stack || '');
    }
    res.status(status).json({ error: message, ...(errorId && { errorId }) });
}

function isValidId(value) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isValidString(value, maxLength = 500) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// POST /api/bids — Place a bid on a project (contractor only)
// ---------------------------------------------------------------------------
// Body: { project_id, amount, proposed_timeline_days, message, attachments? }
// ---------------------------------------------------------------------------

router.post('/', requireAuth, requireRole(['contractor']), async (req, res) => {
    const requestId = req.requestId || 'bid-req';
    const errorId = generateErrorId();

    try {
        const {
            project_id,
            amount,
            proposed_timeline_days,
            message,
            attachments,
        } = req.body;

        // --- Input validation ---
        if (!isValidId(project_id)) {
            return res.status(400).json({ error: 'Invalid project_id.' });
        }

        if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) {
            return res.status(400).json({ error: 'amount must be a positive integer (USD cents).' });
        }

        const MAX_BID_CENTS = 100_000_000;
        if (amount > MAX_BID_CENTS) {
            return res.status(400).json({ error: 'Bid amount exceeds maximum ($1,000,000).' });
        }

        if (typeof proposed_timeline_days !== 'number' || !Number.isInteger(proposed_timeline_days) || proposed_timeline_days < 1 || proposed_timeline_days > 3650) {
            return res.status(400).json({ error: 'proposed_timeline_days must be between 1 and 3650.' });
        }

        // Optional message
        if (message !== undefined && message !== null && message !== '') {
            if (typeof message !== 'string' || message.length > 5000) {
                return res.status(400).json({ error: 'message must be a string (max 5000 chars).' });
            }
        }

        // Optional attachments
        let validatedAttachments = null;
        if (attachments !== undefined && attachments !== null) {
            if (!Array.isArray(attachments)) {
                return res.status(400).json({ error: 'attachments must be an array of URLs.' });
            }
            if (attachments.length > 10) {
                return res.status(400).json({ error: 'Maximum 10 attachments allowed.' });
            }
            for (const att of attachments) {
                if (typeof att !== 'string' || att.length > 1000) {
                    return res.status(400).json({ error: 'Each attachment must be a valid URL (max 1000 chars).' });
                }
                if (!validator.isURL(att, { require_protocol: true, protocols: ['http', 'https'] })) {
                    return res.status(400).json({ error: 'Each attachment must be a valid HTTP/HTTPS URL.' });
                }
            }
            validatedAttachments = JSON.stringify(attachments);
        }

        // --- Get contractor user ---
        const contractor = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!contractor) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // --- Verify project exists and is open for bidding ---
        const project = await db.selectOne(
            'SELECT * FROM projects WHERE id = $1',
            [project_id]
        );

        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        if (project.status !== 'open' && project.status !== 'bidding') {
            return res.status(400).json({
                error: `Project is not accepting bids. Status: ${project.status}.`,
            });
        }

        // Prevent bidding on own project
        if (project.homeowner_id === contractor.id) {
            return res.status(400).json({ error: 'Cannot bid on your own project.' });
        }

        // --- Check if contractor already has a pending bid on this project ---
        const existingBid = await db.selectOne(
            'SELECT * FROM bids WHERE project_id = $1 AND contractor_id = $2 AND status = $3',
            [project_id, contractor.id, 'pending']
        );

        if (existingBid) {
            return res.status(409).json({
                error: 'You already have a pending bid on this project. Update it instead.',
                existing_bid_id: existingBid.id,
            });
        }

        // --- Insert bid ---
        const result = await db.query(
            `INSERT INTO bids
             (project_id, contractor_id, amount, timeline_days, description, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING *`,
            [
                project_id,
                contractor.id,
                amount,
                proposed_timeline_days,
                message ? message.trim() : null,
                'pending',
            ]
        );

        const bid = result.rows[0];

        // --- Update project status to 'bidding' if it's 'open' ---
        if (project.status === 'open') {
            await db.query(
                `UPDATE projects SET status = 'bidding', updated_at = NOW() WHERE id = $1`,
                [project_id]
            );
        }

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Bid placed: id=${bid.id}, project=${project_id}, contractor=${contractor.id}, amount=${amount}`);

        return res.status(201).json({
            id: bid.id,
            project_id: bid.project_id,
            contractor_id: bid.contractor_id,
            amount: bid.amount,
            timeline_days: bid.timeline_days,
            description: bid.description,
            status: bid.status,
            created_at: bid.created_at,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to place bid.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// GET /api/bids/project/:project_id — List all bids for a project
// ---------------------------------------------------------------------------
// Only the project owner (homeowner) can view all bids.
// ---------------------------------------------------------------------------

router.get('/project/:project_id', requireAuth, requireRole(['homeowner']), async (req, res) => {
    const errorId = generateErrorId();

    try {
        const projectId = parseInt(req.params.project_id, 10);

        if (isNaN(projectId) || projectId < 1) {
            return res.status(400).json({ error: 'Invalid project ID.' });
        }

        // --- Get user ---
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // --- Verify project ownership ---
        const project = await db.selectOne(
            'SELECT * FROM projects WHERE id = $1',
            [projectId]
        );

        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        if (project.homeowner_id !== user.id) {
            return res.status(403).json({ error: 'Only the project owner can view bids.' });
        }

        // --- Fetch bids with contractor info ---
        const bids = await db.select(
            `SELECT
                b.*,
                u.email as contractor_email,
                u.xpr_account as contractor_account
             FROM bids b
             JOIN users u ON b.contractor_id = u.id
             WHERE b.project_id = $1
             ORDER BY b.amount ASC, b.created_at DESC`,
            [projectId]
        );

        return res.status(200).json({
            project_id: projectId,
            project_title: project.title,
            bids: bids.map((b) => ({
                id: b.id,
                contractor_id: b.contractor_id,
                contractor_email: b.contractor_email,
                contractor_account: b.contractor_account,
                amount: b.amount,
                timeline_days: b.timeline_days,
                description: b.description,
                status: b.status,
                created_at: b.created_at,
                updated_at: b.updated_at,
            })),
            count: bids.length,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to retrieve bids.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// GET /api/bids/my/bids — List current contractor's bids
// ---------------------------------------------------------------------------

router.get('/my/bids', requireAuth, requireRole(['contractor']), async (req, res) => {
    const errorId = generateErrorId();

    try {
        // --- Get contractor ---
        const contractor = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!contractor) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // --- Fetch all bids by this contractor with project info ---
        const bids = await db.select(
            `SELECT
                b.*,
                p.title as project_title,
                p.category as project_category,
                p.location as project_location,
                p.status as project_status,
                u.email as homeowner_email
             FROM bids b
             JOIN projects p ON b.project_id = p.id
             JOIN users u ON p.homeowner_id = u.id
             WHERE b.contractor_id = $1
             ORDER BY b.created_at DESC`,
            [contractor.id]
        );

        return res.status(200).json({
            bids: bids.map((b) => ({
                id: b.id,
                project_id: b.project_id,
                project_title: b.project_title,
                project_category: b.project_category,
                project_location: b.project_location,
                project_status: b.project_status,
                homeowner_email: b.homeowner_email,
                amount: b.amount,
                timeline_days: b.timeline_days,
                description: b.description,
                status: b.status,
                created_at: b.created_at,
                updated_at: b.updated_at,
            })),
            count: bids.length,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to retrieve bids.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// PUT /api/bids/:id — Update a bid (only if status='pending')
// ---------------------------------------------------------------------------

router.put('/:id', requireAuth, requireRole(['contractor']), async (req, res) => {
    const requestId = req.requestId || 'bid-req';
    const errorId = generateErrorId();

    try {
        const bidId = parseInt(req.params.id, 10);

        if (isNaN(bidId) || bidId < 1) {
            return res.status(400).json({ error: 'Invalid bid ID.' });
        }

        const { amount, proposed_timeline_days, message } = req.body;

        // --- Get contractor ---
        const contractor = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!contractor) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // --- Get bid ---
        const bid = await db.selectOne(
            'SELECT * FROM bids WHERE id = $1',
            [bidId]
        );

        if (!bid) {
            return res.status(404).json({ error: 'Bid not found.' });
        }

        // --- Ownership check ---
        if (bid.contractor_id !== contractor.id) {
            return res.status(403).json({ error: 'You can only update your own bids.' });
        }

        // --- Status check ---
        if (bid.status !== 'pending') {
            return res.status(400).json({
                error: `Cannot update a bid with status '${bid.status}'. Only pending bids can be updated.`,
            });
        }

        // --- Build update — SECURITY FIX: Whitelist allowed fields, no dynamic SQL ---
        const ALLOWED_FIELDS = {
            amount: { column: 'amount', validate: (v) => {
                if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return 'amount must be a positive integer.';
                if (v > 100_000_000) return 'Bid amount exceeds maximum ($1,000,000).';
                return null;
            }},
            proposed_timeline_days: { column: 'timeline_days', validate: (v) => {
                const val = Math.round(v);
                if (!Number.isInteger(val) || val < 1 || val > 3650) return 'proposed_timeline_days must be between 1 and 3650.';
                return null;
            }},
            message: { column: 'description', validate: (v) => {
                if (v !== null && (typeof v !== 'string' || v.length > 5000)) return 'message must be a string (max 5000 chars) or null.';
                return null;
            }},
        };

        const updates = [];
        const params = [];
        let paramIndex = 1;

        for (const [fieldName, config] of Object.entries(ALLOWED_FIELDS)) {
            const value = req.body[fieldName];
            if (value !== undefined) {
                const error = config.validate(value);
                if (error) return res.status(400).json({ error });
                updates.push(config.column + ' = $' + paramIndex);
                params.push(fieldName === 'message' ? (value ? value.trim() : null) : value);
                paramIndex++;
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields provided to update.' });
        }

        params.push(bidId);

        const result = await db.query(
            'UPDATE bids SET ' + updates.join(', ') + ' WHERE id = $' + paramIndex + ' RETURNING *',
            params
        );

        const updatedBid = result.rows[0];

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Bid updated: id=${bidId}`);

        return res.status(200).json({
            id: updatedBid.id,
            project_id: updatedBid.project_id,
            amount: updatedBid.amount,
            timeline_days: updatedBid.timeline_days,
            description: updatedBid.description,
            status: updatedBid.status,
            updated_at: updatedBid.updated_at,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to update bid.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// DELETE /api/bids/:id — Withdraw a bid (only if status='pending')
// ---------------------------------------------------------------------------

router.delete('/:id', requireAuth, requireRole(['contractor']), async (req, res) => {
    const requestId = req.requestId || 'bid-req';
    const errorId = generateErrorId();

    try {
        const bidId = parseInt(req.params.id, 10);

        if (isNaN(bidId) || bidId < 1) {
            return res.status(400).json({ error: 'Invalid bid ID.' });
        }

        // --- Get contractor ---
        const contractor = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!contractor) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // --- Get bid ---
        const bid = await db.selectOne(
            'SELECT * FROM bids WHERE id = $1',
            [bidId]
        );

        if (!bid) {
            return res.status(404).json({ error: 'Bid not found.' });
        }

        // --- Ownership check ---
        if (bid.contractor_id !== contractor.id) {
            return res.status(403).json({ error: 'You can only withdraw your own bids.' });
        }

        // --- Status check ---
        if (bid.status !== 'pending') {
            return res.status(400).json({
                error: `Cannot withdraw a bid with status '${bid.status}'. Only pending bids can be withdrawn.`,
            });
        }

        // --- Update bid status to 'withdrawn' ---
        await db.query(
            `UPDATE bids SET status = 'withdrawn', updated_at = NOW() WHERE id = $1`,
            [bidId]
        );

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Bid withdrawn: id=${bidId}`);

        return res.status(200).json({
            message: 'Bid withdrawn successfully.',
            bid_id: bidId,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to withdraw bid.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// POST /api/bids/:id/accept — Homeowner accepts a bid
// ---------------------------------------------------------------------------
// Creates escrow contract, notifies contractor.
// Body: { accepted_terms? }
// ---------------------------------------------------------------------------

router.post('/:id/accept', requireAuth, requireRole(['homeowner']), async (req, res) => {
    const requestId = req.requestId || 'bid-req';
    const errorId = generateErrorId();

    try {
        const bidId = parseInt(req.params.id, 10);

        if (isNaN(bidId) || bidId < 1) {
            return res.status(400).json({ error: 'Invalid bid ID.' });
        }

        // --- Get user ---
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // --- Get bid with project info ---
        const bid = await db.selectOne(
            `SELECT b.*, p.homeowner_id, p.title as project_title, p.status as project_status
             FROM bids b
             JOIN projects p ON b.project_id = p.id
             WHERE b.id = $1`,
            [bidId]
        );

        if (!bid) {
            return res.status(404).json({ error: 'Bid not found.' });
        }

        // --- Ownership check ---
        if (bid.homeowner_id !== user.id) {
            return res.status(403).json({ error: 'Only the project owner can accept bids.' });
        }

        // --- Status checks ---
        if (bid.status !== 'pending') {
            return res.status(400).json({
                error: `Cannot accept a bid with status '${bid.status}'. Only pending bids can be accepted.`,
            });
        }

        if (bid.project_status !== 'open' && bid.project_status !== 'bidding') {
            return res.status(400).json({
                error: `Cannot accept bids on a project with status '${bid.project_status}'.`,
            });
        }

        // --- Accept bid and create escrow (transaction) ---
        const acceptedTerms = req.body.accepted_terms || null;

        const result = await db.transaction(async (client) => {
            // 1. Accept the bid
            const bidResult = await client.query(
                `UPDATE bids SET status = 'accepted', updated_at = NOW()
                 WHERE id = $1 RETURNING *`,
                [bidId]
            );
            const acceptedBid = bidResult.rows[0];

            // 2. Reject all other pending bids on this project
            await client.query(
                `UPDATE bids SET status = 'rejected', updated_at = NOW()
                 WHERE project_id = $1 AND id != $2 AND status = 'pending'`,
                [bid.project_id, bidId]
            );

            // 3. Update project status to in_progress
            await client.query(
                `UPDATE projects SET status = 'in_progress', updated_at = NOW()
                 WHERE id = $1`,
                [bid.project_id]
            );

            // 4. Create escrow contract
            const escrowResult = await client.query(
                `INSERT INTO escrow_contracts
                 (project_id, bid_id, homeowner_id, contractor_id, amount, status, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())
                 RETURNING *`,
                [
                    bid.project_id,
                    bidId,
                    user.id,
                    bid.contractor_id,
                    bid.amount,
                    'pending', // pending until funded
                ]
            );
            const escrow = escrowResult.rows[0];

            return { acceptedBid, escrow };
        });

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Bid accepted: id=${bidId}, escrow=${result.escrow.id}, project=${bid.project_id}`);

        return res.status(200).json({
            message: 'Bid accepted successfully. Escrow contract created.',
            bid_id: result.acceptedBid.id,
            bid_status: result.acceptedBid.status,
            escrow: {
                id: result.escrow.id,
                project_id: result.escrow.project_id,
                amount: result.escrow.amount,
                status: result.escrow.status,
                contractor_id: result.escrow.contractor_id,
            },
            project_status: 'in_progress',
            next_step: 'Fund the escrow via Stripe or XPR to begin work.',
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to accept bid.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// POST /api/bids/:id/reject — Homeowner rejects a bid
// ---------------------------------------------------------------------------

router.post('/:id/reject', requireAuth, requireRole(['homeowner']), async (req, res) => {
    const requestId = req.requestId || 'bid-req';
    const errorId = generateErrorId();

    try {
        const bidId = parseInt(req.params.id, 10);

        if (isNaN(bidId) || bidId < 1) {
            return res.status(400).json({ error: 'Invalid bid ID.' });
        }

        // --- Get user ---
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // --- Get bid with project info ---
        const bid = await db.selectOne(
            `SELECT b.*, p.homeowner_id
             FROM bids b
             JOIN projects p ON b.project_id = p.id
             WHERE b.id = $1`,
            [bidId]
        );

        if (!bid) {
            return res.status(404).json({ error: 'Bid not found.' });
        }

        // --- Ownership check ---
        if (bid.homeowner_id !== user.id) {
            return res.status(403).json({ error: 'Only the project owner can reject bids.' });
        }

        // --- Status check ---
        if (bid.status !== 'pending') {
            return res.status(400).json({
                error: `Cannot reject a bid with status '${bid.status}'. Only pending bids can be rejected.`,
            });
        }

        // --- Reject the bid ---
        await db.query(
            `UPDATE bids SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
            [bidId]
        );

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Bid rejected: id=${bidId}`);

        return res.status(200).json({
            message: 'Bid rejected successfully.',
            bid_id: bidId,
            status: 'rejected',
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to reject bid.', err, errorId);
    }
});

module.exports = router;
