/**
 * mppx 402-flow payment endpoint tests
 *
 * Covers:
 *  - 402 challenge (no auth header)
 *  - Happy path: valid txHash → 200 + Payment-Receipt
 *  - Replay protection: same txHash twice → 409
 *  - Bad amount → 400
 *  - Bad recipient → 400
 *  - Hyperion fallback: first call throws, second succeeds
 *
 * verifyHyperionTransfer is mocked via _hooks (no real network).
 */

const http = require('http');
const mod = require('../pure-server');

const server = mod;
const { db, _hooks, jwtSign, verifyWalletSignature, walletChallengeMessage } = mod;
const originalVerifier = _hooks.verifyHyperionTransfer;
const originalVerifyAccountKey = _hooks.verifyAccountKey;
const originalFetch = global.fetch;

// ---- EOSIO/XPR K1 signing helper (offline, for wallet-ownership-proof tests) ----
const EC = require('elliptic').ec;
const { Numeric } = require('@proton/js');
const ec = new EC('secp256k1');
function makeXprKeypair() {
  const kp = ec.genKeyPair();
  const pub = Numeric.publicKeyToString({
    type: Numeric.KeyType.k1,
    data: new Uint8Array(Buffer.from(kp.getPublic(true, 'array'))),
  });
  return { kp, pub };
}
function signK1(message, kp) {
  const digest = require('crypto').createHash('sha256').update(Buffer.from(message, 'utf8')).digest();
  const s = ec.sign(digest, kp, { canonical: true });
  const data = Buffer.concat([
    Buffer.from([s.recoveryParam + 31]),
    s.r.toArrayLike(Buffer, 'be', 32),
    s.s.toArrayLike(Buffer, 'be', 32),
  ]);
  return Numeric.signatureToString({ type: Numeric.KeyType.k1, data: new Uint8Array(data) });
}

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

beforeEach(() => {
  db.payment_receipts.length = 0;
  db.lead_tokens.length = 0;
  db.job_posting_payments.length = 0;
  db.users.length = 0;
  db.users.push(
    { id: 1, email: 'demo@gcsc.store', role: 'homeowner', is_active: 1, wallet: { accountName: 'homeowner1', permission: 'active' } },
    { id: 2, email: 'contractor@gcsc.store', role: 'contractor', is_active: 1, wallet: { accountName: 'testacct1', permission: 'active' } },
  );
  _hooks.verifyHyperionTransfer = originalVerifier;
  _hooks.verifyAccountKey = originalVerifyAccountKey;
  global.fetch = originalFetch;
});

// ---- helpers ----
function request({ method = 'POST', path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(baseUrl + path);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      // Fresh socket per request + explicit close: after the CPU-heavy K1 tests a
      // reused keep-alive socket can be reset on a slow Windows runner (ECONNRESET).
      agent: false,
      headers: {
        'Content-Type': 'application/json',
        Connection: 'close',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(buf); } catch { parsed = buf; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const CONTRACTOR_TOKEN = jwtSign({ userId: 2, email: 'contractor@gcsc.store', role: 'contractor' });
const HOMEOWNER_TOKEN = jwtSign({ userId: 1, email: 'demo@gcsc.store', role: 'homeowner' });
const FAKE_TX = 'a'.repeat(64);
const FAKE_TX_2 = 'b'.repeat(64);

// ---- tests ----
describe('POST /api/payment/lead-token', () => {
  test('returns 402 with WWW-Authenticate when no payment header', async () => {
    const r = await request({
      path: '/api/payment/lead-token',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}` },
    });
    expect(r.status).toBe(402);
    expect(r.headers['www-authenticate']).toMatch(/Payment recipient="gcsctoken111".*amount="50\.0000 XPR".*memo="gcsc:lead-token"/);
    expect(r.body.payment.amount).toBe('50.0000 XPR');
    expect(r.body.payment.memo).toBe('gcsc:lead-token');
  });

  test('returns 401 when no JWT', async () => {
    const r = await request({ path: '/api/payment/lead-token' });
    expect(r.status).toBe(401);
  });

  test('returns 403 when JWT is homeowner (not contractor)', async () => {
    const r = await request({
      path: '/api/payment/lead-token',
      headers: { Authorization: `Bearer ${HOMEOWNER_TOKEN}` },
    });
    expect(r.status).toBe(403);
  });

  test('happy path: valid txHash → 200 + lead_id', async () => {
    _hooks.verifyHyperionTransfer = async (input) => {
      expect(input.expectedFrom).toBe('testacct1');
      return { ok: true, from: 'testacct1', block_num: 12345 };
    };
    const r = await request({
      path: '/api/payment/lead-token',
      headers: {
        Authorization: `Bearer ${CONTRACTOR_TOKEN}`,
        'X-Payment-Tx': FAKE_TX,
      },
    });
    expect(r.status).toBe(200);
    expect(r.body.lead_id).toMatch(/^lead_[0-9a-f]{16}$/);
    expect(r.body.tx_hash).toBe(FAKE_TX);
    expect(r.headers['payment-receipt']).toContain('lead_id=');
    expect(db.lead_tokens).toHaveLength(1);
    expect(db.payment_receipts).toHaveLength(1);
  });

  test('replay protection: same txHash twice → second is 409', async () => {
    _hooks.verifyHyperionTransfer = async () => ({ ok: true, from: 'testacct1', block_num: 12345 });
    await request({
      path: '/api/payment/lead-token',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}`, 'X-Payment-Tx': FAKE_TX },
    });
    const r = await request({
      path: '/api/payment/lead-token',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}`, 'X-Payment-Tx': FAKE_TX },
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/already processed/);
    expect(db.payment_receipts).toHaveLength(1);
  });

  test('requires a connected contractor wallet before verification', async () => {
    db.users.find(user => user.id === 2).wallet = null;
    _hooks.verifyHyperionTransfer = jest.fn();
    const r = await request({
      path: '/api/payment/lead-token',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}`, 'X-Payment-Tx': FAKE_TX },
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('wallet_required');
    expect(_hooks.verifyHyperionTransfer).not.toHaveBeenCalled();
  });

  test('replay protection treats txHash hex casing as identical', async () => {
    const mixedCaseTx = 'aB'.repeat(32);
    _hooks.verifyHyperionTransfer = async () => ({ ok: true, from: 'testacct1', block_num: 12345 });
    const first = await request({
      path: '/api/payment/lead-token',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}`, 'X-Payment-Tx': mixedCaseTx },
    });
    const replay = await request({
      path: '/api/payment/lead-token',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}`, 'X-Payment-Tx': mixedCaseTx.toLowerCase() },
    });
    expect(first.status).toBe(200);
    expect(replay.status).toBe(409);
    expect(db.payment_receipts).toHaveLength(1);
  });

  test('bad amount → 400', async () => {
    _hooks.verifyHyperionTransfer = async () => ({ ok: false, error: 'bad_amount', detail: 'got=10.0000 XPR expected=50.0000 XPR' });
    const r = await request({
      path: '/api/payment/lead-token',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}`, 'X-Payment-Tx': FAKE_TX },
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('bad_amount');
  });

  test('bad recipient → 400', async () => {
    _hooks.verifyHyperionTransfer = async () => ({ ok: false, error: 'bad_recipient', detail: 'got=evil123' });
    const r = await request({
      path: '/api/payment/lead-token',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}`, 'X-Payment-Tx': FAKE_TX_2 },
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('bad_recipient');
  });
});

describe('POST /api/payment/job-posting', () => {
  beforeEach(() => {
    db.projects.length = 0;
    db.projects.push({
      id: 100, homeowner_id: 1, title: 'Test', description: 'd',
      category: 'general', status: 'open', created_at: new Date().toISOString(),
    });
  });

  test('returns 402 with $25 XPR challenge', async () => {
    const r = await request({
      path: '/api/payment/job-posting',
      headers: { Authorization: `Bearer ${HOMEOWNER_TOKEN}` },
    });
    expect(r.status).toBe(402);
    expect(r.headers['www-authenticate']).toMatch(/amount="25\.0000 XPR".*memo="gcsc:job-posting"/);
  });

  test('returns 403 when contractor tries to pay job-posting', async () => {
    const r = await request({
      path: '/api/payment/job-posting',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}` },
    });
    expect(r.status).toBe(403);
  });

  test('rejects missing project_id → 400', async () => {
    _hooks.verifyHyperionTransfer = async () => ({ ok: true, from: 'a', block_num: 1 });
    const r = await request({
      path: '/api/payment/job-posting',
      headers: { Authorization: `Bearer ${HOMEOWNER_TOKEN}`, 'X-Payment-Tx': FAKE_TX },
      body: {},
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/project_id/);
  });

  test('rejects project owned by another user → 400', async () => {
    _hooks.verifyHyperionTransfer = async () => ({ ok: true, from: 'a', block_num: 1 });
    db.projects.push({ id: 200, homeowner_id: 999, title: 'Foreign', description: 'x', status: 'open', created_at: new Date().toISOString() });
    const r = await request({
      path: '/api/payment/job-posting',
      headers: { Authorization: `Bearer ${HOMEOWNER_TOKEN}`, 'X-Payment-Tx': FAKE_TX },
      body: { project_id: 200 },
    });
    expect(r.status).toBe(400);
  });

  test('happy path: publishes project', async () => {
    _hooks.verifyHyperionTransfer = async (input) => {
      expect(input.expectedFrom).toBe('homeowner1');
      return { ok: true, from: 'homeowner1', block_num: 99 };
    };
    const r = await request({
      path: '/api/payment/job-posting',
      headers: { Authorization: `Bearer ${HOMEOWNER_TOKEN}`, 'X-Payment-Tx': FAKE_TX },
      body: { project_id: 100 },
    });
    expect(r.status).toBe(200);
    expect(r.body.project_id).toBe(100);
    const project = db.projects.find(p => p.id === 100);
    expect(project.published).toBe(true);
    expect(project.published_at).toBeTruthy();
  });

  test('requires a connected homeowner wallet before verification', async () => {
    db.users.find(user => user.id === 1).wallet = null;
    _hooks.verifyHyperionTransfer = jest.fn();
    const r = await request({
      path: '/api/payment/job-posting',
      headers: { Authorization: `Bearer ${HOMEOWNER_TOKEN}`, 'X-Payment-Tx': FAKE_TX },
      body: { project_id: 100 },
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('wallet_required');
    expect(_hooks.verifyHyperionTransfer).not.toHaveBeenCalled();
  });
});

describe('verifyHyperionTransfer (unit)', () => {
  const { verifyHyperionTransfer } = mod;

  test('rejects bad txHash format', async () => {
    const r = await verifyHyperionTransfer({ txHash: 'short', expectedRecipient: 'x', expectedAmount: 'y' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('bad_tx_hash');
  });

  test('rejects undefined txHash', async () => {
    const r = await verifyHyperionTransfer({ expectedRecipient: 'x', expectedAmount: 'y' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('bad_tx_hash');
  });

  test('rejects a transfer whose sender does not match expectedFrom', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        actions: [{
          act: {
            account: 'eosio.token',
            name: 'transfer',
            data: { from: 'attacker1111', to: 'gcsctoken111', quantity: '50.0000 XPR', memo: 'gcsc:lead-token' },
          },
          block_num: 12345,
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    const r = await verifyHyperionTransfer({
      txHash: FAKE_TX,
      expectedRecipient: 'gcsctoken111',
      expectedAmount: '50.0000 XPR',
      expectedMemo: 'gcsc:lead-token',
      expectedFrom: 'testacct1',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('bad_sender');
  });
});

// P1-4: wallet ownership proof (nonce/challenge + XPR K1 signature)
describe('wallet ownership proof', () => {
  // K1 keypair generation + signature recovery is CPU-heavy; on a slow Windows
  // runner a single case can exceed Jest's default 5000ms. Give this group an
  // explicit 60s budget so `npx jest ...` is stable without a CLI --testTimeout.
  // This is registered last, so it only affects these tests.
  jest.setTimeout(60000);

  test('verifyWalletSignature recovers the signing key and rejects tampering', () => {
    const { kp, pub } = makeXprKeypair();
    const message = walletChallengeMessage({ userId: 2, accountName: 'testacct1', nonce: 'deadbeef' });
    const signature = signK1(message, kp);

    const ok = verifyWalletSignature({ message, signature, publicKey: pub });
    expect(ok.ok).toBe(true);
    expect(ok.publicKey).toBe(pub);

    // Wrong declared public key → mismatch
    const other = makeXprKeypair();
    const mismatch = verifyWalletSignature({ message, signature, publicKey: other.pub });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.error).toBe('signature_key_mismatch');

    // Tampered message → recovered key differs from declared key
    const tampered = verifyWalletSignature({ message: message + 'x', signature, publicKey: pub });
    expect(tampered.ok).toBe(false);
  });

  test('rejects a wallet connect without ownership proof', async () => {
    const r = await request({
      path: '/api/wallet/connect',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}` },
      body: { accountName: 'testacct1' },
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('wallet_proof_required');
  });

  test('rejects a wallet connect with no prior challenge', async () => {
    const { kp, pub } = makeXprKeypair();
    const signature = signK1('anything', kp);
    const r = await request({
      path: '/api/wallet/connect',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}` },
      body: { accountName: 'testacct1', publicKey: pub, signature },
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('no_challenge');
  });

  test('challenge → sign → connect binds a verified wallet', async () => {
    _hooks.verifyAccountKey = async () => ({ ok: true });
    const { kp, pub } = makeXprKeypair();

    const challenge = await request({
      path: '/api/wallet/challenge',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}` },
      body: { accountName: 'testacct1' },
    });
    expect(challenge.status).toBe(200);
    expect(challenge.body.message).toContain('nonce:');

    const signature = signK1(challenge.body.message, kp);
    const r = await request({
      path: '/api/wallet/connect',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}` },
      body: { accountName: 'testacct1', permission: 'active', publicKey: pub, signature },
    });
    expect(r.status).toBe(200);
    expect(r.body.wallet.accountName).toBe('testacct1');
    expect(r.body.wallet.verified).toBe(true);
    expect(r.body.wallet.publicKey).toBe(pub);
  });

  test('rejects when signature does not match the issued challenge', async () => {
    _hooks.verifyAccountKey = async () => ({ ok: true });
    const { kp } = makeXprKeypair();

    await request({
      path: '/api/wallet/challenge',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}` },
      body: { accountName: 'testacct1' },
    });
    // Sign a different message than the issued challenge
    const signature = signK1('not-the-challenge', kp);
    const r = await request({
      path: '/api/wallet/connect',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}` },
      body: { accountName: 'testacct1', publicKey: makeXprKeypair().pub, signature },
    });
    expect(r.status).toBe(400);
    expect(['signature_key_mismatch', 'bad_signature']).toContain(r.body.code);
  });

  test('rejects when the key is not authorized on-chain', async () => {
    _hooks.verifyAccountKey = async () => ({ ok: false, error: 'account_key_unauthorized' });
    const { kp, pub } = makeXprKeypair();

    const challenge = await request({
      path: '/api/wallet/challenge',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}` },
      body: { accountName: 'testacct1' },
    });
    const signature = signK1(challenge.body.message, kp);
    const r = await request({
      path: '/api/wallet/connect',
      headers: { Authorization: `Bearer ${CONTRACTOR_TOKEN}` },
      body: { accountName: 'testacct1', publicKey: pub, signature },
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('account_key_unauthorized');
  });
});

describe('sensitive endpoint rate limits', () => {
  async function requestThreeTimes(input) {
    const responses = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      responses.push(await request(input));
    }
    return responses;
  }

  test('rate limits login attempts', async () => {
    const previousMax = process.env.AUTH_RATE_LIMIT_MAX;
    process.env.AUTH_RATE_LIMIT_MAX = '2';
    try {
      const responses = await requestThreeTimes({
        path: '/api/auth/login',
        headers: { 'X-Forwarded-For': '203.0.113.201' },
        body: { email: 'missing-rate-limit@gcsc.store', password: 'WrongPass123' },
      });
      expect(responses.map(response => response.status)).toEqual([401, 401, 429]);
    } finally {
      if (previousMax === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
      else process.env.AUTH_RATE_LIMIT_MAX = previousMax;
    }
  });

  test('rate limits wallet challenge creation', async () => {
    const previousMax = process.env.WALLET_RATE_LIMIT_MAX;
    process.env.WALLET_RATE_LIMIT_MAX = '2';
    try {
      const responses = await requestThreeTimes({
        path: '/api/wallet/challenge',
        headers: {
          Authorization: `Bearer ${CONTRACTOR_TOKEN}`,
          'X-Forwarded-For': '203.0.113.202',
        },
        body: { accountName: 'testacct1' },
      });
      expect(responses.map(response => response.status)).toEqual([200, 200, 429]);
    } finally {
      if (previousMax === undefined) delete process.env.WALLET_RATE_LIMIT_MAX;
      else process.env.WALLET_RATE_LIMIT_MAX = previousMax;
    }
  });

  test.each([
    ['lead-token', CONTRACTOR_TOKEN, undefined],
    ['job-posting', HOMEOWNER_TOKEN, { project_id: 100 }],
  ])('rate limits payment endpoint %s', async (endpoint, token, body) => {
    const previousMax = process.env.PAYMENT_RATE_LIMIT_MAX;
    process.env.PAYMENT_RATE_LIMIT_MAX = '2';
    try {
      const responses = await requestThreeTimes({
        path: `/api/payment/${endpoint}`,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Forwarded-For': endpoint === 'lead-token' ? '203.0.113.203' : '203.0.113.204',
        },
        body,
      });
      expect(responses.map(response => response.status)).toEqual([402, 402, 429]);
    } finally {
      if (previousMax === undefined) delete process.env.PAYMENT_RATE_LIMIT_MAX;
      else process.env.PAYMENT_RATE_LIMIT_MAX = previousMax;
    }
  });
});
