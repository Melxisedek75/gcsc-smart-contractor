const express = require('express');
const db = require('../database/db');
const { requireAuth } = require('../middleware/auth');
const { createAgentService } = require('./service');
const { dispatch, safeError, invokeRouter } = require('./http');

const router = express.Router();
const service = createAgentService({ db, executePlatformAction(action, req) {
    if (action.action === 'sendProposal') return require('./platform').submitProposal(db, action, 'express');
    if (process.env.SETTLEMENT_ENABLED === 'true') throw new Error('Agent payout approval requires provider review');
    if (action.payload.milestoneIndex === null) throw new Error('Milestone index unavailable');
    return invokeRouter(require('../routes/escrow'), `/${action.payload.escrowId}/milestone/${action.payload.milestoneIndex}/approve`, {}, req, action.payload);
} });

router.use(requireAuth);
router.use(async (req, res) => {
    try {
        const result = await dispatch(service, req.user, req.method, req.originalUrl.split('?')[0], req.body || {}, req);
        res.json(result);
    } catch (error) {
        const result = safeError(error);
        if (result.status === 429) res.setHeader('Retry-After', '60');
        res.status(result.status).json(result.body);
    }
});
module.exports = router;
