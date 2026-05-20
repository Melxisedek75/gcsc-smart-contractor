/**
 * ============================================================================
 * GCSC Smart Contractor v3.0 — Stripe Payment Processing Routes
 * ============================================================================
 *
 * Handles construction escrow deposits and contractor payouts via Stripe.
 * All monetary amounts are in USD cents (integer) internally and converted
 * to dollars for Stripe API calls.
 *
 * Endpoints:
 *   POST /api/stripe/create-payment-intent — Create PaymentIntent for funding
 *   POST /api/stripe/webhook               — Handle Stripe webhook events
 *   POST /api/stripe/create-payout         — Create payout to contractor
 *   GET  /api/stripe/payment-methods       — List saved payment methods
 *
 * Security:
 *   - All endpoints (except webhook) require JWT authentication
 *   - Webhook uses Stripe signature verification
 *   - Parameterized queries prevent SQL injection
 *   - Input validation on all user-provided fields
 *   - NEVER log or expose Stripe secrets or client secrets
 * ============================================================================
 */

const express = require('express');
const crypto  = require('crypto');
const db      = require('../database/db');

const router = express.Router();

// ---------------------------------------------------------------------------
// Stripe SDK Initialization
// ---------------------------------------------------------------------------

const STRIPE_SECRET_KEY    = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_CONNECT_CLIENT_ID = process.env.STRIPE_CONNECT_CLIENT_ID || '';

/** @type {import('stripe').Stripe|null} */
let stripe = null;

function getStripe() {
    if (!stripe && STRIPE_SECRET_KEY) {
        stripe = require('stripe')(STRIPE_SECRET_KEY, {
            apiVersion: '2024-12-18.acacia',
            appInfo: {
                name: 'GCSC Smart Contractor',
                version: '3.0.0',
            },
        });
    }
    return stripe;
}

// ---------------------------------------------------------------------------
// JWT Authentication Middleware (inline for self-containment)
// ---------------------------------------------------------------------------

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable is required'); })();

/**
 * Authenticate requests using JWT Bearer token.
 * Attaches decoded user to req.user.
 */
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

            // Check session is valid and not revoked
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
            console.error('[StripeRoute] JWT validation failed:', err.message);
            return res.status(401).json({ error: 'Authentication required.' });
        }
    })();
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Generate a unique error ID for support correlation.
 * @returns {string} Hex-encoded 6-byte error ID
 */
function generateErrorId() {
    return crypto.randomBytes(6).toString('hex');
}

/**
 * Generic error response builder. NEVER sends err.message to client.
 * @param {object} res       - Express response object
 * @param {number} status    - HTTP status code
 * @param {string} message   - Generic public-facing message
 * @param {Error|null} err   - Full error (logged only, never sent)
 * @param {string} errorId   - Support correlation ID
 */
function sendError(res, status, message, err = null, errorId = '') {
    if (err && errorId) {
        // eslint-disable-next-line no-console
        console.error(`[Stripe:${errorId}]`, err.message || '', err.stack || '');
    }
    res.status(status).json({ error: message, ...(errorId && { errorId }) });
}

/**
 * Validate that a value is a positive integer (in cents).
 * @param {*} value
 * @returns {boolean}
 */
function isValidCentsAmount(value) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Validate that a value is a positive integer ID.
 * @param {*} value
 * @returns {boolean}
 */
function isValidId(value) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// ---------------------------------------------------------------------------
// POST /api/stripe/create-payment-intent
// ---------------------------------------------------------------------------
// Create a Stripe PaymentIntent for funding a project's escrow.
// Body: { project_id, amount_usd, milestone_id? }
// Returns: { client_secret, payment_intent_id }
// ---------------------------------------------------------------------------

router.post('/create-payment-intent', requireAuth, async (req, res) => {
    const requestId = req.requestId || 'stripe-req';
    const errorId = generateErrorId();

    try {
        const stripeClient = getStripe();
        if (!stripeClient) {
            return sendError(res, 503, 'Payment service unavailable.', null, errorId);
        }

        // --- Input validation ---
        const { project_id, amount_usd, milestone_id } = req.body;

        if (!isValidId(project_id)) {
            return res.status(400).json({ error: 'Invalid project_id. Must be a positive integer.' });
        }

        if (!isValidCentsAmount(amount_usd)) {
            return res.status(400).json({ error: 'Invalid amount_usd. Must be a positive integer (cents).' });
        }

        // Max amount check: $1,000,000 USD (in cents)
        const MAX_AMOUNT_CENTS = 100_000_000;
        if (amount_usd > MAX_AMOUNT_CENTS) {
            return res.status(400).json({ error: 'Amount exceeds maximum allowed ($1,000,000).' });
        }

        // Optional milestone_id validation
        if (milestone_id !== undefined && !isValidId(milestone_id)) {
            return res.status(400).json({ error: 'Invalid milestone_id. Must be a positive integer.' });
        }

        // --- Verify project exists and user is the homeowner ---
        const project = await db.selectOne(
            'SELECT * FROM projects WHERE id = $1',
            [project_id]
        );

        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        // Get the user's full record for homeowner check
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user || project.homeowner_id !== user.id) {
            return res.status(403).json({ error: 'Only the project owner can fund this escrow.' });
        }

        // --- Check if project can be funded ---
        if (project.status === 'completed' || project.status === 'cancelled') {
            return res.status(400).json({ error: 'Project is already completed or cancelled.' });
        }

        // --- Create Stripe Customer if not exists ---
        let stripeCustomerId = null;
        const existingCustomer = await db.selectOne(
            'SELECT * FROM stripe_customers WHERE user_id = $1',
            [user.id]
        );

        if (existingCustomer) {
            stripeCustomerId = existingCustomer.stripe_customer_id;
        } else {
            const customer = await stripeClient.customers.create({
                email: user.email,
                metadata: {
                    gcsc_user_id: String(user.id),
                    gcsc_account: user.xpr_account,
                },
            });
            stripeCustomerId = customer.id;

            await db.query(
                'INSERT INTO stripe_customers (user_id, stripe_customer_id) VALUES ($1, $2)',
                [user.id, stripeCustomerId]
            );
        }

        // --- Create PaymentIntent ---
        // Convert cents to dollars for Stripe
        const amountDollars = Math.round(amount_usd) / 100;

        const paymentIntent = await stripeClient.paymentIntents.create({
            amount: amount_usd,                      // Amount in cents
            currency: 'usd',
            customer: stripeCustomerId,
            automatic_payment_methods: { enabled: true },
            metadata: {
                gcsc_project_id: String(project_id),
                gcsc_user_id: String(user.id),
                gcsc_account: user.xpr_account,
                ...(milestone_id && { gcsc_milestone_id: String(milestone_id) }),
            },
            description: `Escrow funding for project #${project_id}`,
        });

        // Store payment intent reference in database
        await db.query(
            `INSERT INTO stripe_payment_intents
             (payment_intent_id, project_id, user_id, amount_cents, status, milestone_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [paymentIntent.id, project_id, user.id, amount_usd, paymentIntent.status, milestone_id || null]
        );

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] PaymentIntent created: ${paymentIntent.id} for project ${project_id}`);

        return res.status(200).json({
            client_secret: paymentIntent.client_secret,
            payment_intent_id: paymentIntent.id,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to create payment intent.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// POST /api/stripe/webhook
// ---------------------------------------------------------------------------
// Handle Stripe webhook events for async payment status updates.
// Events: payment_intent.succeeded → update escrow to 'funded'
//         payment_intent.payment_failed → update escrow to 'failed'
// NO JWT auth — uses Stripe signature verification instead.
// Must receive raw body (configured in server.js with express.raw()).
// ---------------------------------------------------------------------------

router.post('/webhook', async (req, res) => {
    const errorId = generateErrorId();

    try {
        const stripeClient = getStripe();
        if (!stripeClient) {
            return sendError(res, 503, 'Payment service unavailable.', null, errorId);
        }

        if (!STRIPE_WEBHOOK_SECRET) {
            // eslint-disable-next-line no-console
            console.error('[Stripe:Webhook] STRIPE_WEBHOOK_SECRET not configured.');
            return sendError(res, 500, 'Webhook configuration error.', null, errorId);
        }

        const signature = req.headers['stripe-signature'];
        if (!signature) {
            return res.status(400).json({ error: 'Missing stripe-signature header.' });
        }

        let event;
        try {
            event = stripeClient.webhooks.constructEvent(
                req.body,
                signature,
                STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(`[Stripe:Webhook:${errorId}] Signature verification failed:`, err.message);
            return res.status(400).json({ error: 'Invalid signature.' });
        }

        // eslint-disable-next-line no-console
        console.log(`[Stripe:Webhook] Received event: ${event.type} (${event.id})`);

        // --- Handle specific event types ---
        switch (event.type) {
            case 'payment_intent.succeeded': {
                const pi = event.data.object;
                await handlePaymentIntentSucceeded(pi, errorId);
                break;
            }

            case 'payment_intent.payment_failed': {
                const pi = event.data.object;
                await handlePaymentIntentFailed(pi, errorId);
                break;
            }

            case 'payment_intent.canceled': {
                const pi = event.data.object;
                await handlePaymentIntentCanceled(pi, errorId);
                break;
            }

            default:
                // eslint-disable-next-line no-console
                console.log(`[Stripe:Webhook] Unhandled event type: ${event.type}`);
        }

        // Acknowledge receipt
        return res.status(200).json({ received: true });

    } catch (err) {
        return sendError(res, 500, 'Webhook processing error.', err, errorId);
    }
});

/**
 * Handle payment_intent.succeeded event.
 * Updates the payment intent record and related escrow/project status.
 * @param {object} pi - Stripe PaymentIntent object
 * @param {string} errorId - Error correlation ID
 */
async function handlePaymentIntentSucceeded(pi, errorId) {
    try {
        const projectId = pi.metadata?.gcsc_project_id;
        const userId    = pi.metadata?.gcsc_user_id;

        if (!projectId || !userId) {
            // eslint-disable-next-line no-console
            console.error(`[Stripe:Webhook:${errorId}] Missing metadata on PaymentIntent ${pi.id}`);
            return;
        }

        // Update payment intent status
        await db.query(
            `UPDATE stripe_payment_intents
             SET status = $1, updated_at = NOW()
             WHERE payment_intent_id = $2`,
            ['succeeded', pi.id]
        );

        // Check if there's an escrow contract for this project
        const escrow = await db.selectOne(
            'SELECT * FROM escrow_contracts WHERE project_id = $1',
            [parseInt(projectId, 10)]
        );

        if (escrow) {
            // Update escrow status to funded
            await db.query(
                `UPDATE escrow_contracts
                 SET status = 'funded', updated_at = NOW()
                 WHERE id = $1`,
                [escrow.id]
            );

            // Update project status
            await db.query(
                `UPDATE projects
                 SET status = 'in_progress', updated_at = NOW()
                 WHERE id = $1`,
                [parseInt(projectId, 10)]
            );

            // eslint-disable-next-line no-console
            console.log(`[Stripe:Webhook] Escrow ${escrow.id} funded, project ${projectId} set to in_progress`);
        }

        // Update the project's stripe_payment_intent_id reference
        await db.query(
            `UPDATE projects
             SET stripe_payment_intent_id = $1, updated_at = NOW()
             WHERE id = $2`,
            [pi.id, parseInt(projectId, 10)]
        );

    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[Stripe:Webhook:${errorId}] handlePaymentIntentSucceeded error:`, err.message);
        throw err;
    }
}

/**
 * Handle payment_intent.payment_failed event.
 * @param {object} pi - Stripe PaymentIntent object
 * @param {string} errorId - Error correlation ID
 */
async function handlePaymentIntentFailed(pi, errorId) {
    try {
        // Update payment intent status
        await db.query(
            `UPDATE stripe_payment_intents
             SET status = $1, updated_at = NOW()
             WHERE payment_intent_id = $2`,
            ['failed', pi.id]
        );

        const projectId = pi.metadata?.gcsc_project_id;
        if (projectId) {
            // Check for escrow and mark as failed
            await db.query(
                `UPDATE escrow_contracts
                 SET status = 'failed', updated_at = NOW()
                 WHERE project_id = $1 AND status = 'pending'`,
                [parseInt(projectId, 10)]
            );
        }

        // eslint-disable-next-line no-console
        console.log(`[Stripe:Webhook] PaymentIntent ${pi.id} failed`);

    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[Stripe:Webhook:${errorId}] handlePaymentIntentFailed error:`, err.message);
        throw err;
    }
}

/**
 * Handle payment_intent.canceled event.
 * @param {object} pi - Stripe PaymentIntent object
 * @param {string} errorId - Error correlation ID
 */
async function handlePaymentIntentCanceled(pi, errorId) {
    try {
        await db.query(
            `UPDATE stripe_payment_intents
             SET status = $1, updated_at = NOW()
             WHERE payment_intent_id = $2`,
            ['canceled', pi.id]
        );

        // eslint-disable-next-line no-console
        console.log(`[Stripe:Webhook] PaymentIntent ${pi.id} canceled`);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[Stripe:Webhook:${errorId}] handlePaymentIntentCanceled error:`, err.message);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// POST /api/stripe/create-payout
// ---------------------------------------------------------------------------
// Create a payout to a contractor's connected Stripe account.
// Body: { escrow_id, amount_usd }
// Returns: { payout_id, status }
// ---------------------------------------------------------------------------

router.post('/create-payout', requireAuth, async (req, res) => {
    const requestId = req.requestId || 'stripe-req';
    const errorId = generateErrorId();

    try {
        const stripeClient = getStripe();
        if (!stripeClient) {
            return sendError(res, 503, 'Payment service unavailable.', null, errorId);
        }

        // --- Input validation ---
        const { escrow_id, amount_usd } = req.body;

        if (!isValidId(escrow_id)) {
            return res.status(400).json({ error: 'Invalid escrow_id. Must be a positive integer.' });
        }

        if (!isValidCentsAmount(amount_usd)) {
            return res.status(400).json({ error: 'Invalid amount_usd. Must be a positive integer (cents).' });
        }

        // Max payout check
        const MAX_PAYOUT_CENTS = 100_000_000;
        if (amount_usd > MAX_PAYOUT_CENTS) {
            return res.status(400).json({ error: 'Payout amount exceeds maximum allowed ($1,000,000).' });
        }

        // --- Verify escrow exists and is funded ---
        const escrow = await db.selectOne(
            'SELECT * FROM escrow_contracts WHERE id = $1',
            [escrow_id]
        );

        if (!escrow) {
            return res.status(404).json({ error: 'Escrow contract not found.' });
        }

        if (escrow.status !== 'funded' && escrow.status !== 'released') {
            return res.status(400).json({ error: 'Escrow is not in a payable state.' });
        }

        // --- Get the contractor user ---
        const contractor = await db.selectOne(
            'SELECT * FROM users WHERE id = $1',
            [escrow.contractor_id]
        );

        if (!contractor) {
            return res.status(404).json({ error: 'Contractor not found.' });
        }

        // Check if contractor has a connected Stripe account
        const contractorStripe = await db.selectOne(
            'SELECT * FROM stripe_connect_accounts WHERE user_id = $1',
            [contractor.id]
        );

        if (!contractorStripe) {
            return res.status(400).json({
                error: 'Contractor has not set up Stripe Connect. Payout cannot be processed.',
            });
        }

        // --- Create Transfer to contractor's connected account ---
        const transfer = await stripeClient.transfers.create({
            amount: amount_usd,
            currency: 'usd',
            destination: contractorStripe.stripe_account_id,
            description: `Payout for escrow #${escrow_id}`,
            metadata: {
                gcsc_escrow_id: String(escrow_id),
                gcsc_project_id: String(escrow.project_id),
                gcsc_contractor_id: String(contractor.id),
            },
        });

        // Record the payout in the database
        await db.query(
            `INSERT INTO stripe_payouts
             (payout_id, escrow_id, contractor_id, amount_cents, status, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [transfer.id, escrow_id, contractor.id, amount_usd, transfer.status]
        );

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Payout created: ${transfer.id} for escrow ${escrow_id}`);

        return res.status(200).json({
            payout_id: transfer.id,
            status: transfer.status,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to create payout.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// GET /api/stripe/payment-methods
// ---------------------------------------------------------------------------
// List the authenticated user's saved payment methods.
// ---------------------------------------------------------------------------

router.get('/payment-methods', requireAuth, async (req, res) => {
    const errorId = generateErrorId();

    try {
        const stripeClient = getStripe();
        if (!stripeClient) {
            return sendError(res, 503, 'Payment service unavailable.', null, errorId);
        }

        // Get the user record
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Find Stripe customer
        const customer = await db.selectOne(
            'SELECT * FROM stripe_customers WHERE user_id = $1',
            [user.id]
        );

        if (!customer) {
            // No customer record yet — return empty list
            return res.status(200).json({ payment_methods: [] });
        }

        // Fetch payment methods from Stripe
        const paymentMethods = await stripeClient.paymentMethods.list({
            customer: customer.stripe_customer_id,
            type: 'card',
        });

        // Sanitize and return
        const sanitized = paymentMethods.data.map((pm) => ({
            id: pm.id,
            type: pm.type,
            card: pm.card ? {
                brand: pm.card.brand,
                last4: pm.card.last4,
                exp_month: pm.card.exp_month,
                exp_year: pm.card.exp_year,
            } : null,
            created: pm.created,
        }));

        return res.status(200).json({ payment_methods: sanitized });

    } catch (err) {
        return sendError(res, 500, 'Failed to retrieve payment methods.', err, errorId);
    }
});

module.exports = router;
