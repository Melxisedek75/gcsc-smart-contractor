const { positiveId } = require('./service');

const windows = new Map();
function rateLimit(identity) {
    const now = Date.now();
    for (const [key, value] of windows) if (value.until <= now) windows.delete(key);
    const key = String(identity.userId || identity.id || identity.email);
    const value = windows.get(key) || { count: 0, until: now + 60000 };
    value.count++;
    windows.set(key, value);
    if (value.count > 20) throw Object.assign(new Error('Too many agent requests'), { status: 429 });
}

async function dispatch(service, identity, method, url, body, request) {
    if (!identity) throw Object.assign(new Error('Authentication required'), { status: 401 });
    rateLimit(identity);
    const match = url.match(/^\/api\/agent\/projects\/(\d+)\/(chat|documents|access|actions\/([0-9a-f-]+)\/(approve|reject))$/i);
    if (!match) throw Object.assign(new Error('Agent route unavailable'), { status: 404 });
    const projectId = positiveId(Number(match[1]));
    if (method === 'GET' && match[2] === 'chat') return service.history(identity, projectId);
    if (method === 'GET' && match[2] === 'documents') return { documents: await service.documents(identity, projectId) };
    if (method === 'POST') {
        if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) throw Object.assign(new Error('JSON required'), { status: 415 });
        if (match[2] === 'chat') {
            if (Object.keys(body).some(k => k !== 'message')) throw Object.assign(new Error('Unexpected input'), { status: 400 });
            return service.chat(identity, projectId, body.message);
        }
        if (match[2] === 'access') {
            if (body.confirmed !== true || Object.keys(body).length !== 2 || !Object.hasOwn(body, 'contractorId')) throw Object.assign(new Error('Explicit access confirmation required'), { status: 400 });
            return service.grantAccess(identity, projectId, body.contractorId);
        }
        if (match[3]) {
            // No amount, target, mode or payload can be supplied at approval time.
            if (Object.keys(body).length !== 1 || body.confirmed !== true) throw Object.assign(new Error('Explicit UI confirmation required'), { status: 400 });
            return service.decide(identity, projectId, match[3], match[4], request);
        }
    }
    throw Object.assign(new Error('Method not allowed'), { status: 405 });
}

function safeError(error) {
    const status = error.status;
    if ([400, 401, 403, 404, 405, 409, 413, 415, 429, 503].includes(status)) return { status, body: { error: error.message } };
    return { status: 502, body: { error: 'Agent temporarily unavailable. No action was automatically approved.' } };
}

function invokeRouter(router, url, body, request, approval) {
    return new Promise((resolve, reject) => {
        const req = { method: 'POST', url, originalUrl: url, headers: request.headers, body, requestId: request.requestId, query: {}, agentApproval: approval };
        let status = 200;
        const res = { status(code) { status = code; return this; }, json(data) {
            if (status >= 400) reject(new Error('Platform action rejected'));
            else resolve(data);
            return this;
        } };
        router.handle(req, res, error => reject(error || new Error('Platform route unavailable')));
    });
}

module.exports = { dispatch, safeError, invokeRouter };
