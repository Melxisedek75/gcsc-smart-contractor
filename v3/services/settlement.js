/**
 * ============================================================================
 * GCSC Smart Contractor v3.0 — Milestone Settlement Service
 * ============================================================================
 *
 * Binds the DB "milestone released" event to a REAL Stripe Connect transfer to
 * the contractor's connected account, so the product status and the actual
 * movement of money stay in sync.
 *
 * SAFETY MODEL
 *   - Real money only moves when SETTLEMENT_ENABLED === 'true'. By default the
 *     flag is OFF, so on production nothing is transferred until the founder /
 *     legal / production gates described in XPR-ESCROW-SETTLEMENT-SPEC.md are
 *     complete and the flag is deliberately turned on.
 *   - Double-payout is prevented at THREE layers:
 *       1. The caller releases the milestone under SELECT ... FOR UPDATE.
 *       2. A Stripe idempotency key keyed on (escrow, milestone).
 *       3. A partial UNIQUE index on stripe_payouts(escrow_id, milestone_index).
 *   - A settlement failure NEVER rolls back the already-committed release; it is
 *     reported back to the caller and logged so ops can retry via
 *     POST /api/stripe/create-payout. This avoids a half-state where money moved
 *     but the DB says otherwise.
 *
 * NEVER log Stripe secrets or full transfer objects.
 * ============================================================================
 */

const db = require('../database/db');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

let stripe = null;

function isSettlementEnabled() {
    return process.env.SETTLEMENT_ENABLED === 'true';
}

function getStripe() {
    if (!stripe && STRIPE_SECRET_KEY) {
        // eslint-disable-next-line global-require
        stripe = require('stripe')(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    }
    return stripe;
}

/**
 * Settle a single released milestone by transferring its amount to the
 * contractor's Stripe Connect account.
 *
 * @param {object} args
 * @param {number} args.escrowId
 * @param {number} args.milestoneIndex
 * @param {number} args.amountCents      Milestone amount in cents.
 * @param {object} args.escrow           The escrow row (needs contractor_id, project_id).
 * @param {string} [args.requestId]
 * @returns {Promise<{settled: boolean, reason?: string, payoutId?: string, status?: string}>}
 */
async function settleMilestoneRelease({ escrowId, milestoneIndex, amountCents, escrow, requestId = 'settle' }) {
    if (!isSettlementEnabled()) {
        return { settled: false, reason: 'settlement_disabled' };
    }

    if (!Number.isInteger(amountCents) || amountCents <= 0) {
        return { settled: false, reason: 'invalid_amount' };
    }

    const stripeClient = getStripe();
    if (!stripeClient) {
        return { settled: false, reason: 'stripe_unavailable' };
    }

    try {
        const contractorStripe = await db.selectOne(
            'SELECT * FROM stripe_connect_accounts WHERE user_id = $1',
            [escrow.contractor_id]
        );

        if (!contractorStripe) {
            // eslint-disable-next-line no-console
            console.warn(`[${requestId}] Settlement skipped: contractor ${escrow.contractor_id} has no Stripe Connect account.`);
            return { settled: false, reason: 'no_connect_account' };
        }

        // Idempotency key prevents a duplicate transfer if approve is retried.
        const idempotencyKey = `gcsc-release-esc${escrowId}-ms${milestoneIndex}`;

        const transfer = await stripeClient.transfers.create(
            {
                amount: amountCents,
                currency: 'usd',
                destination: contractorStripe.stripe_account_id,
                description: `Milestone ${milestoneIndex} payout for escrow #${escrowId}`,
                metadata: {
                    gcsc_escrow_id: String(escrowId),
                    gcsc_milestone_index: String(milestoneIndex),
                    gcsc_project_id: String(escrow.project_id),
                    gcsc_contractor_id: String(escrow.contractor_id),
                },
            },
            { idempotencyKey }
        );

        // Record payout; the partial UNIQUE index blocks a second row for the
        // same (escrow, milestone), so ON CONFLICT keeps this idempotent.
        await db.query(
            `INSERT INTO stripe_payouts
             (payout_id, escrow_id, contractor_id, amount_cents, status, milestone_index, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (escrow_id, milestone_index)
                 WHERE milestone_index IS NOT NULL
             DO NOTHING`,
            [transfer.id, escrowId, escrow.contractor_id, amountCents, transfer.status, milestoneIndex]
        );

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Settlement OK: transfer ${transfer.id} for escrow ${escrowId} milestone ${milestoneIndex}`);

        return { settled: true, payoutId: transfer.id, status: transfer.status };
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[${requestId}] Settlement FAILED for escrow ${escrowId} milestone ${milestoneIndex}:`, err.message);
        return { settled: false, reason: 'settlement_error' };
    }
}

module.exports = { isSettlementEnabled, settleMilestoneRelease, getStripe };
