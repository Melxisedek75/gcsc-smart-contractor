const { Readable } = require('node:stream');
const jwt = require('jsonwebtoken');
const { createAgentService } = require('./service');
const { dispatch, safeError } = require('./http');

function attachPureAgent({ query, transaction, routes, json }) {
    const service = createAgentService({ db: { query, transaction }, runtime: 'pure', async executePlatformAction(action, request) {
        if (action.action === 'sendProposal') return require('./platform').submitProposal({ query, transaction }, action, 'pure');
        const proposal = action.action === 'sendProposal';
        const payload = proposal ? { project_id: action.project_id, amount: action.payload.amountCents,
            proposed_timeline_days: action.payload.timelineDays, message: action.payload.description } : {};
        const req = Readable.from([JSON.stringify(payload)]);
        req.headers = request.headers;
        req.method = 'POST';
        req.agentApproval = action.payload;
        req.url = proposal ? '/api/bids' : `/api/milestones/${action.payload.milestoneId}/approve`;
        const route = proposal ? 'POST /api/bids' : 'POST /api/milestones/:id/approve';
        return new Promise((resolve, reject) => {
            let status = 200;
            const res = { writeHead(code) { status = code; }, setHeader() {}, end(data) {
                if (status >= 400) reject(new Error('Platform action rejected'));
                else { try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid platform response')); } }
            } };
            Promise.resolve(routes[route](req, res, proposal ? {} : { id: String(action.payload.milestoneId) })).catch(reject);
        });
    } });

    return async (req, res) => {
        try {
            const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
            if (!token) throw Object.assign(new Error('Authentication required'), { status: 401 });
            let identity;
            try {
                identity = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
                if (!Number.isFinite(identity.exp)) throw new Error('Expiry required');
            } catch { throw Object.assign(new Error('Authentication required'), { status: 401 }); }
            if (!process.env.DATABASE_URL) throw Object.assign(new Error('Agent requires PostgreSQL'), { status: 503 });
            // Shared Express deployments have revocable JTI sessions. Never accept
            // a legacy token as a bypass when that session system is present.
            const sessionTable = (await query("SELECT to_regclass('public.sessions') AS sessions")).rows[0]?.sessions;
            if (sessionTable) {
                if (!identity.jti) throw Object.assign(new Error('Authentication required'), { status: 401 });
                const session = await query('SELECT jti FROM sessions WHERE jti=$1 AND is_revoked=false AND expires_at>NOW()', [identity.jti]);
                if (!session.rows.length) throw Object.assign(new Error('Authentication required'), { status: 401 });
            }
            let body = {};
            if (req.method === 'POST') {
                let raw = '';
                for await (const chunk of req) {
                    raw += chunk;
                    if (Buffer.byteLength(raw) > 16384) throw Object.assign(new Error('Request too large'), { status: 413 });
                }
                try { body = JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
                if (!body || Array.isArray(body) || typeof body !== 'object') throw Object.assign(new Error('Invalid JSON object'), { status: 400 });
            }
            json(res, 200, await dispatch(service, identity, req.method, req.url.split('?')[0], body, req));
        } catch (error) {
            const result = safeError(error);
            if (result.status === 429) res.setHeader('Retry-After', '60');
            json(res, result.status, result.body);
        }
    };
}
module.exports = { attachPureAgent };
