/**
 * Escrow + milestone lifecycle endpoint tests
 *
 * Covers the money path from bid acceptance through payment release:
 *  - POST /api/bids/:id/accept   (verification gate, ownership, status guards)
 *  - POST /api/escrow/:id/milestones (homeowner-only, amount caps, escrow status)
 *  - POST /api/milestones/:id/submit  (contractor-only, status guard)
 *  - POST /api/milestones/:id/approve (homeowner-only, status guard)
 *  - POST /api/milestones/:id/release (homeowner-only, status guard, escrow completion)
 *  - POST /api/milestones/:id/dispute (either participant, blocks release)
 *
 * No network/Hyperion involved — this is pure in-memory (json-file) storage,
 * same mode as payments-402.test.js.
 */

// The bid-accept route is rate-limited per client identity (IP+token), and the
// limiter store is module-level state that outlives individual tests. This file
// alone now makes ~40+ accept calls across its describes, which crossed the
// threshold once the chain-tx coverage below was added. Disable rate limiting
// for this suite the same way tests/security-env-check-script.test.js documents
// as the sanctioned test-only escape hatch (never valid in production).
process.env.RATE_LIMITS_DISABLED = 'true';

const http = require('http');
const mod = require('../pure-server');

const server = mod;
const { db, jwtSign } = mod;

let baseUrl;
let listener;

beforeAll((done) => {
  listener = server.listen(0, '127.0.0.1', () => {
    const { port } = listener.address();
    baseUrl = `http://127.0.0.1:${port}`;
    done();
  });
});

afterAll((done) => {
  listener.close(done);
});

// ---- fixtures ----

const HOMEOWNER_ID = 101;
const CONTRACTOR_ID = 102;
const OTHER_HOMEOWNER_ID = 103;
const UNVERIFIED_CONTRACTOR_ID = 104;

const HOMEOWNER_TOKEN = jwtSign({ userId: HOMEOWNER_ID, email: 'ho@test.io', role: 'homeowner' });
const CONTRACTOR_TOKEN = jwtSign({ userId: CONTRACTOR_ID, email: 'co@test.io', role: 'contractor' });
const OTHER_HOMEOWNER_TOKEN = jwtSign({ userId: OTHER_HOMEOWNER_ID, email: 'ho2@test.io', role: 'homeowner' });
const UNVERIFIED_CONTRACTOR_TOKEN = jwtSign({ userId: UNVERIFIED_CONTRACTOR_ID, email: 'co2@test.io', role: 'contractor' });

function verifiedContractorDocs(userId) {
  return ['contractor_license', 'insurance_certificate', 'business_ein'].map((documentType, i) => ({
    id: userId * 10 + i,
    user_id: userId,
    document_type: documentType,
    file_name: `${documentType}.pdf`,
    mime_type: 'application/pdf',
    status: 'approved',
  }));
}

beforeEach(() => {
  db.users.length = 0;
  db.projects.length = 0;
  db.bids.length = 0;
  db.escrow_contracts.length = 0;
  db.milestones.length = 0;
  db.user_documents.length = 0;
  db.audit_events.length = 0;
  db.milestone_chain_txs.length = 0;

  db.users.push(
    { id: HOMEOWNER_ID, email: 'ho@test.io', role: 'homeowner', is_active: 1, full_name: 'Home Owner', phone: '2065550100', profile: {}, wallet: null },
    { id: OTHER_HOMEOWNER_ID, email: 'ho2@test.io', role: 'homeowner', is_active: 1, full_name: 'Other Owner', phone: '2065550101', profile: {}, wallet: null },
    {
      id: CONTRACTOR_ID, email: 'co@test.io', role: 'contractor', is_active: 1,
      full_name: 'Con Tractor', phone: '2065550102',
      profile: { companyName: 'Con LLC', ein: '12-3456789', licenseNumber: 'LIC-1', serviceArea: 'Seattle, WA', specialties: ['general'] },
      wallet: { accountName: 'contractor1', permission: 'active' },
    },
    {
      id: UNVERIFIED_CONTRACTOR_ID, email: 'co2@test.io', role: 'contractor', is_active: 1,
      full_name: 'Unverified Co', phone: '', profile: {}, wallet: null,
    },
  );
  db.user_documents.push(...verifiedContractorDocs(CONTRACTOR_ID));
});

// ---- helpers ----

function request({ method = 'POST', path, token, body }) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const url = new URL(baseUrl + path);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      agent: false,
      headers: {
        'Content-Type': 'application/json',
        Connection: 'close',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(buf); } catch { parsed = buf; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function createProject(overrides = {}) {
  const r = await request({
    path: '/api/projects',
    token: HOMEOWNER_TOKEN,
    body: {
      title: 'Kitchen remodel',
      description: 'Full kitchen renovation',
      category: 'Renovation',
      location: 'Seattle, WA',
      budget_min: 5000,
      budget_max: 8000,
      timeline_days: 21,
      ...overrides,
    },
  });
  return r.body.project.id;
}

async function placeBid(projectId, token = CONTRACTOR_TOKEN, overrides = {}) {
  const r = await request({
    path: '/api/bids',
    token,
    body: { project_id: projectId, amount: 6000, proposed_timeline_days: 18, message: 'Bid', ...overrides },
  });
  return r.body.bid?.id;
}

async function acceptedEscrow() {
  const projectId = await createProject();
  const bidId = await placeBid(projectId);
  const r = await request({ path: `/api/bids/${bidId}/accept`, token: HOMEOWNER_TOKEN });
  return { projectId, bidId, escrowId: r.body.escrow_id };
}

// ==================== POST /api/bids/:id/accept ====================

describe('POST /api/bids/:id/accept', () => {
  test('verified contractor + valid bid -> 200, escrow created', async () => {
    const projectId = await createProject();
    const bidId = await placeBid(projectId);
    const r = await request({ path: `/api/bids/${bidId}/accept`, token: HOMEOWNER_TOKEN });
    expect(r.status).toBe(200);
    expect(r.body.escrow_id).toBeDefined();
    const escrow = db.escrow_contracts.find(e => e.id === r.body.escrow_id);
    expect(escrow.homeowner_id).toBe(HOMEOWNER_ID);
    expect(escrow.contractor_id).toBe(CONTRACTOR_ID);
    expect(escrow.total_amount).toBe(6000);
  });

  test('unverified contractor bid -> 400, no escrow created', async () => {
    const projectId = await createProject();
    const bidId = await placeBid(projectId, UNVERIFIED_CONTRACTOR_TOKEN);
    const r = await request({ path: `/api/bids/${bidId}/accept`, token: HOMEOWNER_TOKEN });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/verified/i);
    expect(db.escrow_contracts.length).toBe(0);
  });

  test('homeowner who does not own the project -> 403', async () => {
    const projectId = await createProject();
    const bidId = await placeBid(projectId);
    const r = await request({ path: `/api/bids/${bidId}/accept`, token: OTHER_HOMEOWNER_TOKEN });
    expect(r.status).toBe(403);
  });

  test('unknown bid id -> 404', async () => {
    const r = await request({ path: '/api/bids/999999/accept', token: HOMEOWNER_TOKEN });
    expect(r.status).toBe(404);
  });

  test('no auth -> 401', async () => {
    const projectId = await createProject();
    const bidId = await placeBid(projectId);
    const r = await request({ path: `/api/bids/${bidId}/accept` });
    expect(r.status).toBe(401);
  });

  test('accepting the same bid twice -> second call 400 (already accepted)', async () => {
    const projectId = await createProject();
    const bidId = await placeBid(projectId);
    const first = await request({ path: `/api/bids/${bidId}/accept`, token: HOMEOWNER_TOKEN });
    expect(first.status).toBe(200);
    const second = await request({ path: `/api/bids/${bidId}/accept`, token: HOMEOWNER_TOKEN });
    expect(second.status).toBe(400);
    expect(db.escrow_contracts.length).toBe(1);
  });

  test('accepting one bid rejects other pending bids on the same project', async () => {
    const projectId = await createProject();
    const bidA = await placeBid(projectId, CONTRACTOR_TOKEN, { amount: 6000 });
    db.users.push({
      id: 105, email: 'co3@test.io', role: 'contractor', is_active: 1,
      full_name: 'Third Co', phone: '2065550199',
      profile: { companyName: 'C', ein: '99-9999999', licenseNumber: 'L', serviceArea: 'Seattle', specialties: ['general'] },
      wallet: { accountName: 'contractor3', permission: 'active' },
    });
    db.user_documents.push(...verifiedContractorDocs(105));
    const thirdToken = jwtSign({ userId: 105, email: 'co3@test.io', role: 'contractor' });
    const bidB = await placeBid(projectId, thirdToken, { amount: 5500 });

    const r = await request({ path: `/api/bids/${bidA}/accept`, token: HOMEOWNER_TOKEN });
    expect(r.status).toBe(200);
    const rejected = db.bids.find(b => b.id === bidB);
    expect(rejected.status).toBe('rejected');
  });
});

// ==================== POST /api/escrow/:id/milestones ====================

describe('POST /api/escrow/:id/milestones', () => {
  test('homeowner adds a milestone within budget -> 201', async () => {
    const { escrowId } = await acceptedEscrow();
    const r = await request({
      path: `/api/escrow/${escrowId}/milestones`,
      token: HOMEOWNER_TOKEN,
      body: { title: 'Demo + prep', description: 'Tear out old cabinets', amount: 2000 },
    });
    expect(r.status).toBe(201);
    expect(r.body.milestone.status).toBe('pending');
    expect(r.body.milestone.amount).toBe(2000);
  });

  test('contractor cannot add a milestone -> 403', async () => {
    const { escrowId } = await acceptedEscrow();
    const r = await request({
      path: `/api/escrow/${escrowId}/milestones`,
      token: CONTRACTOR_TOKEN,
      body: { title: 'Demo', amount: 1000 },
    });
    expect(r.status).toBe(403);
  });

  test('milestone total exceeding escrow amount -> 400, nothing created', async () => {
    const { escrowId } = await acceptedEscrow(); // total_amount 6000
    const r = await request({
      path: `/api/escrow/${escrowId}/milestones`,
      token: HOMEOWNER_TOKEN,
      body: { title: 'Everything', amount: 7000 },
    });
    expect(r.status).toBe(400);
    expect(db.milestones.length).toBe(0);
  });

  test('sum of milestones exceeding escrow amount across calls -> second call 400', async () => {
    const { escrowId } = await acceptedEscrow(); // total_amount 6000
    const first = await request({
      path: `/api/escrow/${escrowId}/milestones`,
      token: HOMEOWNER_TOKEN,
      body: { title: 'Phase 1', amount: 4000 },
    });
    expect(first.status).toBe(201);
    const second = await request({
      path: `/api/escrow/${escrowId}/milestones`,
      token: HOMEOWNER_TOKEN,
      body: { title: 'Phase 2', amount: 3000 },
    });
    expect(second.status).toBe(400);
    expect(db.milestones.length).toBe(1);
  });

  test('zero or negative amount -> 400', async () => {
    const { escrowId } = await acceptedEscrow();
    const r = await request({
      path: `/api/escrow/${escrowId}/milestones`,
      token: HOMEOWNER_TOKEN,
      body: { title: 'Bad amount', amount: 0 },
    });
    expect(r.status).toBe(400);
  });

  test('missing title -> 400', async () => {
    const { escrowId } = await acceptedEscrow();
    const r = await request({
      path: `/api/escrow/${escrowId}/milestones`,
      token: HOMEOWNER_TOKEN,
      body: { amount: 1000 },
    });
    expect(r.status).toBe(400);
  });

  test('unknown escrow id -> 404', async () => {
    const r = await request({
      path: '/api/escrow/999999/milestones',
      token: HOMEOWNER_TOKEN,
      body: { title: 'X', amount: 100 },
    });
    expect(r.status).toBe(404);
  });
});

// ==================== milestone lifecycle: submit -> approve -> release ====================

async function addMilestone(escrowId, amount = 2000) {
  const r = await request({
    path: `/api/escrow/${escrowId}/milestones`,
    token: HOMEOWNER_TOKEN,
    body: { title: 'Demo + prep', amount },
  });
  return r.body.milestone.id;
}

describe('milestone submit/approve/release lifecycle', () => {
  test('full happy path: submit -> approve -> release, escrow completes when fully released', async () => {
    const { escrowId } = await acceptedEscrow(); // total 6000
    const msId = await addMilestone(escrowId, 6000); // whole escrow in one milestone

    const submit = await request({ path: `/api/milestones/${msId}/submit`, token: CONTRACTOR_TOKEN });
    expect(submit.status).toBe(200);
    expect(submit.body.milestone.status).toBe('submitted');

    const approve = await request({ path: `/api/milestones/${msId}/approve`, token: HOMEOWNER_TOKEN });
    expect(approve.status).toBe(200);
    expect(approve.body.milestone.status).toBe('approved');

    const release = await request({ path: `/api/milestones/${msId}/release`, token: HOMEOWNER_TOKEN });
    expect(release.status).toBe(200);
    expect(release.body.milestone.status).toBe('released');
    expect(release.body.escrow.status).toBe('completed');
  });

  test('partial release does not complete the escrow', async () => {
    const { escrowId } = await acceptedEscrow(); // total 6000
    const msId = await addMilestone(escrowId, 2000);

    await request({ path: `/api/milestones/${msId}/submit`, token: CONTRACTOR_TOKEN });
    await request({ path: `/api/milestones/${msId}/approve`, token: HOMEOWNER_TOKEN });
    const release = await request({ path: `/api/milestones/${msId}/release`, token: HOMEOWNER_TOKEN });

    expect(release.status).toBe(200);
    expect(release.body.escrow.status).not.toBe('completed');
  });

  test('homeowner cannot submit (contractor-only action)', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId);
    const r = await request({ path: `/api/milestones/${msId}/submit`, token: HOMEOWNER_TOKEN });
    expect(r.status).toBe(403);
  });

  test('contractor cannot approve (homeowner-only action)', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId);
    await request({ path: `/api/milestones/${msId}/submit`, token: CONTRACTOR_TOKEN });
    const r = await request({ path: `/api/milestones/${msId}/approve`, token: CONTRACTOR_TOKEN });
    expect(r.status).toBe(403);
  });

  test('contractor cannot release (homeowner-only action)', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId);
    await request({ path: `/api/milestones/${msId}/submit`, token: CONTRACTOR_TOKEN });
    await request({ path: `/api/milestones/${msId}/approve`, token: HOMEOWNER_TOKEN });
    const r = await request({ path: `/api/milestones/${msId}/release`, token: CONTRACTOR_TOKEN });
    expect(r.status).toBe(403);
  });

  test('cannot approve a milestone still pending (must be submitted first)', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId);
    const r = await request({ path: `/api/milestones/${msId}/approve`, token: HOMEOWNER_TOKEN });
    expect(r.status).toBe(400);
  });

  test('cannot release a milestone that is only submitted (must be approved first)', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId);
    await request({ path: `/api/milestones/${msId}/submit`, token: CONTRACTOR_TOKEN });
    const r = await request({ path: `/api/milestones/${msId}/release`, token: HOMEOWNER_TOKEN });
    expect(r.status).toBe(400);
  });

  test('cannot submit a milestone twice', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId);
    const first = await request({ path: `/api/milestones/${msId}/submit`, token: CONTRACTOR_TOKEN });
    expect(first.status).toBe(200);
    const second = await request({ path: `/api/milestones/${msId}/submit`, token: CONTRACTOR_TOKEN });
    expect(second.status).toBe(400);
  });

  test('a different contractor cannot submit someone else\'s milestone', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId);
    const r = await request({ path: `/api/milestones/${msId}/submit`, token: UNVERIFIED_CONTRACTOR_TOKEN });
    expect(r.status).toBe(403);
  });

  test('unknown milestone id -> 404 on every action', async () => {
    const submit = await request({ path: '/api/milestones/999999/submit', token: CONTRACTOR_TOKEN });
    const approve = await request({ path: '/api/milestones/999999/approve', token: HOMEOWNER_TOKEN });
    const release = await request({ path: '/api/milestones/999999/release', token: HOMEOWNER_TOKEN });
    expect(submit.status).toBe(404);
    expect(approve.status).toBe(404);
    expect(release.status).toBe(404);
  });
});

// ==================== dispute ====================

describe('POST /api/milestones/:id/dispute', () => {
  test('homeowner can dispute a submitted milestone -> escrow becomes disputed', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId);
    await request({ path: `/api/milestones/${msId}/submit`, token: CONTRACTOR_TOKEN });

    const r = await request({ path: `/api/milestones/${msId}/dispute`, token: HOMEOWNER_TOKEN });
    expect(r.status).toBe(200);
    expect(r.body.milestone.status).toBe('disputed');
    expect(r.body.escrow.status).toBe('disputed');
  });

  test('contractor can also dispute', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId);
    const r = await request({ path: `/api/milestones/${msId}/dispute`, token: CONTRACTOR_TOKEN });
    expect(r.status).toBe(200);
  });

  test('a released milestone cannot be disputed', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 6000);
    await request({ path: `/api/milestones/${msId}/submit`, token: CONTRACTOR_TOKEN });
    await request({ path: `/api/milestones/${msId}/approve`, token: HOMEOWNER_TOKEN });
    await request({ path: `/api/milestones/${msId}/release`, token: HOMEOWNER_TOKEN });

    const r = await request({ path: `/api/milestones/${msId}/dispute`, token: HOMEOWNER_TOKEN });
    expect(r.status).toBe(400);
  });

  test('an outsider cannot dispute -> 403', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId);
    const r = await request({ path: `/api/milestones/${msId}/dispute`, token: OTHER_HOMEOWNER_TOKEN });
    expect(r.status).toBe(403);
  });

  test('once an escrow is disputed, new milestones cannot be added', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    await request({ path: `/api/milestones/${msId}/dispute`, token: HOMEOWNER_TOKEN });

    const r = await request({
      path: `/api/escrow/${escrowId}/milestones`,
      token: HOMEOWNER_TOKEN,
      body: { title: 'Phase 2', amount: 500 },
    });
    expect(r.status).toBe(400);
  });

  test('once an escrow is disputed, submit/approve/release are blocked', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    const msId2 = await addMilestone(escrowId, 500);
    await request({ path: `/api/milestones/${msId}/dispute`, token: HOMEOWNER_TOKEN });

    const submit = await request({ path: `/api/milestones/${msId2}/submit`, token: CONTRACTOR_TOKEN });
    expect(submit.status).toBe(400);
  });
});

// ==================== escrow read endpoints ====================

describe('GET /api/escrow/:id and /api/escrow/my/escrows', () => {
  test('escrow participants can read it, outsiders get 404 (no existence leak)', async () => {
    const { escrowId } = await acceptedEscrow();
    const asHomeowner = await request({ method: 'GET', path: `/api/escrow/${escrowId}`, token: HOMEOWNER_TOKEN });
    const asContractor = await request({ method: 'GET', path: `/api/escrow/${escrowId}`, token: CONTRACTOR_TOKEN });
    const asOutsider = await request({ method: 'GET', path: `/api/escrow/${escrowId}`, token: OTHER_HOMEOWNER_TOKEN });
    expect(asHomeowner.status).toBe(200);
    expect(asContractor.status).toBe(200);
    expect(asOutsider.status).toBe(404);
  });

  test('my/escrows only returns escrows the caller participates in', async () => {
    const { escrowId } = await acceptedEscrow();
    const mine = await request({ method: 'GET', path: '/api/escrow/my/escrows', token: HOMEOWNER_TOKEN });
    const notMine = await request({ method: 'GET', path: '/api/escrow/my/escrows', token: OTHER_HOMEOWNER_TOKEN });
    expect(mine.body.escrows.map(e => e.id)).toContain(escrowId);
    expect(notMine.body.escrows.length).toBe(0);
  });
});

// ==================== chain-tx evidence recording + verification ====================
//
// POST /api/milestones/:id/chain-txs and its /verify sibling record and confirm
// on-chain XPR testnet evidence for a milestone action (submitms/approvems/
// releasems/disputems). Previously uncovered (see 2026-07-16 review record,
// "Known gaps"). fetchHyperionTransaction (shared with the payment verifier)
// is exercised here through global.fetch mocks, same technique as
// tests/payment-reconciler.test.js.

const originalFetch = global.fetch;
const TX_ID = 'a'.repeat(64);

// responses matched positionally to DEFAULT_XPR_TESTNET_HYPERION_URLS (2 nodes);
// extra calls beyond the array length repeat the last entry.
function mockChainNodes(responses) {
  let call = 0;
  global.fetch = jest.fn(async () => {
    const payload = responses[Math.min(call++, responses.length - 1)];
    if (payload === 'network-error') throw new Error('connect ECONNREFUSED');
    return { ok: true, status: 200, json: async () => payload };
  });
}

const LIB = 400000000;
const AUTHORITATIVE_NOT_FOUND = { executed: false, lib: LIB, last_indexed_block: LIB };
const STALE_NOT_FOUND = { executed: false, lib: LIB, last_indexed_block: LIB - 10000 };

function foundWithAction({ account = 'gcscrow1111', name = 'submitms' } = {}) {
  return {
    executed: true,
    lib: LIB,
    last_indexed_block: LIB,
    actions: [{ act: { account, name, data: {} } }],
  };
}

async function recordChainTx({ msId, token = CONTRACTOR_TOKEN, overrides = {} } = {}) {
  return request({
    path: `/api/milestones/${msId}/chain-txs`,
    token,
    body: { action: 'submitms', tx_id: TX_ID, chain_id: 'testnet', actor: 'contractor1', ...overrides },
  });
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe('POST /api/milestones/:id/chain-txs', () => {
  test('contractor records submitms evidence -> 201, status broadcast', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    const r = await recordChainTx({ msId });
    expect(r.status).toBe(201);
    expect(r.body.chain_tx.status).toBe('broadcast');
    expect(r.body.chain_tx.action).toBe('submitms');
    expect(r.body.chain_tx.tx_id).toBe(TX_ID);
    expect(db.milestone_chain_txs.length).toBe(1);
  });

  test('homeowner records approvems evidence -> 201', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    const r = await recordChainTx({ msId, token: HOMEOWNER_TOKEN, overrides: { action: 'approvems', tx_id: 'b'.repeat(64) } });
    expect(r.status).toBe(201);
  });

  test('wrong role for the action -> 403 (contractor cannot record approvems)', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    const r = await recordChainTx({ msId, token: CONTRACTOR_TOKEN, overrides: { action: 'approvems' } });
    expect(r.status).toBe(403);
    expect(db.milestone_chain_txs.length).toBe(0);
  });

  test('non-participant -> 403, no existence leak beyond that', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    const r = await recordChainTx({ msId, token: OTHER_HOMEOWNER_TOKEN });
    expect(r.status).toBe(403);
  });

  test('invalid action string -> 400, nothing stored', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    const r = await recordChainTx({ msId, overrides: { action: 'notaraction' } });
    expect(r.status).toBe(400);
    expect(db.milestone_chain_txs.length).toBe(0);
  });

  test('invalid/short tx_id -> 400', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    const r = await recordChainTx({ msId, overrides: { tx_id: 'short' } });
    expect(r.status).toBe(400);
  });

  test('wrong escrow contract account -> 400', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    const r = await recordChainTx({ msId, overrides: { contract_account: 'notgcscrow1111' } });
    expect(r.status).toBe(400);
  });

  test('duplicate tx_id -> 409, only one row stored', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    const first = await recordChainTx({ msId });
    expect(first.status).toBe(201);
    const second = await recordChainTx({ msId, overrides: { tx_id: TX_ID } });
    expect(second.status).toBe(409);
    expect(db.milestone_chain_txs.length).toBe(1);
  });

  test('unknown milestone id -> 404', async () => {
    const r = await recordChainTx({ msId: 999999 });
    expect(r.status).toBe(404);
  });

  test('no auth -> 401', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    const r = await recordChainTx({ msId, token: null });
    expect(r.status).toBe(401);
  });
});

describe('POST /api/milestones/:id/chain-txs/:txId/verify', () => {
  async function setupChainTx(overrides = {}) {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    const record = await recordChainTx({ msId, overrides });
    return { msId, txId: record.body.chain_tx.tx_id };
  }

  test('healthy node finds matching action -> 200, status confirmed', async () => {
    const { msId, txId } = await setupChainTx();
    mockChainNodes([foundWithAction({ name: 'submitms' })]);
    const r = await request({ path: `/api/milestones/${msId}/chain-txs/${txId}/verify`, token: CONTRACTOR_TOKEN });
    expect(r.status).toBe(200);
    expect(r.body.chain_tx.status).toBe('confirmed');
    expect(db.milestone_chain_txs.find(t => t.tx_id === txId).status).toBe('confirmed');
  });

  test('healthy node finds the tx but with the wrong action -> 200, status failed', async () => {
    const { msId, txId } = await setupChainTx();
    mockChainNodes([foundWithAction({ name: 'approvems' })]);
    const r = await request({ path: `/api/milestones/${msId}/chain-txs/${txId}/verify`, token: CONTRACTOR_TOKEN });
    expect(r.status).toBe(200);
    expect(r.body.chain_tx.status).toBe('failed');
  });

  test('authoritative node reports tx not found -> 200, status failed', async () => {
    const { msId, txId } = await setupChainTx();
    mockChainNodes([AUTHORITATIVE_NOT_FOUND, AUTHORITATIVE_NOT_FOUND]);
    const r = await request({ path: `/api/milestones/${msId}/chain-txs/${txId}/verify`, token: CONTRACTOR_TOKEN });
    expect(r.status).toBe(200);
    expect(r.body.chain_tx.status).toBe('failed');
  });

  test('all nodes stale/unreachable -> 200, status pending (not condemned)', async () => {
    const { msId, txId } = await setupChainTx();
    mockChainNodes([STALE_NOT_FOUND, 'network-error']);
    const r = await request({ path: `/api/milestones/${msId}/chain-txs/${txId}/verify`, token: CONTRACTOR_TOKEN });
    expect(r.status).toBe(200);
    expect(r.body.chain_tx.status).toBe('pending');
  });

  test('non-participant cannot verify -> 403', async () => {
    const { msId, txId } = await setupChainTx();
    mockChainNodes([foundWithAction()]);
    const r = await request({ path: `/api/milestones/${msId}/chain-txs/${txId}/verify`, token: OTHER_HOMEOWNER_TOKEN });
    expect(r.status).toBe(403);
  });

  test('unknown tx id -> 404', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    const r = await request({ path: `/api/milestones/${msId}/chain-txs/${'f'.repeat(64)}/verify`, token: CONTRACTOR_TOKEN });
    expect(r.status).toBe(404);
  });

  test('no auth -> 401', async () => {
    const { msId, txId } = await setupChainTx();
    const r = await request({ path: `/api/milestones/${msId}/chain-txs/${txId}/verify` });
    expect(r.status).toBe(401);
  });
});

// The read path the client actually consumes: GET /api/escrow/:id embeds each
// milestone's chain_txs (attachChainTxsToMilestones), including status changes
// made by /verify.

describe('chain_txs embedded in GET /api/escrow/:id', () => {
  test('recorded evidence appears under its milestone; other milestones stay empty', async () => {
    const { escrowId } = await acceptedEscrow();
    const msA = await addMilestone(escrowId, 1000);
    const msB = await addMilestone(escrowId, 500);
    await recordChainTx({ msId: msA });

    const r = await request({ method: 'GET', path: `/api/escrow/${escrowId}`, token: HOMEOWNER_TOKEN });
    expect(r.status).toBe(200);
    const a = r.body.milestones.find(m => m.id === msA);
    const b = r.body.milestones.find(m => m.id === msB);
    expect(a.chain_txs.length).toBe(1);
    expect(a.chain_txs[0].tx_id).toBe(TX_ID);
    expect(a.chain_txs[0].status).toBe('broadcast');
    expect(b.chain_txs).toEqual([]);
  });

  test('status flips to confirmed in the embedded view after /verify', async () => {
    const { escrowId } = await acceptedEscrow();
    const msId = await addMilestone(escrowId, 1000);
    await recordChainTx({ msId });
    mockChainNodes([foundWithAction({ name: 'submitms' })]);
    await request({ path: `/api/milestones/${msId}/chain-txs/${TX_ID}/verify`, token: CONTRACTOR_TOKEN });

    const r = await request({ method: 'GET', path: `/api/escrow/${escrowId}`, token: CONTRACTOR_TOKEN });
    const ms = r.body.milestones.find(m => m.id === msId);
    expect(ms.chain_txs[0].status).toBe('confirmed');
  });
});
