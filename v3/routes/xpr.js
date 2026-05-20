/**
 * ============================================================================
 * GCSC Smart Contractor v3.0 — XPR Network Blockchain Routes
 * ============================================================================
 *
 * XPR Network integration for WebAuth wallet and on-chain escrow management.
 * Provides account lookups, escrow creation, funding, release, dispute,
 * and raw transaction pushing.
 *
 * Endpoints:
 *   GET  /api/xpr/account/:account_name         — Get XPR account info
 *   POST /api/xpr/escrow/create                 — Create escrow on XPR chain
 *   POST /api/xpr/escrow/fund                   — Fund an escrow contract
 *   POST /api/xpr/escrow/release                — Release milestone payment
 *   POST /api/xpr/escrow/dispute                — Open a dispute
 *   POST /api/xpr/transaction/push              — Push signed transaction
 *   GET  /api/xpr/transaction/:tx_id            — Get transaction receipt
 *
 * Dependencies:
 *   - @proton/api  for reading chain data (accounts, transactions)
 *   - @proton/js   for signing and pushing transactions
 *
 * XPR Network Config:
 *   - Chain ID: "384da888ccb047ea0000000000000000000000000000000000" (mainnet)
 *   - API Endpoint: https://proton.greymass.com or https://api.protonchain.com
 *
 * Security:
 *   - All endpoints require JWT authentication
 *   - Parameterized queries prevent SQL injection
 *   - Input validation on all user-provided fields
 *   - Private keys are NEVER handled server-side (client-side signing)
 * ============================================================================
 */

const express = require('express');
const crypto  = require('crypto');
const db      = require('../database/db');

const router = express.Router();

// ---------------------------------------------------------------------------
// @proton/api and @proton/js imports
// ---------------------------------------------------------------------------

let protonApi = null;
let protonJs  = null;

try {
    protonApi = require('@proton/api');
} catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[XPRRoute] @proton/api not available. XPR chain reads will be degraded.');
}

try {
    protonJs = require('@proton/js');
} catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[XPRRoute] @proton/js not available. Transaction pushing will be unavailable.');
}

// ---------------------------------------------------------------------------
// XPR Network Configuration
// ---------------------------------------------------------------------------

const XPR_CHAIN_ID       = process.env.XPR_CHAIN_ID || '384da888ccb047ea0000000000000000000000000000000000';
const XPR_API_ENDPOINT   = process.env.XPR_API_ENDPOINT || 'https://proton.greymass.com';
const XPR_ESCROW_CONTRACT = process.env.XPR_ESCROW_CONTRACT || ''; // On-chain escrow smart contract account

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
            console.error('[XPRRoute] JWT validation failed:', err.message);
            return res.status(401).json({ error: 'Authentication required.' });
        }
    })();
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
        console.error(`[XPR:${errorId}]`, err.message || '', err.stack || '');
    }
    res.status(status).json({ error: message, ...(errorId && { errorId }) });
}

function isValidId(value) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isValidString(value, maxLength = 1000) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

/**
 * Build a Proton API client for reading chain data.
 * @returns {object|null}
 */
function getApiClient() {
    if (!protonApi) return null;
    try {
        const { JsonRpc } = protonApi;
        return new JsonRpc(XPR_API_ENDPOINT, { fetch });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[XPRRoute] Failed to create API client:', err.message);
        return null;
    }
}

/**
 * Build a Proton JS API client for pushing transactions.
 * @returns {object|null}
 */
function getJsApiClient() {
    if (!protonJs) return null;
    try {
        const { Api, JsonRpc } = protonJs;
        const rpc = new JsonRpc(XPR_API_ENDPOINT, { fetch });
        return { Api, rpc };
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[XPRRoute] Failed to create JS API client:', err.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// GET /api/xpr/account/:account_name
// ---------------------------------------------------------------------------
// Get XPR account information: balance, resources (RAM, CPU, NET).
// ---------------------------------------------------------------------------

router.get('/account/:account_name', requireAuth, async (req, res) => {
    const errorId = generateErrorId();
    const requestId = req.requestId || 'xpr-req';

    try {
        const accountName = req.params.account_name;

        // Validate account name format (1-12 chars, a-z, 1-5)
        if (!/^[a-z1-5]{1,12}$/.test(accountName)) {
            return res.status(400).json({ error: 'Invalid account name format.' });
        }

        const rpc = getApiClient();
        if (!rpc) {
            return sendError(res, 503, 'XPR chain API unavailable.', null, errorId);
        }

        // Fetch account data from XPR chain
        let accountData;
        try {
            accountData = await rpc.get_account(accountName);
        } catch (chainErr) {
            if (chainErr.message && chainErr.message.includes('unknown key')) {
                return res.status(404).json({ error: 'Account not found on XPR chain.' });
            }
            throw chainErr;
        }

        // Fetch currency balance
        let balances = [];
        try {
            balances = await rpc.get_currency_balance('eosio.token', accountName, 'XPR');
        } catch (balanceErr) {
            // Non-fatal — account may exist but have no XPR balance
            // eslint-disable-next-line no-console
            console.log(`[${requestId}] No XPR balance for ${accountName}:`, balanceErr.message);
        }

        // Sanitize and return
        const response = {
            account_name: accountData.account_name,
            created: accountData.created,
            permissions: (accountData.permissions || []).map((p) => ({
                perm_name: p.perm_name,
                parent: p.parent,
                required_auth: {
                    threshold: p.required_auth?.threshold,
                    keys: (p.required_auth?.keys || []).map((k) => ({
                        key: k.key,
                        weight: k.weight,
                    })),
                },
            })),
            balances: balances || [],
            resources: {
                ram: {
                    used: accountData.ram_usage,
                    quota: accountData.ram_quota,
                },
                cpu: {
                    used: accountData.cpu_limit?.used,
                    available: accountData.cpu_limit?.available,
                    max: accountData.cpu_limit?.max,
                },
                net: {
                    used: accountData.net_limit?.used,
                    available: accountData.net_limit?.available,
                    max: accountData.net_limit?.max,
                },
            },
        };

        return res.status(200).json(response);

    } catch (err) {
        return sendError(res, 500, 'Failed to retrieve XPR account information.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// POST /api/xpr/escrow/create
// ---------------------------------------------------------------------------
// Create an escrow contract on the XPR blockchain.
// Body: { project_id, homeowner_account, contractor_account, amount_xpr, milestones[] }
// ---------------------------------------------------------------------------

router.post('/escrow/create', requireAuth, async (req, res) => {
    const requestId = req.requestId || 'xpr-req';
    const errorId = generateErrorId();

    try {
        const {
            project_id,
            homeowner_account,
            contractor_account,
            amount_xpr,
            milestones,
        } = req.body;

        // --- Input validation ---
        if (!isValidId(project_id)) {
            return res.status(400).json({ error: 'Invalid project_id.' });
        }

        if (!isValidString(homeowner_account, 12) || !/^[a-z1-5]{1,12}$/.test(homeowner_account)) {
            return res.status(400).json({ error: 'Invalid homeowner_account format.' });
        }

        if (!isValidString(contractor_account, 12) || !/^[a-z1-5]{1,12}$/.test(contractor_account)) {
            return res.status(400).json({ error: 'Invalid contractor_account format.' });
        }

        if (typeof amount_xpr !== 'string' && typeof amount_xpr !== 'number') {
            return res.status(400).json({ error: 'Invalid amount_xpr.' });
        }

        if (!Array.isArray(milestones) || milestones.length === 0 || milestones.length > 20) {
            return res.status(400).json({ error: 'Milestones must be an array of 1-20 items.' });
        }

        for (const ms of milestones) {
            if (!ms || typeof ms !== 'object') {
                return res.status(400).json({ error: 'Each milestone must be an object.' });
            }
            if (!isValidString(ms.description, 500)) {
                return res.status(400).json({ error: 'Each milestone must have a description (max 500 chars).' });
            }
            const amount = typeof ms.amount === 'string' ? parseFloat(ms.amount) : ms.amount;
            if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
                return res.status(400).json({ error: 'Each milestone must have a positive amount.' });
            }
        }

        // --- Verify project exists and user is the homeowner ---
        const project = await db.selectOne(
            'SELECT * FROM projects WHERE id = $1',
            [project_id]
        );

        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user || project.homeowner_id !== user.id) {
            return res.status(403).json({ error: 'Only the project owner can create an escrow.' });
        }

        // --- Get accepted bid ---
        const bid = await db.selectOne(
            `SELECT * FROM bids WHERE project_id = $1 AND status = 'accepted' ORDER BY updated_at DESC LIMIT 1`,
            [project_id]
        );

        if (!bid) {
            return res.status(400).json({ error: 'No accepted bid found for this project.' });
        }

        // --- Build and return the action data for client-side signing ---
        // Server does NOT sign — the client signs via WebAuth wallet
        const milestoneData = milestones.map((ms, index) => ({
            index,
            description: ms.description,
            amount: typeof ms.amount === 'string' ? ms.amount : String(ms.amount),
            status: 'pending',
        }));

        const actionData = {
            account: XPR_ESCROW_CONTRACT || 'escrow.gcsc',
            name: 'createescrow',
            authorization: [{ actor: homeowner_account, permission: 'active' }],
            data: {
                escrow_id: `escrow_${project_id}_${bid.id}`,
                homeowner: homeowner_account,
                contractor: contractor_account,
                total_amount: String(amount_xpr),
                milestones: milestoneData,
            },
        };

        // Insert escrow record into database
        const escrowResult = await db.query(
            `INSERT INTO escrow_contracts
             (project_id, bid_id, homeowner_id, contractor_id, amount, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
            [project_id, bid.id, user.id, bid.contractor_id, Math.round(parseFloat(String(amount_xpr)) * 100) || 0, 'pending']
        );

        const escrowRecord = escrowResult.rows[0];

        // Insert milestones
        for (const ms of milestoneData) {
            await db.query(
                `INSERT INTO milestones
                 (escrow_id, milestone_index, description, amount, status, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [escrowRecord.id, ms.index, ms.description, Math.round(parseFloat(ms.amount) * 100) || 0, 'pending']
            );
        }

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Escrow record created: DB id=${escrowRecord.id}, project=${project_id}`);

        return res.status(201).json({
            escrow_id: escrowRecord.id,
            project_id,
            action: actionData,
            status: 'pending_signature',
            message: 'Escrow record created. Sign and push the action via /api/xpr/transaction/push.',
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to create escrow.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// POST /api/xpr/escrow/fund
// ---------------------------------------------------------------------------
// Fund an escrow contract on the XPR blockchain.
// Body: { escrow_id, amount_xpr }
// ---------------------------------------------------------------------------

router.post('/escrow/fund', requireAuth, async (req, res) => {
    const requestId = req.requestId || 'xpr-req';
    const errorId = generateErrorId();

    try {
        const { escrow_id, amount_xpr } = req.body;

        // --- Input validation ---
        if (!isValidId(escrow_id)) {
            return res.status(400).json({ error: 'Invalid escrow_id.' });
        }

        if (typeof amount_xpr !== 'string' && typeof amount_xpr !== 'number') {
            return res.status(400).json({ error: 'Invalid amount_xpr.' });
        }

        // --- Verify escrow exists ---
        const escrow = await db.selectOne(
            'SELECT * FROM escrow_contracts WHERE id = $1',
            [escrow_id]
        );

        if (!escrow) {
            return res.status(404).json({ error: 'Escrow not found.' });
        }

        // --- Verify user is the homeowner ---
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user || escrow.homeowner_id !== user.id) {
            return res.status(403).json({ error: 'Only the homeowner can fund this escrow.' });
        }

        if (escrow.status !== 'pending') {
            return res.status(400).json({ error: `Escrow is already ${escrow.status}.` });
        }

        // --- Build action for client-side signing ---
        const action = {
            account: XPR_ESCROW_CONTRACT || 'escrow.gcsc',
            name: 'fundescrow',
            authorization: [{ actor: user.xpr_account, permission: 'active' }],
            data: {
                escrow_id: `escrow_${escrow.project_id}_${escrow.bid_id}`,
                funder: user.xpr_account,
                amount: String(amount_xpr),
            },
        };

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Fund action prepared for escrow ${escrow_id}`);

        return res.status(200).json({
            escrow_id: escrow.id,
            action,
            status: 'pending_signature',
            message: 'Sign and push the action via /api/xpr/transaction/push.',
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to prepare escrow funding.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// POST /api/xpr/escrow/release
// ---------------------------------------------------------------------------
// Release payment for a completed milestone.
// Body: { escrow_id, milestone_index, signature }
// Verifies milestone completion before releasing funds.
// ---------------------------------------------------------------------------

router.post('/escrow/release', requireAuth, async (req, res) => {
    const requestId = req.requestId || 'xpr-req';
    const errorId = generateErrorId();

    try {
        const { escrow_id, milestone_index, signature } = req.body;

        // --- Input validation ---
        if (!isValidId(escrow_id)) {
            return res.status(400).json({ error: 'Invalid escrow_id.' });
        }

        if (typeof milestone_index !== 'number' || !Number.isInteger(milestone_index) || milestone_index < 0) {
            return res.status(400).json({ error: 'Invalid milestone_index.' });
        }

        if (!isValidString(signature, 500)) {
            return res.status(400).json({ error: 'Invalid signature.' });
        }

        // --- Verify escrow exists ---
        const escrow = await db.selectOne(
            'SELECT * FROM escrow_contracts WHERE id = $1',
            [escrow_id]
        );

        if (!escrow) {
            return res.status(404).json({ error: 'Escrow not found.' });
        }

        // --- Verify user is the homeowner ---
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user || escrow.homeowner_id !== user.id) {
            return res.status(403).json({ error: 'Only the homeowner can release escrow funds.' });
        }

        if (escrow.status !== 'funded' && escrow.status !== 'released') {
            return res.status(400).json({ error: `Escrow must be funded to release. Current status: ${escrow.status}.` });
        }

        // --- Verify milestone exists and is completed ---
        const milestone = await db.selectOne(
            `SELECT * FROM milestones WHERE escrow_id = $1 AND milestone_index = $2`,
            [escrow_id, milestone_index]
        );

        if (!milestone) {
            return res.status(404).json({ error: 'Milestone not found.' });
        }

        if (milestone.status !== 'completed') {
            return res.status(400).json({ error: 'Milestone must be marked as completed by the contractor before release.' });
        }

        // --- Build release action for client-side signing ---
        const action = {
            account: XPR_ESCROW_CONTRACT || 'escrow.gcsc',
            name: 'releasemilestone',
            authorization: [{ actor: user.xpr_account, permission: 'active' }],
            data: {
                escrow_id: `escrow_${escrow.project_id}_${escrow.bid_id}`,
                milestone_index,
                homeowner: user.xpr_account,
            },
        };

        // Update milestone status
        await db.query(
            `UPDATE milestones SET status = 'released', updated_at = NOW()
             WHERE escrow_id = $1 AND milestone_index = $2`,
            [escrow_id, milestone_index]
        );

        // Check if all milestones are released — if so, mark escrow as released
        const pendingMilestones = await db.selectOne(
            `SELECT COUNT(*) as count FROM milestones
             WHERE escrow_id = $1 AND status NOT IN ('released', 'cancelled')`,
            [escrow_id]
        );

        if (pendingMilestones && parseInt(pendingMilestones.count, 10) === 0) {
            await db.query(
                `UPDATE escrow_contracts SET status = 'released', updated_at = NOW() WHERE id = $1`,
                [escrow_id]
            );

            // Update project status to completed
            await db.query(
                `UPDATE projects SET status = 'completed', updated_at = NOW() WHERE id = $1`,
                [escrow.project_id]
            );
        }

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Milestone ${milestone_index} released for escrow ${escrow_id}`);

        return res.status(200).json({
            escrow_id: escrow.id,
            milestone_index,
            action,
            signature,
            status: 'release_prepared',
            message: 'Milestone release prepared. Push transaction to complete.',
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to release milestone payment.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// POST /api/xpr/escrow/dispute
// ---------------------------------------------------------------------------
// Open a dispute on an escrow contract.
// Body: { escrow_id, reason }
// ---------------------------------------------------------------------------

router.post('/escrow/dispute', requireAuth, async (req, res) => {
    const requestId = req.requestId || 'xpr-req';
    const errorId = generateErrorId();

    try {
        const { escrow_id, reason } = req.body;

        // --- Input validation ---
        if (!isValidId(escrow_id)) {
            return res.status(400).json({ error: 'Invalid escrow_id.' });
        }

        if (!isValidString(reason, 2000)) {
            return res.status(400).json({ error: 'Reason is required (max 2000 chars).' });
        }

        // --- Verify escrow exists ---
        const escrow = await db.selectOne(
            'SELECT * FROM escrow_contracts WHERE id = $1',
            [escrow_id]
        );

        if (!escrow) {
            return res.status(404).json({ error: 'Escrow not found.' });
        }

        // --- Verify user is a party to the escrow ---
        const user = await db.selectOne(
            'SELECT * FROM users WHERE email = $1',
            [req.user.email]
        );

        if (!user || (escrow.homeowner_id !== user.id && escrow.contractor_id !== user.id)) {
            return res.status(403).json({ error: 'Only the homeowner or contractor can open a dispute.' });
        }

        if (escrow.status === 'disputed') {
            return res.status(400).json({ error: 'Escrow is already in dispute.' });
        }

        if (escrow.status === 'refunded' || escrow.status === 'released') {
            return res.status(400).json({ error: 'Cannot dispute a completed escrow.' });
        }

        // --- Update escrow status ---
        await db.query(
            `UPDATE escrow_contracts SET status = 'disputed', updated_at = NOW() WHERE id = $1`,
            [escrow_id]
        );

        // Record dispute details
        await db.query(
            `INSERT INTO escrow_disputes
             (escrow_id, opened_by, reason, status, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [escrow_id, user.id, reason, 'open']
        );

        // Build dispute action for optional on-chain recording
        const action = {
            account: XPR_ESCROW_CONTRACT || 'escrow.gcsc',
            name: 'openedispute',
            authorization: [{ actor: user.xpr_account, permission: 'active' }],
            data: {
                escrow_id: `escrow_${escrow.project_id}_${escrow.bid_id}`,
                opened_by: user.xpr_account,
                reason,
            },
        };

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Dispute opened on escrow ${escrow_id} by user ${user.id}`);

        return res.status(200).json({
            escrow_id: escrow.id,
            status: 'disputed',
            action,
            message: 'Dispute opened. A moderator will review the case.',
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to open dispute.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// POST /api/xpr/transaction/push
// ---------------------------------------------------------------------------
// Push a signed transaction to the XPR Network.
// Body: { actions[], signatures[] }
// ---------------------------------------------------------------------------

router.post('/transaction/push', requireAuth, async (req, res) => {
    const requestId = req.requestId || 'xpr-req';
    const errorId = generateErrorId();

    try {
        const { actions, signatures } = req.body;

        // --- Input validation ---
        if (!Array.isArray(actions) || actions.length === 0) {
            return res.status(400).json({ error: 'actions must be a non-empty array.' });
        }

        if (!Array.isArray(signatures) || signatures.length === 0) {
            return res.status(400).json({ error: 'signatures must be a non-empty array.' });
        }

        for (const action of actions) {
            if (!isValidString(action.account, 13)) {
                return res.status(400).json({ error: 'Each action must have a valid account.' });
            }
            if (!isValidString(action.name, 13)) {
                return res.status(400).json({ error: 'Each action must have a valid name.' });
            }
            if (!Array.isArray(action.authorization) || action.authorization.length === 0) {
                return res.status(400).json({ error: 'Each action must have authorization.' });
            }
            if (!action.data || typeof action.data !== 'object') {
                return res.status(400).json({ error: 'Each action must have data object.' });
            }
        }

        for (const sig of signatures) {
            if (typeof sig !== 'string' || sig.length < 10) {
                return res.status(400).json({ error: 'Each signature must be a valid string.' });
            }
        }

        // --- Push transaction ---
        const jsClient = getJsApiClient();
        if (!jsClient) {
            return sendError(res, 503, 'Transaction pushing service unavailable.', null, errorId);
        }

        // Note: Full client-side signing means the client constructs the transaction
        // and provides signatures. The server pushes the signed transaction.
        // The client should use @proton/web-sdk or WebAuth for signing.

        // For server-side push, we accept pre-signed transactions
        // and broadcast them to the chain
        const { rpc } = jsClient;

        // Serialize and push
        let pushResult;
        try {
            // Use the push_transaction endpoint directly
            pushResult = await rpc.push_transaction({
                signatures,
                compression: 0,
                packed_context_free_data: '',
                packed_trx: req.body.packed_trx || '', // Client should provide serialized tx
            });
        } catch (pushErr) {
            // eslint-disable-next-line no-console
            console.error(`[${requestId}] Transaction push failed:`, pushErr.message);
            return res.status(400).json({
                error: 'Transaction push failed.',
                details: pushErr.message,
            });
        }

        // Record transaction
        const txId = pushResult.transaction_id || pushResult.id || 'unknown';
        await db.query(
            `INSERT INTO xpr_transactions
             (tx_id, account, actions, status, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [txId, req.user.account, JSON.stringify(actions.map((a) => a.name)), 'pushed']
        );

        // eslint-disable-next-line no-console
        console.log(`[${requestId}] Transaction pushed: ${txId}`);

        return res.status(200).json({
            transaction_id: txId,
            status: 'pushed',
            processed: pushResult.processed || null,
        });

    } catch (err) {
        return sendError(res, 500, 'Failed to push transaction.', err, errorId);
    }
});

// ---------------------------------------------------------------------------
// GET /api/xpr/transaction/:tx_id
// ---------------------------------------------------------------------------
// Get transaction status and receipt from the XPR blockchain.
// ---------------------------------------------------------------------------

router.get('/transaction/:tx_id', requireAuth, async (req, res) => {
    const errorId = generateErrorId();

    try {
        const txId = req.params.tx_id;

        // Validate tx_id format (64 hex chars)
        if (!/^[a-f0-9]{64}$/.test(txId)) {
            return res.status(400).json({ error: 'Invalid transaction ID format. Must be 64 hex characters.' });
        }

        const rpc = getApiClient();
        if (!rpc) {
            return sendError(res, 503, 'XPR chain API unavailable.', null, errorId);
        }

        // Fetch transaction from chain
        let txData;
        try {
            txData = await rpc.history_get_transaction(txId);
        } catch (chainErr) {
            // Transaction may not be in history yet — check if it's irreversible
            if (chainErr.message && chainErr.message.includes('unknown transaction')) {
                return res.status(404).json({ error: 'Transaction not found on chain. It may still be pending.' });
            }
            throw chainErr;
        }

        // Sanitize and return
        const response = {
            transaction_id: txId,
            block_num: txData.block_num,
            block_time: txData.block_time,
            irreversible: txData.last_irreversible_block >= txData.block_num,
            actions: (txData.trx?.trx?.actions || []).map((a) => ({
                account: a.account,
                name: a.name,
                authorization: a.authorization,
                data: a.data,
            })),
        };

        return res.status(200).json(response);

    } catch (err) {
        return sendError(res, 500, 'Failed to retrieve transaction.', err, errorId);
    }
});

module.exports = router;
