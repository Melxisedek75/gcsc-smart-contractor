const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const v3Root = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gcsc-fake-pg-'));
const port = 12000 + Math.floor(Math.random() * 1000);

const fakePgPath = path.join(tempRoot, 'fake-pg.js');
const registerPath = path.join(tempRoot, 'register-fake-pg.js');

fs.writeFileSync(fakePgPath, `
let users = [];
let nextId = 1;

function normalize(text) {
  return String(text || '').replace(/\\s+/g, ' ').trim().toLowerCase();
}

class Pool {
  async query(text, params = []) {
    const sql = normalize(text);

    if (
      sql.startsWith('create table') ||
      sql.startsWith('alter table') ||
      sql.startsWith('create index')
    ) {
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('select 1')) {
      return { rows: [{ ok: 1 }], rowCount: 1 };
    }

    if (sql.includes('select count(*)::int as count from users')) {
      return { rows: [{ count: users.length }], rowCount: 1 };
    }

    if (sql.includes('select * from users where lower(email)')) {
      const email = String(params[0] || '').toLowerCase();
      const user = users.find((row) => row.email.toLowerCase() === email);
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }

    if (sql.includes('select * from users where id')) {
      const id = Number(params[0]);
      const user = users.find((row) => row.id === id);
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }

    if (sql.startsWith('insert into users')) {
      const [email, passwordHash, role, fullName, phone, profile, wallet] = params;
      const user = {
        id: nextId++,
        email,
        password_hash: passwordHash,
        role,
        full_name: fullName,
        phone,
        profile,
        wallet,
        is_verified: true,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      users.push(user);
      return { rows: [user], rowCount: 1 };
    }

    if (sql.startsWith('update users set profile')) {
      const [fullName, phone, profile, id] = params;
      const user = users.find((row) => row.id === Number(id));
      if (!user) return { rows: [], rowCount: 0 };
      user.full_name = fullName;
      user.phone = phone;
      user.profile = profile;
      user.updated_at = new Date().toISOString();
      return { rows: [user], rowCount: 1 };
    }

    if (sql.startsWith('update users set wallet')) {
      const [wallet, id] = params;
      const user = users.find((row) => row.id === Number(id));
      if (!user) return { rows: [], rowCount: 0 };
      user.wallet = wallet;
      user.updated_at = new Date().toISOString();
      return { rows: [user], rowCount: 1 };
    }

    throw new Error('Unhandled SQL in fake pg: ' + text);
  }

  async end() {}
}

module.exports = { Pool };
`);

fs.writeFileSync(registerPath, `
const Module = require('module');
const fakePg = require(${JSON.stringify(fakePgPath)});
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'pg') return fakePg;
  return originalLoad.apply(this, arguments);
};
`);

function request(method, pathname, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

async function waitForServer(child) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < 8000) {
    try {
      const health = await request('GET', '/health');
      if (health.status === 200) return health.data;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Server did not start. Last error: ${lastError?.message || 'none'}\\nSTDERR:\\n${child.stderrText || ''}`);
}

(async () => {
  const child = spawn(process.execPath, ['pure-server.js'], {
    cwd: v3Root,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: 'postgres://gcsc:test@localhost:5432/gcsc',
      JWT_SECRET: 'test-secret-minimum-length-for-hs256',
      NODE_OPTIONS: `--require ${registerPath}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stderrText = '';
  child.stderr.on('data', (chunk) => { child.stderrText += chunk.toString(); });

  try {
    const health = await waitForServer(child);
    assert.strictEqual(health.database, 'postgres');

    const register = await request('POST', '/api/auth/register', {
      email: `pg-smoke-${Date.now()}@gcsc.store`,
      password: 'StrongPass123',
      role: 'builder',
      fullName: 'Postgres Smoke Builder',
      phone: '555-0100',
    });
    assert.strictEqual(register.status, 201);
    assert.strictEqual(register.data.user.role, 'contractor');
    assert.ok(register.data.token);
    assert.ok(register.data.user.profile_completion);
    assert.ok(register.data.user.profile_completion.percent < 100);
    assert.ok(register.data.user.profile_completion.missing.includes('companyName'));

    const token = register.data.token;
    const updated = await request('PUT', '/api/auth/profile', {
      companyName: 'Postgres Builder LLC',
      ein: '12-3456789',
      licenseNumber: 'PG-123',
      serviceArea: 'Seattle, WA',
      specialties: ['Kitchen', 'Roofing'],
      logoDataUrl: 'data:image/png;base64,aGVsbG8=',
    }, token);
    assert.strictEqual(updated.status, 200);
    assert.strictEqual(updated.data.user.profile.companyName, 'Postgres Builder LLC');
    assert.strictEqual(updated.data.user.profile.logoDataUrl, 'data:image/png;base64,aGVsbG8=');
    assert.strictEqual(updated.data.user.profile_completion.percent, 100);
    assert.strictEqual(updated.data.user.profile_completion.completed, true);
    assert.deepStrictEqual(updated.data.user.profile_completion.missing, []);

    const invalidLogo = await request('PUT', '/api/auth/profile', {
      logoDataUrl: 'data:text/plain;base64,aGVsbG8=',
    }, token);
    assert.strictEqual(invalidLogo.status, 400);

    const wallet = await request('POST', '/api/wallet/connect', {
      accountName: 'gcscacct111',
      permission: 'active',
      walletType: 'webauth',
    }, token);
    assert.strictEqual(wallet.status, 200);
    assert.strictEqual(wallet.data.wallet.accountName, 'gcscacct111');

    console.log('postgres storage smoke test passed');
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
