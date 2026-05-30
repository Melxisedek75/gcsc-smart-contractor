/**
 * ============================================================================
 * GCSC Smart Contractor v3.0 — Escrow Workflow Management Routes
 * ============================================================================
 *
 * Escrow lifecycle management including milestone tracking, completion
 * approval, dispute handling, and dashboard statistics.
 *
 * Endpoints:
 *   GET    /api/escrow/:id                          — Get escrow details
 *   POST   /api/escrow/:id/milestone/:index/complete — Mark milestone complete (contractor)
 *   POST   /api/escrow/:id/milestone/:index/approve  — Approve milestone (homeowner) -> release
 *   POST   /api/escrow/:id/dispute                   — Open dispute (either party)
 *   GET    /api/escrow/my/escrows                    — List user's escrows
 *   GET    /api/escrow/stats                         — Escrow statistics
 *
 * Security:
 *   - All endpoints require JWT authentication
 *   - Ownership/participation checks on all escrow operations
 *   - Parameterized queries prevent SQL injection
 *   - Input validation on all user-provided fields
 * ============================================================================
 */

const express = require('express');
const crypto  = require('crypto');
const db      = require('../database/db');
const { requireAuth } = require('../middleware/auth');
const { settleMilestoneRelease } = require('../services/settlement');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function generateErrorId() {
    return crypto.randomBytes(6).toString('hex');
}

function sendError(res, status, message, err = null, errorId = '') {
    if (err && errorId) {
        // eslint-disable-next-line no-console
        console.error(`[Escrow:${errorId}]`, err.message || '', err.stack || '');
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
// GET /api/escrow/:id — Get escrow details with milestones
// ---------------------------------------------------------------------------

router.get('/:id', requireAuth, async (req, res) => {
    const errorId = generateErrorId();

    try {
        const escrowId = parseInt(req.params.id, 10);

        if (isNaN(escrowId) || escrowId < 1) {
            return res.status(400).json({ error: 'Invalid escrow ID.' });
        }

        // --- Get user ---
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // --- Get escrow with project and party info ---
        const escrow = await db.selectOne(
            `SELECT
                e.*,
                p.title as project_title,
                ho.email as homeowner_email,
                ho.xpr_account as homeowner_account,
                co.email as contractor_email,
                co.xpr_account as contractor_account,
                b.amount as bid_amount,
                b.timeline_days as bid_timeline
             FROM escrow_contracts e
             JOIN projects p ON e.project_id = p.id
             JOIN users ho ON e.homeowner_id = ho.id
             JOIN users co ON e.contractor_id = co.id
             JOIN bids b ON e.bid_id = b.id
             WHERE e.id = $1`,
            [escrowId]
        );

        if (!escrow) {
            return res.status(404).json({ error: 'Escrow not found.' });
        }

        // --- Access check: user must be homeowner or contractor ---
        if (escrow.homeowner_id !== user.id && escrow.contractor_id !== user.id) {
            return res.status(403).json({ error: 'Access denied. You are not a party to this escrow.' });
        }

        // --- Get milestones ---
        const milestones = await db.select(
            `SELECT * FROM milestones
             WHERE escrow_id = $1
             ORDER BY milestone_index ASC`,
            [escrowId]
        );

        // --- Get active disputes if any ---
        const disputes = await db.select(
            `SELECT d.*, u.email as opened_by_email
             FROM escrow_disputes d
             JOIN users u ON d.opened_by = u.id
             WHERE d.escrow_id = $1
             ORDER BY d.created_at DESC`,
            [escrowId]
        );

        // --- Get payment info ---
        const payments = await db.select(
            `SELECT * FROM stripe_payment_intents
             WHERE project_id = $1
             ORDER BY created_at DESC`,
            [escrow.project_id]
        );

        return res.status(200).json({
            escrow: {
                id: escrow.id,
                project_id: escrow.project_id,
                project_title: escrow.project_title,
                bid_id: escrow.bid_id,
                homeowner_id: escrow.homeowner_id,
                homeowner_email: escrow.homeowner_email,
                homeowner_account: escrow.homeowner_account,
                contractor_id: escrow.contractor_id,
                contractor_email: escrow.contractor_email,
                contractor_account: escrow.contractor_account,
                amount: escrow.amount,
                xpr_transaction_id: escrow.xpr_transaction_id,
                status: escrow.status,
                created_at: escrow.created_at,
                updated_at: escrow.updated_at,
            },
            milestones: milestones.map((m) => ({
                id: m.id,
                milestone_index: m.milestone_index,
                description: m.description,
                amount: m.amount,
                status: m.status,
                created_at: m.created_at,
                updated_at: m.updated_at,
            })),
            disputes: disputes.map((d) => ({
                id: d.id,
                opened_by: d.opened_by_email,
                reason: d.reason,
                status: d.status,
                resolution: d.resolution,
                created_at: d.created_at,
                resolved_at: d.resolved_at,
            })),
            payments: payments.map((p) => ({
                payment_intent_id: p.payment_intent_id,
                amount_cents: p.amount_cents,
                status: p.status,
                created_at: p.created_at,
            })),
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to retrieve escrow details.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// POST /api/escrow/:id/milestone/:index/complete — Mark milestone complete
// ---------------------------------------------------------------------------
// Contractor marks a milestone as completed.
// ---------------------------------------------------------------------------

router.post('/:id/milestone/:index/complete', requireAuth, async (req, res) => {
    const requestId = req.requestId || 'esc-req';
    const errorId = generateErrorId();

    try {
        const escrowId = parseInt(req.params.id, 10);
        const milestoneIndex = parseInt(req.params.index, 10);

        if (isNaN(escrowId) || escrowId < 1) {
            return res.status(400).json({ error: 'Invalid escrow ID.' });
        }

        if (isNaN(milestoneIndex) || milestoneIndex < 0) {
            return res.status(400).json({ error: 'Invalid milestone index.' });
        }

        // --- Get user ---
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // --- Get escrow ---
        const escrow = await db.selectOne(
            'SELECT * FROM escrow_contracts WHERE id = $1',
            [escrowId]
        );

        if (!escrow) {
            return res.status(404).json({ error: 'Escrow not found.' });
        }

        // --- Contractor check ---
        if (escrow.contractor_id !== user.id) {
            return res.status(403).json({ error: 'Only the contractor can mark milestones as complete.' });
        }

        // --- Escrow status check ---
        if (escrow.status !== 'funded' && escrow.status !== 'released') {
            return res.status(400).json({
                error: `Cannot complete milestones on an escrow with status '${escrow.status}'.`,
            });
        }

        // --- Get milestone ---
        const milestone = await db.selectOne(
            `SELECT * FROM milestones WHERE escrow_id = $1 AND milestone_index = $2`,
            [escrowId, milestoneIndex]
        );

        if (!milestone) {
            return res.status(404).json({ error: 'Milestone not found.' });
        }

        if (milestone.status !== 'pending') {
            return res.status(400).json({
                error: `Milestone is already ${milestone.status}.`,
            });
        }

        // --- Mark milestone as completed ---
        await db.query(
            `UPDATE milestones SET status = 'completed', updated_at = NOW()
             WHERE escrow_id = $1 AND milestone_index = $2`,
            [escrowId, milestoneIndex]
        );

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Milestone ${milestoneIndex} completed on escrow ${escrowId}`);

        return res.status(200).json({
            message: 'Milestone marked as completed. Awaiting homeowner approval for payment release.',
            escrow_id: escrowId,
            milestone_index: milestoneIndex,
            status: 'completed',
            next_step: 'Homeowner must approve the milestone to release payment.',
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to complete milestone.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// POST /api/escrow/:id/milestone/:index/approve — Approve milestone
// ---------------------------------------------------------------------------
// Homeowner approves a completed milestone, triggering payment release.
// ---------------------------------------------------------------------------

router.post('/:id/milestone/:index/approve', requireAuth, async (req, res) => {
    const requestId = req.requestId || 'esc-req';
    const errorId = generateErrorId();

    try {
        const escrowId = parseInt(req.params.id, 10);
        const milestoneIndex = parseInt(req.params.index, 10);

        if (isNaN(escrowId) || escrowId < 1) {
            return res.status(400).json({ error: 'Invalid escrow ID.' });
        }

        if (isNaN(milestoneIndex) || milestoneIndex < 0) {
            return res.status(400).json({ error: 'Invalid milestone index.' });
        }

        // --- Get user ---
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // --- Get escrow ---
        const escrow = await db.selectOne(
            'SELECT * FROM escrow_contracts WHERE id = $1',
            [escrowId]
        );

        if (!escrow) {
            return res.status(404).json({ error: 'Escrow not found.' });
        }

        // --- Homeowner check ---
        if (escrow.homeowner_id !== user.id) {
            return res.status(403).json({ error: 'Only the homeowner can approve milestones.' });
        }

        // --- Approve and release (transaction with row-level lock) ---
        // SECURITY: the milestone row is locked with SELECT ... FOR UPDATE and its
        // status re-checked INSIDE the transaction to prevent a TOCTOU race where
        // two concurrent approve requests both pass an outside-the-lock check and
        // release the same milestone twice.
        let releasedAmount = 0;
        let finalEscrowStatus = escrow.status;

        await db.transaction(async (client) => {
            // 1. Lock the milestone row (prevents concurrent double-release)
            const lockResult = await client.query(
                `SELECT * FROM milestones
                 WHERE escrow_id = $1 AND milestone_index = $2
                 FOR UPDATE`,
                [escrowId, milestoneIndex]
            );

            if (lockResult.rows.length === 0) {
                throw new Error('Milestone not found');
            }

            const lockedMilestone = lockResult.rows[0];

            if (lockedMilestone.status !== 'completed') {
                throw new Error(
                    `Milestone must be completed by the contractor before approval. ` +
                    `Current status: ${lockedMilestone.status}`
                );
            }

            // 2. Record release amount (in cents)
            releasedAmount = lockedMilestone.amount;

            // 3. Mark milestone as released, tracking the released amount
            await client.query(
                `UPDATE milestones
                 SET status = 'released',
                     released_amount = amount,
                     updated_at = NOW()
                 WHERE escrow_id = $1 AND milestone_index = $2`,
                [escrowId, milestoneIndex]
            );

            // 4. Audit log entry for the milestone release
            await client.query(
                `INSERT INTO milestone_audit_log
                 (escrow_id, milestone_index, action, performed_by,
                  previous_status, new_status, notes, created_at)
                 VALUES ($1, $2, 'approved', $3, 'completed', 'released',
                         'Payment released: ' || $4 || ' cents', NOW())`,
                [escrowId, milestoneIndex, user.id, releasedAmount]
            );

            // 5. Check if all milestones are now released
            const pendingResult = await client.query(
                `SELECT COUNT(*) as count FROM milestones
                 WHERE escrow_id = $1 AND status NOT IN ('released', 'cancelled')`,
                [escrowId]
            );
            const pendingCount = parseInt(pendingResult.rows[0].count, 10);

            if (pendingCount === 0) {
                // All milestones released — mark escrow as released
                await client.query(
                    `UPDATE escrow_contracts SET status = 'released', updated_at = NOW()
                     WHERE id = $1`,
                    [escrowId]
                );
                finalEscrowStatus = 'released';

                // Audit log for escrow completion
                await client.query(
                    `INSERT INTO milestone_audit_log
                     (escrow_id, milestone_index, action, performed_by,
                      previous_status, new_status, notes, created_at)
                     VALUES ($1, -1, 'escrow_completed', $2, 'funded', 'released',
                             'All milestones released', NOW())`,
                    [escrowId, user.id]
                );

                // Mark project as completed
                await client.query(
                    `UPDATE projects SET status = 'completed', updated_at = NOW()
                     WHERE id = $1`,
                    [escrow.project_id]
                );
            }

            // NOTE (payout integration): the DB status is now 'released'. The ACTUAL
            // transfer of funds to the contractor (Stripe Connect transfer / XPR
            // on-chain release) must be performed by the settlement layer keyed on
            // this audit-log entry so the DB status and real money movement stay in
            // sync. See XPR-ESCROW-SETTLEMENT-SPEC.md. Do NOT mark released here
            // without a corresponding settlement record.
        });

        // --- Real settlement (Stripe Connect transfer to contractor) ---
        // Runs AFTER the release is committed so the DB lock is short-lived and an
        // external payment failure can never roll back a confirmed release. Real
        // money only moves when SETTLEMENT_ENABLED=true (see services/settlement.js).
        const payout = await settleMilestoneRelease({
            escrowId,
            milestoneIndex,
            amountCents: releasedAmount,
            escrow,
            requestId,
        });

        if (!payout.settled && payout.reason !== 'settlement_disabled') {
            // eslint-disable-next-line no-console
            console.warn(`[${requestId}] Milestone ${milestoneIndex} released but payout not completed (${payout.reason}). Retry via POST /api/stripe/create-payout.`);
        }

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Milestone ${milestoneIndex} approved on escrow ${escrowId}`);

        return res.status(200).json({
            message: 'Milestone approved and payment released.',
            escrow_id: escrowId,
            milestone_index: milestoneIndex,
            status: 'released',
            released_amount_cents: releasedAmount,
            payout,
            escrow_status: finalEscrowStatus,
            next_step: finalEscrowStatus === 'released'
                ? 'All milestones complete. Project is finished.'
                : 'Awaiting remaining milestones.',
        });

    } catch (err) {
        if (err.message && err.message.includes('Milestone must be completed')) {
            return res.status(400).json({ error: err.message });
        }
        if (err.message && err.message.includes('Milestone not found')) {
            return res.status(404).json({ error: err.message });
        }
        return sendError(res, 500, 'Failed to approve milestone.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// POST /api/escrow/:id/dispute — Open dispute
// ---------------------------------------------------------------------------
// Body: { reason, evidence? }
// ---------------------------------------------------------------------------

router.post('/:id/dispute', requireAuth, async (req, res) => {
    const requestId = req.requestId || 'esc-req';
    const errorId = generateErrorId();

    try {
        const escrowId = parseInt(req.params.id, 10);

        if (isNaN(escrowId) || escrowId < 1) {
            return res.status(400).json({ error: 'Invalid escrow ID.' });
        }

        const { reason, evidence } = req.body;

        // --- Input validation ---
        if (!isValidString(reason, 2000)) {
            return res.status(400).json({ error: 'reason is required (max 2000 chars).' });
        }

        // Optional evidence validation
        let validatedEvidence = null;
        if (evidence !== undefined && evidence !== null) {
            if (!Array.isArray(evidence)) {
                return res.status(400).json({ error: 'evidence must be an array of strings.' });
            }
            if (evidence.length > 10) {
                return res.status(400).json({ error: 'Maximum 10 evidence items.' });
            }
            for (const item of evidence) {
                if (typeof item !== 'string' || item.length > 2000) {
                    return res.status(400).json({ error: 'Each evidence item must be a string (max 2000 chars).' });
                }
            }
            validatedEvidence = JSON.stringify(evidence);
        }

        // --- Get user ---
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // --- Get escrow ---
        const escrow = await db.selectOne(
            'SELECT * FROM escrow_contracts WHERE id = $1',
            [escrowId]
        );

        if (!escrow) {
            return res.status(404).json({ error: 'Escrow not found.' });
        }

        // --- Access check ---
        if (escrow.homeowner_id !== user.id && escrow.contractor_id !== user.id) {
            return res.status(403).json({ error: 'Only the homeowner or contractor can open a dispute.' });
        }

        // --- Status check (also blocks 'cancelled') ---
        if (escrow.status === 'disputed') {
            return res.status(400).json({ error: 'Escrow is already in dispute.' });
        }

        if (['refunded', 'released', 'cancelled'].includes(escrow.status)) {
            return res.status(400).json({ error: 'Cannot dispute a completed or cancelled escrow.' });
        }

        // --- Open dispute (transaction) ---
        await db.transaction(async (client) => {
            // 1. Update escrow status
            await client.query(
                `UPDATE escrow_contracts SET status = 'disputed', updated_at = NOW() WHERE id = $1`,
                [escrowId]
            );

            // 2. Create dispute record
            await client.query(
                `INSERT INTO escrow_disputes
                 (escrow_id, opened_by, reason, evidence, status, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [escrowId, user.id, reason, validatedEvidence, 'open']
            );

            // 3. Audit log entry for dispute opening
            await client.query(
                `INSERT INTO milestone_audit_log
                 (escrow_id, milestone_index, action, performed_by,
                  previous_status, new_status, notes, created_at)
                 VALUES ($1, -1, 'dispute_opened', $2, $3, 'disputed',
                         'Dispute reason: ' || LEFT($4, 200), NOW())`,
                [escrowId, user.id, escrow.status, reason]
            );
        });

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Dispute opened on escrow ${escrowId} by user ${user.id}`);

        return res.status(200).json({
            message: 'Dispute opened successfully. A moderator will review the case.',
            escrow_id: escrowId,
            status: 'disputed',
            reason: escapeHtml(reason),
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to open dispute.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// GET /api/escrow/my/escrows — List user's escrows
// ---------------------------------------------------------------------------
// Returns escrows where the user is either homeowner or contractor.
// ---------------------------------------------------------------------------

router.get('/my/escrows', requireAuth, async (req, res) => {
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

        // --- Get all escrows for this user (as homeowner or contractor) ---
        const escrows = await db.select(
            `SELECT
                e.*,
                p.title as project_title,
                p.category as project_category,
                ho.email as homeowner_email,
                co.email as contractor_email
             FROM escrow_contracts e
             JOIN projects p ON e.project_id = p.id
             JOIN users ho ON e.homeowner_id = ho.id
             JOIN users co ON e.contractor_id = co.id
             WHERE e.homeowner_id = $1 OR e.contractor_id = $1
             ORDER BY e.created_at DESC`,
            [user.id]
        );

        // --- Get milestone summary for each escrow ---
        const escrowIds = escrows.map((e) => e.id);
        let milestoneSummary = [];

        if (escrowIds.length > 0) {
            milestoneSummary = await db.select(
                `SELECT
                    escrow_id,
                    COUNT(*) as total_milestones,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'released') as released
                 FROM milestones
                 WHERE escrow_id = ANY($1)
                 GROUP BY escrow_id`,
                [escrowIds]
            );
        }

        const milestoneMap = new Map();
        for (const ms of milestoneSummary) {
            milestoneMap.set(ms.escrow_id, ms);
        }

        const result = escrows.map((e) => {
            const ms = milestoneMap.get(e.id);
            return {
                id: e.id,
                project_id: e.project_id,
                project_title: e.project_title,
                project_category: e.project_category,
                bid_id: e.bid_id,
                homeowner_email: e.homeowner_email,
                contractor_email: e.contractor_email,
                amount: e.amount,
                status: e.status,
                xpr_transaction_id: e.xpr_transaction_id,
                milestones: ms ? {
                    total: parseInt(ms.total_milestones, 10),
                    pending: parseInt(ms.pending, 10),
                    completed: parseInt(ms.completed, 10),
                    released: parseInt(ms.released, 10),
                } : { total: 0, pending: 0, completed: 0, released: 0 },
                user_role: e.homeowner_id === user.id ? 'homeowner' : 'contractor',
                created_at: e.created_at,
                updated_at: e.updated_at,
            };
        });

        return res.status(200).json({
            escrows: result,
            count: result.length,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to retrieve escrows.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// GET /api/escrow/stats — Get escrow statistics for dashboard
// ---------------------------------------------------------------------------

router.get('/stats', requireAuth, async (req, res) => {
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

        // --- Aggregate stats based on user role ---
        let stats;

        if (user.role === 'homeowner') {
            const result = await db.selectOne(
                `SELECT
                    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
                    COUNT(*) FILTER (WHERE status = 'funded') as funded_count,
                    COUNT(*) FILTER (WHERE status = 'released') as released_count,
                    COUNT(*) FILTER (WHERE status = 'disputed') as disputed_count,
                    COUNT(*) FILTER (WHERE status = 'refunded') as refunded_count,
                    COUNT(*) as total_count,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'released'), 0) as total_released,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'funded'), 0) as total_funded
                 FROM escrow_contracts
                 WHERE homeowner_id = $1`,
                [user.id]
            );

            const recentEscrows = await db.select(
                `SELECT
                    e.id, e.status, e.amount, e.created_at,
                    p.title as project_title
                 FROM escrow_contracts e
                 JOIN projects p ON e.project_id = p.id
                 WHERE e.homeowner_id = $1
                 ORDER BY e.created_at DESC
                 LIMIT 5`,
                [user.id]
            );

            stats = {
                role: 'homeowner',
                overview: {
                    total_escrows: parseInt(result.total_count, 10),
                    pending: parseInt(result.pending_count, 10),
                    funded: parseInt(result.funded_count, 10),
                    released: parseInt(result.released_count, 10),
                    disputed: parseInt(result.disputed_count, 10),
                    refunded: parseInt(result.refunded_count, 10),
                },
                financial: {
                    total_funded_cents: parseInt(result.total_funded, 10),
                    total_released_cents: parseInt(result.total_released, 10),
                },
                recent_escrows: recentEscrows,
            };

        } else {
            // Contractor stats
            const result = await db.selectOne(
                `SELECT
                    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
                    COUNT(*) FILTER (WHERE status = 'funded') as funded_count,
                    COUNT(*) FILTER (WHERE status = 'released') as released_count,
                    COUNT(*) FILTER (WHERE status = 'disputed') as disputed_count,
                    COUNT(*) as total_count,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'released'), 0) as total_earned,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'funded' OR status = 'released'), 0) as total_contracted
                 FROM escrow_contracts
                 WHERE contractor_id = $1`,
                [user.id]
            );

            const recentEscrows = await db.select(
                `SELECT
                    e.id, e.status, e.amount, e.created_at,
                    p.title as project_title
                 FROM escrow_contracts e
                 JOIN projects p ON e.project_id = p.id
                 WHERE e.contractor_id = $1
                 ORDER BY e.created_at DESC
                 LIMIT 5`,
                [user.id]
            );

            stats = {
                role: 'contractor',
                overview: {
                    total_escrows: parseInt(result.total_count, 10),
                    pending: parseInt(result.pending_count, 10),
                    funded: parseInt(result.funded_count, 10),
                    released: parseInt(result.released_count, 10),
                    disputed: parseInt(result.disputed_count, 10),
                },
                financial: {
                    total_contracted_cents: parseInt(result.total_contracted, 10),
                    total_earned_cents: parseInt(result.total_earned, 10),
                },
                recent_escrows: recentEscrows,
            };
        }

        return res.status(200).json(stats);

    } catch (err) {
        return sendError(res, 500, 'Failed to retrieve escrow statistics.', err, errorId);
    }
});

module.exports = router;
