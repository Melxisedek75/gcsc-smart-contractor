const http = require('http');
const { Pool } = require('pg');

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for payment receipt PostgreSQL tests');
}

process.env.DATABASE_URL = databaseUrl;
process.env.PGSSL = 'false';

const mod = require('../pure-server');
const { db, _hooks, jwtSign } = mod;

const CONTRACTOR_TOKEN = jwtSign({ userId: 2, email: 'contractor@gcsc.store', role: 'contractor' });
const HOMEOWNER_TOKEN = jwtSign({ userId: 1, email: 'homeowner@gcsc.store', role: 'homeowner' });
const LEAD_TX = 'c'.repeat(64);
const JOB_TX = 'd'.repeat(64);

let baseUrl;
let listener;
let pool;
let originalVerifier;

function request({ path, token, txHash, body }) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const url = new URL(baseUrl + path);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(txHash ? { 'X-Payment-Tx': txHash } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: JSON.parse(responseBody),
        });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function countRows(table, txHash) {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE tx_hash = $1`, [txHash]);
  return result.rows[0].count;
}

beforeAll(async () => {
  expect(typeof mod.initStorage).toBe('function');
  expect(typeof mod.closeStorage).toBe('function');

  await mod.initStorage();
  pool = new Pool({ connectionString: databaseUrl });
  originalVerifier = _hooks.verifyHyperionTransfer;

  listener = mod.listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${listener.address().port}`;
}, 30000);

beforeEach(async () => {
  await pool.query(`
    TRUNCATE TABLE job_posting_payments, lead_tokens, payment_receipts, projects, users
    RESTART IDENTITY CASCADE
  `);
  await pool.query(`
    INSERT INTO users (id, email, password_hash, role, full_name, wallet, is_verified, is_active)
    VALUES
      (1, 'homeowner@gcsc.store', 'test-hash', 'homeowner', 'Test Homeowner', '{"accountName":"homeowner1","permission":"active"}'::jsonb, TRUE, TRUE),
      (2, 'contractor@gcsc.store', 'test-hash', 'contractor', 'Test Contractor', '{"accountName":"contractor1","permission":"active"}'::jsonb, TRUE, TRUE)
  `);
  await pool.query(`
    INSERT INTO projects (id, homeowner_id, title, description, category, status)
    VALUES (100, 1, 'Postgres payment project', 'test', 'general', 'open')
  `);

  db.payment_receipts.length = 0;
  db.lead_tokens.length = 0;
  db.job_posting_payments.length = 0;
  db.projects.length = 0;
  _hooks.verifyHyperionTransfer = async (input) => {
    const expectedByRole = input.expectedAmount === '50.0000 XPR' ? 'contractor1' : 'homeowner1';
    expect(input.expectedFrom).toBe(expectedByRole);
    return { ok: true, from: expectedByRole, block_num: 12345 };
  };
});

afterAll(async () => {
  _hooks.verifyHyperionTransfer = originalVerifier;
  if (listener) await new Promise(resolve => listener.close(resolve));
  if (pool) await pool.end();
  await mod.closeStorage();
});

test('lead-token receipt survives in-memory reset and duplicate returns 409', async () => {
  const first = await request({
    path: '/api/payment/lead-token',
    token: CONTRACTOR_TOKEN,
    txHash: LEAD_TX.toUpperCase(),
  });
  expect(first.status).toBe(200);

  db.payment_receipts.length = 0;
  db.lead_tokens.length = 0;

  const replay = await request({
    path: '/api/payment/lead-token',
    token: CONTRACTOR_TOKEN,
    txHash: LEAD_TX,
  });
  expect(replay.status).toBe(409);
  expect(await countRows('payment_receipts', LEAD_TX)).toBe(1);
  expect(await countRows('lead_tokens', LEAD_TX)).toBe(1);
});

test('job-posting receipt and project publication persist and duplicate returns 409', async () => {
  const first = await request({
    path: '/api/payment/job-posting',
    token: HOMEOWNER_TOKEN,
    txHash: JOB_TX,
    body: { project_id: 100 },
  });
  expect(first.status).toBe(200);

  db.payment_receipts.length = 0;
  db.job_posting_payments.length = 0;
  db.projects.length = 0;

  const replay = await request({
    path: '/api/payment/job-posting',
    token: HOMEOWNER_TOKEN,
    txHash: JOB_TX,
    body: { project_id: 100 },
  });
  expect(replay.status).toBe(409);
  expect(await countRows('payment_receipts', JOB_TX)).toBe(1);
  expect(await countRows('job_posting_payments', JOB_TX)).toBe(1);

  const project = await pool.query('SELECT published, published_at FROM projects WHERE id = 100');
  expect(project.rows[0].published).toBe(true);
  expect(project.rows[0].published_at).toBeTruthy();
});

test('concurrent duplicate lead-token requests create one atomic receipt', async () => {
  const results = await Promise.all([
    request({ path: '/api/payment/lead-token', token: CONTRACTOR_TOKEN, txHash: LEAD_TX }),
    request({ path: '/api/payment/lead-token', token: CONTRACTOR_TOKEN, txHash: LEAD_TX }),
  ]);

  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  expect(await countRows('payment_receipts', LEAD_TX)).toBe(1);
  expect(await countRows('lead_tokens', LEAD_TX)).toBe(1);
});
