/**
 * ============================================================================
 * GCSC Smart Contractor v3.0 — Project Management Routes
 * ============================================================================
 *
 * Full CRUD for construction projects posted by homeowners.
 * Contractors can browse open projects and submit bids.
 *
 * Endpoints:
 *   POST   /api/projects              — Create a new project (homeowner only)
 *   GET    /api/projects              — List projects with filters
 *   GET    /api/projects/:id          — Get single project with bids
 *   PUT    /api/projects/:id          — Update project (owner only)
 *   DELETE /api/projects/:id          — Delete project (owner only)
 *   POST   /api/projects/:id/close    — Close project to new bids
 *   GET    /api/projects/my/projects  — Get current user's projects
 *
 * Security:
 *   - All endpoints require JWT authentication
 *   - Role-based access: creation requires 'homeowner' role
 *   - Ownership checks on update, delete, and close operations
 *   - Parameterized queries prevent SQL injection
 *   - Input validation on all user-provided fields
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
            console.error('[ProjectsRoute] JWT validation failed:', err.message);
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
        console.error(`[Projects:${errorId}]`, err.message || '', err.stack || '');
    }
    res.status(status).json({ error: message, ...(errorId && { errorId }) });
}

function isValidId(value) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isValidString(value, maxLength = 500) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

/**
 * HTML escape utility — prevents XSS.
 * @param {string} text - Raw text to escape
 * @returns {string} HTML-escaped text
 */
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
// POST /api/projects — Create a new project
// ---------------------------------------------------------------------------
// Creates a new construction project. Only verified homeowners can create.
// Body: { title, description, budget_min, budget_max, location, category, timeline_days, images? }
// ---------------------------------------------------------------------------

router.post('/', requireAuth, requireRole(['homeowner']), async (req, res) => {
    const requestId = req.requestId || 'proj-req';
    const errorId = generateErrorId();

    try {
        const {
            title,
            description,
            budget_min,
            budget_max,
            location,
            category,
            timeline_days,
            images,
        } = req.body;

        // --- Input validation ---
        if (!isValidString(title, 200)) {
            return res.status(400).json({ error: 'Title is required (max 200 chars).' });
        }

        if (!isValidString(description, 10000)) {
            return res.status(400).json({ error: 'Description is required (max 10000 chars).' });
        }

        if (!isValidString(location, 200)) {
            return res.status(400).json({ error: 'Location is required (max 200 chars).' });
        }

        if (!isValidString(category, 50)) {
            return res.status(400).json({ error: 'Category is required (max 50 chars).' });
        }

        // Budget validation
        const minBudget = typeof budget_min === 'number' ? Math.round(budget_min) : null;
        const maxBudget = typeof budget_max === 'number' ? Math.round(budget_max) : null;

        if (minBudget !== null && (!Number.isInteger(minBudget) || minBudget < 0)) {
            return res.status(400).json({ error: 'budget_min must be a non-negative integer.' });
        }

        if (maxBudget !== null && (!Number.isInteger(maxBudget) || maxBudget < 0)) {
            return res.status(400).json({ error: 'budget_max must be a non-negative integer.' });
        }

        if (minBudget !== null && maxBudget !== null && minBudget > maxBudget) {
            return res.status(400).json({ error: 'budget_min cannot exceed budget_max.' });
        }

        // Timeline validation
        const timeline = typeof timeline_days === 'number' ? Math.round(timeline_days) : null;
        if (timeline !== null && (!Number.isInteger(timeline) || timeline < 1 || timeline > 3650)) {
            return res.status(400).json({ error: 'timeline_days must be between 1 and 3650.' });
        }

        // Images validation (optional)
        let validatedImages = null;
        if (images !== undefined && images !== null) {
            if (!Array.isArray(images)) {
                return res.status(400).json({ error: 'images must be an array of URLs.' });
            }
            if (images.length > 20) {
                return res.status(400).json({ error: 'Maximum 20 images allowed.' });
            }
            for (const img of images) {
                if (typeof img !== 'string' || img.length > 1000) {
                    return res.status(400).json({ error: 'Each image must be a valid URL (max 1000 chars).' });
                }
                if (!validator.isURL(img, { require_protocol: true, protocols: ['http', 'https'] })) {
                    return res.status(400).json({ error: 'Each image must be a valid HTTP/HTTPS URL.' });
                }
            }
            validatedImages = JSON.stringify(images);
        }

        // --- Get the homeowner user record ---
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // --- Insert project ---
        const result = await db.query(
            `INSERT INTO projects
             (homeowner_id, title, description, category, location, budget_min, budget_max,
              timeline_days, images, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
             RETURNING *`,
            [
                user.id,
                title.trim(),
                description.trim(),
                category.trim().toLowerCase(),
                location.trim(),
                minBudget,
                maxBudget,
                timeline,
                validatedImages,
                'open',
            ]
        );

        const project = result.rows[0];

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Project created: id=${project.id}, title="${title.trim()}", homeowner=${user.id}`);

        return res.status(201).json({
            id: project.id,
            title: project.title,
            description: project.description,
            category: project.category,
            location: project.location,
            budget_min: project.budget_min,
            budget_max: project.budget_max,
            timeline_days: project.timeline_days,
            images: images || [],
            status: project.status,
            homeowner_id: project.homeowner_id,
            created_at: project.created_at,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to create project.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// GET /api/projects — List projects with filters
// ---------------------------------------------------------------------------
// Query params: ?status=open&category=roofing&location=Seattle&sort=newest&page=1&limit=20
// ---------------------------------------------------------------------------

router.get('/', requireAuth, async (req, res) => {
    const errorId = generateErrorId();

    try {
        // --- Parse query parameters ---
        const {
            status,
            category,
            location: locationFilter,
            sort,
            page: pageStr,
            limit: limitStr,
        } = req.query;

        // Validation
        const VALID_STATUSES = ['open', 'bidding', 'in_progress', 'completed', 'cancelled'];
        const VALID_SORTS = ['newest', 'oldest', 'budget_asc', 'budget_desc'];

        let page = parseInt(pageStr || '1', 10);
        let limit = parseInt(limitStr || '20', 10);

        if (isNaN(page) || page < 1) page = 1;
        if (isNaN(limit) || limit < 1) limit = 20;
        if (limit > 100) limit = 100; // Cap at 100 per page

        const offset = (page - 1) * limit;

        // Build WHERE clause dynamically (safely)
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        if (status) {
            if (!VALID_STATUSES.includes(status)) {
                return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}.` });
            }
            conditions.push(`p.status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }

        if (category) {
            conditions.push(`LOWER(p.category) = LOWER($${paramIndex})`);
            params.push(category.trim());
            paramIndex++;
        }

        if (locationFilter) {
            conditions.push(`p.location ILIKE $${paramIndex}`);
            params.push(`%${locationFilter.trim()}%`);
            paramIndex++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Build ORDER BY
        let orderBy = 'p.created_at DESC'; // newest default
        if (sort) {
            if (!VALID_SORTS.includes(sort)) {
                return res.status(400).json({ error: `Invalid sort. Must be one of: ${VALID_SORTS.join(', ')}.` });
            }
            switch (sort) {
                case 'newest':
                    orderBy = 'p.created_at DESC';
                    break;
                case 'oldest':
                    orderBy = 'p.created_at ASC';
                    break;
                case 'budget_asc':
                    orderBy = 'p.budget_min ASC NULLS LAST';
                    break;
                case 'budget_desc':
                    orderBy = 'p.budget_max DESC NULLS LAST';
                    break;
            }
        }

        // --- Count total for pagination ---
        const countQuery = `SELECT COUNT(*) as total FROM projects p ${whereClause}`;
        const countResult = await db.query(countQuery, params);
        const totalCount = parseInt(countResult.rows[0].total, 10);

        // --- Fetch projects with homeowner info ---
        const selectQuery = `
            SELECT
                p.id, p.homeowner_id, p.title, p.description, p.category,
                p.location, p.budget_min, p.budget_max, p.timeline_days,
                p.images, p.status, p.created_at, p.updated_at,
                u.email as homeowner_email, u.xpr_account as homeowner_account
            FROM projects p
            JOIN users u ON p.homeowner_id = u.id
            ${whereClause}
            ORDER BY ${orderBy}
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limit, offset);

        const projects = await db.select(selectQuery, params);

        // Parse images JSON
        const parsedProjects = projects.map((proj) => ({
            ...proj,
            images: proj.images ? (typeof proj.images === 'string' ? JSON.parse(proj.images) : proj.images) : [],
        }));

        return res.status(200).json({
            projects: parsedProjects,
            pagination: {
                page,
                limit,
                total: totalCount,
                total_pages: Math.ceil(totalCount / limit),
            },
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to retrieve projects.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// GET /api/projects/:id — Get single project with bids
// ---------------------------------------------------------------------------

router.get('/:id', requireAuth, async (req, res) => {
    const errorId = generateErrorId();

    try {
        const projectId = parseInt(req.params.id, 10);

        if (isNaN(projectId) || projectId < 1) {
            return res.status(400).json({ error: 'Invalid project ID.' });
        }

        // --- Fetch project with homeowner info ---
        const project = await db.selectOne(
            `SELECT
                p.*,
                u.email as homeowner_email,
                u.xpr_account as homeowner_account
             FROM projects p
             JOIN users u ON p.homeowner_id = u.id
             WHERE p.id = $1`,
            [projectId]
        );

        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
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

        // Parse images
        const images = project.images
            ? (typeof project.images === 'string' ? JSON.parse(project.images) : project.images)
            : [];

        return res.status(200).json({
            id: project.id,
            homeowner_id: project.homeowner_id,
            homeowner_email: project.homeowner_email,
            homeowner_account: project.homeowner_account,
            title: project.title,
            description: project.description,
            category: project.category,
            location: project.location,
            budget_min: project.budget_min,
            budget_max: project.budget_max,
            timeline_days: project.timeline_days,
            images,
            status: project.status,
            created_at: project.created_at,
            updated_at: project.updated_at,
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
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to retrieve project.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// PUT /api/projects/:id — Update project (owner only)
// ---------------------------------------------------------------------------
// Only allowed if project status is 'open' or 'bidding'.
// ---------------------------------------------------------------------------

router.put('/:id', requireAuth, requireRole(['homeowner']), async (req, res) => {
    const requestId = req.requestId || 'proj-req';
    const errorId = generateErrorId();

    try {
        const projectId = parseInt(req.params.id, 10);

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

        // --- Get existing project ---
        const project = await db.selectOne(
            'SELECT * FROM projects WHERE id = $1',
            [projectId]
        );

        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        // --- Ownership check ---
        if (project.homeowner_id !== user.id) {
            return res.status(403).json({ error: 'Only the project owner can update this project.' });
        }

        // --- Status check: only open/bidding projects can be edited ---
        if (project.status !== 'open' && project.status !== 'bidding') {
            return res.status(400).json({
                error: `Cannot edit a project with status '${project.status}'. Only 'open' and 'bidding' projects can be updated.`,
            });
        }

        // --- Validate update fields ---
        const {
            title,
            description,
            budget_min,
            budget_max,
            location,
            category,
            timeline_days,
            images,
        } = req.body;

        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (title !== undefined) {
            if (!isValidString(title, 200)) {
                return res.status(400).json({ error: 'Title must be a non-empty string (max 200 chars).' });
            }
            updates.push(`title = $${paramIndex}`);
            params.push(title.trim());
            paramIndex++;
        }

        if (description !== undefined) {
            if (!isValidString(description, 10000)) {
                return res.status(400).json({ error: 'Description must be a non-empty string (max 10000 chars).' });
            }
            updates.push(`description = $${paramIndex}`);
            params.push(description.trim());
            paramIndex++;
        }

        if (location !== undefined) {
            if (!isValidString(location, 200)) {
                return res.status(400).json({ error: 'Location must be a non-empty string (max 200 chars).' });
            }
            updates.push(`location = $${paramIndex}`);
            params.push(location.trim());
            paramIndex++;
        }

        if (category !== undefined) {
            if (!isValidString(category, 50)) {
                return res.status(400).json({ error: 'Category must be a non-empty string (max 50 chars).' });
            }
            updates.push(`category = $${paramIndex}`);
            params.push(category.trim().toLowerCase());
            paramIndex++;
        }

        if (budget_min !== undefined) {
            const val = typeof budget_min === 'number' ? Math.round(budget_min) : null;
            if (val === null || !Number.isInteger(val) || val < 0) {
                return res.status(400).json({ error: 'budget_min must be a non-negative integer.' });
            }
            updates.push(`budget_min = $${paramIndex}`);
            params.push(val);
            paramIndex++;
        }

        if (budget_max !== undefined) {
            const val = typeof budget_max === 'number' ? Math.round(budget_max) : null;
            if (val === null || !Number.isInteger(val) || val < 0) {
                return res.status(400).json({ error: 'budget_max must be a non-negative integer.' });
            }
            updates.push(`budget_max = $${paramIndex}`);
            params.push(val);
            paramIndex++;
        }

        if (budget_min !== undefined || budget_max !== undefined) {
            // Validate min <= max after update
            // Need to check the resulting values
            const currentProject = await db.selectOne(
                'SELECT budget_min, budget_max FROM projects WHERE id = $1',
                [projectId]
            );
            const newMin = budget_min !== undefined ? (typeof budget_min === 'number' ? Math.round(budget_min) : null) : currentProject.budget_min;
            const newMax = budget_max !== undefined ? (typeof budget_max === 'number' ? Math.round(budget_max) : null) : currentProject.budget_max;
            if (newMin !== null && newMax !== null && newMin > newMax) {
                return res.status(400).json({ error: 'budget_min cannot exceed budget_max.' });
            }
        }

        if (timeline_days !== undefined) {
            const val = Math.round(timeline_days);
            if (!Number.isInteger(val) || val < 1 || val > 3650) {
                return res.status(400).json({ error: 'timeline_days must be between 1 and 3650.' });
            }
            updates.push(`timeline_days = $${paramIndex}`);
            params.push(val);
            paramIndex++;
        }

        if (images !== undefined) {
            if (images === null) {
                updates.push(`images = $${paramIndex}`);
                params.push(null);
                paramIndex++;
            } else {
                if (!Array.isArray(images) || images.length > 20) {
                    return res.status(400).json({ error: 'images must be an array of max 20 URLs.' });
                }
                for (const img of images) {
                    if (typeof img !== 'string' || img.length > 1000) {
                        return res.status(400).json({ error: 'Each image must be a valid URL (max 1000 chars).' });
                    }
                }
                updates.push(`images = $${paramIndex}`);
                params.push(JSON.stringify(images));
                paramIndex++;
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields provided to update.' });
        }

        // Add project_id to params
        params.push(projectId);

        const updateQuery = `UPDATE projects SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        const result = await db.query(updateQuery, params);
        const updatedProject = result.rows[0];

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Project updated: id=${projectId}`);

        return res.status(200).json({
            id: updatedProject.id,
            title: updatedProject.title,
            description: updatedProject.description,
            category: updatedProject.category,
            location: updatedProject.location,
            budget_min: updatedProject.budget_min,
            budget_max: updatedProject.budget_max,
            timeline_days: updatedProject.timeline_days,
            images: updatedProject.images ? (typeof updatedProject.images === 'string' ? JSON.parse(updatedProject.images) : updatedProject.images) : [],
            status: updatedProject.status,
            updated_at: updatedProject.updated_at,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to update project.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// DELETE /api/projects/:id — Delete project (owner only)
// ---------------------------------------------------------------------------
// Only allowed if status is 'draft', 'open', or 'bidding' (no active work).
// ---------------------------------------------------------------------------

router.delete('/:id', requireAuth, requireRole(['homeowner']), async (req, res) => {
    const requestId = req.requestId || 'proj-req';
    const errorId = generateErrorId();

    try {
        const projectId = parseInt(req.params.id, 10);

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

        // --- Get project ---
        const project = await db.selectOne(
            'SELECT * FROM projects WHERE id = $1',
            [projectId]
        );

        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        // --- Ownership check ---
        if (project.homeowner_id !== user.id) {
            return res.status(403).json({ error: 'Only the project owner can delete this project.' });
        }

        // --- Status check ---
        const deletableStatuses = ['open', 'bidding'];
        if (!deletableStatuses.includes(project.status)) {
            return res.status(400).json({
                error: `Cannot delete a project with status '${project.status}'. Only 'open' or 'bidding' projects can be deleted.`,
            });
        }

        // --- Delete project (bids cascade) ---
        await db.query('DELETE FROM projects WHERE id = $1', [projectId]);

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Project deleted: id=${projectId}`);

        return res.status(200).json({
            message: 'Project deleted successfully.',
            project_id: projectId,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to delete project.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:id/close — Close project to new bids
// ---------------------------------------------------------------------------
// Sets status to 'closed', notifies all bidders.
// ---------------------------------------------------------------------------

router.post('/:id/close', requireAuth, requireRole(['homeowner']), async (req, res) => {
    const requestId = req.requestId || 'proj-req';
    const errorId = generateErrorId();

    try {
        const projectId = parseInt(req.params.id, 10);

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

        // --- Get project ---
        const project = await db.selectOne(
            'SELECT * FROM projects WHERE id = $1',
            [projectId]
        );

        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        // --- Ownership check ---
        if (project.homeowner_id !== user.id) {
            return res.status(403).json({ error: 'Only the project owner can close this project.' });
        }

        // --- Status check ---
        if (project.status !== 'open' && project.status !== 'bidding') {
            return res.status(400).json({
                error: `Cannot close a project with status '${project.status}'.`,
            });
        }

        // --- Update project status ---
        await db.query(
            `UPDATE projects SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
            [projectId]
        );

        // --- Reject all pending bids ---
        const pendingBids = await db.query(
            `UPDATE bids SET status = 'rejected', updated_at = NOW()
             WHERE project_id = $1 AND status = 'pending' RETURNING contractor_id`,
            [projectId]
        );

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Project closed: id=${projectId}, ${pendingBids.rowCount} bids rejected`);

        return res.status(200).json({
            message: 'Project closed successfully.',
            project_id: projectId,
            bids_rejected: pendingBids.rowCount,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to close project.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// GET /api/projects/my/projects — Get current user's projects
// ---------------------------------------------------------------------------
// Returns both homeowner projects and contractor bids (depending on role).
// ---------------------------------------------------------------------------

router.get('/my/projects', requireAuth, async (req, res) => {
    const errorId = generateErrorId();

    try {
        // --- Get user ---
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        let projects = [];

        if (user.role === 'homeowner') {
            // Get all projects posted by this homeowner
            projects = await db.select(
                `SELECT
                    p.id, p.homeowner_id, p.title, p.description,
                    p.category, p.location, p.budget_min, p.budget_max,
                    p.timeline_days, p.images, p.status,
                    p.created_at, p.updated_at,
                    (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) as bid_count
                 FROM projects p
                 WHERE p.homeowner_id = $1
                 ORDER BY p.created_at DESC`,
                [user.id]
            );
        } else if (user.role === 'contractor') {
            // Get all projects this contractor has bid on, plus open projects
            projects = await db.select(
                `SELECT DISTINCT
                    p.id, p.homeowner_id, p.title, p.description,
                    p.category, p.location, p.budget_min, p.budget_max,
                    p.timeline_days, p.images, p.status,
                    p.created_at, p.updated_at,
                    b.id as bid_id, b.amount as bid_amount, b.status as bid_status,
                    b.timeline_days as bid_timeline
                 FROM projects p
                 LEFT JOIN bids b ON p.id = b.project_id AND b.contractor_id = $1
                 WHERE p.status IN ('open', 'bidding')
                    OR b.contractor_id = $1
                 ORDER BY p.created_at DESC`,
                [user.id]
            );
        }

        // Parse images JSON for each project
        const parsedProjects = projects.map((proj) => ({
            ...proj,
            images: proj.images ? (typeof proj.images === 'string' ? JSON.parse(proj.images) : proj.images) : [],
        }));

        return res.status(200).json({
            projects: parsedProjects,
            role: user.role,
            count: parsedProjects.length,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to retrieve user projects.', err, errorId);
    }
});

module.exports = router;
