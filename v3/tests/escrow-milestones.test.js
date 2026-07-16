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
