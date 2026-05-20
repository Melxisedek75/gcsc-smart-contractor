/**
 * ============================================================================
 * GCSC Smart Contractor v3.0 — Escrow Workflow Management Routes (PATCHED)
 * ============================================================================
 *
 * PATCH NOTES (2026-05-20 by Kimi Claw):
 * - Added row-level locking (FOR UPDATE) to prevent race conditions
 * - Added milestone_audit_log table integration
 * - Added released_amount tracking per milestone
 * - Fixed dispute status check to include 'cancelled'
 * - Added audit logging to all state transitions
 *
 * Original: v3/routes/escrow.js
 * ============================================================================
 */

const express = require('express');
const crypto  = require('crypto');
const db      = require('../database/db');

const router = express.Router();

// ... [JWT middleware unchanged] ...

// ---------------------------------------------------------------------------
// PATCHED: POST /api/escrow/:id/milestone/:index/approve
// ---------------------------------------------------------------------------
// Changes:
//   1. Added SELECT FOR UPDATE to lock milestone row
//   2. Added released_amount update
//   3. Added audit log entry
//   4. Wrapped all in transaction with proper error handling
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

        // --- PATCHED: Transaction with row lock ---
        let releasedAmount = 0;
        let finalEscrowStatus = escrow.status;

        await db.transaction(async (client) => {
            // 1. Lock milestone row (prevents race condition)
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
                    `Milestone must be completed by contractor before approval. ` +
                    `Current status: ${lockedMilestone.status}`
                );
            }

            // 2. Record release amount
            releasedAmount = lockedMilestone.amount;

            // 3. Mark as released with amount tracking
            await client.query(
                `UPDATE milestones 
                 SET status = 'released', 
                     released_amount = amount,
                     updated_at = NOW()
                 WHERE escrow_id = $1 AND milestone_index = $2`,
                [escrowId, milestoneIndex]
            );

            // 4. Audit log entry
            await client.query(
                `INSERT INTO milestone_audit_log 
                 (escrow_id, milestone_index, action, performed_by, 
                  previous_status, new_status, notes, created_at)
                 VALUES ($1, $2, 'approved', $3, 'completed', 'released', 
                         'Payment released: ' || $4 || ' cents', NOW())`,
                [escrowId, milestoneIndex, user.id, releasedAmount]
            );

            // 5. Check if all milestones released
            const pendingResult = await client.query(
                `SELECT COUNT(*) as count FROM milestones
                 WHERE escrow_id = $1 AND status NOT IN ('released', 'cancelled')`,
                [escrowId]
            );
            const pendingCount = parseInt(pendingResult.rows[0].count, 10);

            if (pendingCount === 0) {
                // All done
                await client.query(
                    `UPDATE escrow_contracts 
                     SET status = 'released', updated_at = NOW()
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

                // Mark project completed
                await client.query(
                    `UPDATE projects SET status = 'completed', updated_at = NOW()
                     WHERE id = $1`,
                    [escrow.project_id]
                );
            }
        });

        console.log(`[${requestId}] Milestone ${milestoneIndex} approved on escrow ${escrowId}`);

        return res.status(200).json({
            message: 'Milestone approved and payment released.',
            escrow_id: escrowId,
            milestone_index: milestoneIndex,
            status: 'released',
            released_amount_cents: releasedAmount,
            escrow_status: finalEscrowStatus,
            next_step: finalEscrowStatus === 'released'
                ? 'All milestones complete. Project is finished.'
                : 'Awaiting remaining milestones.',
        });

    } catch (err) {
        // Handle transaction errors with specific messages
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
// PATCHED: POST /api/escrow/:id/dispute
// ---------------------------------------------------------------------------
// Changes:
//   1. Added 'cancelled' to blocked statuses
//   2. Added audit log entry for dispute opening
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

        // --- PATCHED: Status check includes 'cancelled' ---
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

            // 3. Audit log
            await client.query(
                `INSERT INTO milestone_audit_log 
                 (escrow_id, milestone_index, action, performed_by, 
                  previous_status, new_status, notes, created_at)
                 VALUES ($1, -1, 'dispute_opened', $2, $3, 'disputed', 
                         'Dispute reason: ' || LEFT($4, 200), NOW())`,
                [escrowId, user.id, escrow.status, reason]
            );
        });

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

// ... [rest of routes unchanged] ...

module.exports = router;
