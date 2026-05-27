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
let userDocuments = [];
let auditEvents = [];
let nextId = 1;
let nextDocumentId = 1;
let nextAuditEventId = 1;

function normalize(text) {
  return String(text || '').replace(/\\s+/g, ' ').trim().toLowerCase();
}

class Pool {
  async query(text, params = []) {
    const sql = normalize(text);

    if (
      sql.startsWith('create table') ||
      sql.startsWith('alter table') ||
      sql.startsWith('create index') ||
      sql.startsWith('create unique index')
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

    if (sql.startsWith('insert into user_documents')) {
      const [userId, documentType, fileName, mimeType, fileDataUrl, fileSize, fileSha256, status, reviewNote] = params;
      const document = {
        id: nextDocumentId++,
        user_id: Number(userId),
        document_type: documentType,
        file_name: fileName,
        mime_type: mimeType,
        file_data_url: fileDataUrl,
        file_size: fileSize,
        file_sha256: fileSha256,
        status,
        review_note: reviewNote || '',
        submitted_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      userDocuments = userDocuments.filter((item) => !(item.user_id === document.user_id && item.document_type === document.document_type));
      userDocuments.push(document);
      return { rows: [document], rowCount: 1 };
    }

    if (sql.includes('select * from user_documents where user_id')) {
      const userId = Number(params[0]);
      const rows = userDocuments.filter((row) => row.user_id === userId);
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('select * from user_documents where status')) {
      const status = String(params[0] || '');
      const rows = userDocuments.filter((row) => row.status === status);
      return { rows, rowCount: rows.length };
    }

    if (sql.includes('select * from user_documents order by')) {
      return { rows: userDocuments, rowCount: userDocuments.length };
    }

    if (sql.includes('select * from user_documents where id')) {
      const id = Number(params[0]);
      const document = userDocuments.find((row) => row.id === id);
      return { rows: document ? [document] : [], rowCount: document ? 1 : 0 };
    }

    if (sql.startsWith('update user_documents set status')) {
      const [status, reviewNote, reviewedBy, id] = params;
      const document = userDocuments.find((row) => row.id === Number(id));
      if (!document) return { rows: [], rowCount: 0 };
      document.status = status;
      document.review_note = reviewNote || '';
      document.reviewed_by = reviewedBy;
      document.reviewed_at = new Date().toISOString();
      document.updated_at = new Date().toISOString();
      return { rows: [document], rowCount: 1 };
    }

    if (sql.startsWith('insert into audit_events')) {
      const [actorId, targetUserId, action, entityType, entityId, metadata, ipAddress, userAgent] = params;
      const event = {
        id: nextAuditEventId++,
        actor_id: actorId === null || actorId === undefined ? null : Number(actorId),
        target_user_id: targetUserId === null || targetUserId === undefined ? null : Number(targetUserId),
        action,
        entity_type: entityType,
        entity_id: entityId === null || entityId === undefined ? null : Number(entityId),
        metadata,
        ip_address: ipAddress || '',
        user_agent: userAgent || '',
        created_at: new Date().toISOString(),
      };
      auditEvents.push(event);
      return { rows: [event], rowCount: 1 };
    }

    if (sql.includes('select * from audit_events')) {
      let rows = auditEvents;
      if (sql.includes('where action =')) {
        rows = rows.filter((row) => row.action === params[0]);
      }
      return { rows: rows.slice().reverse(), rowCount: rows.length };
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

function request(method, pathname, body, token, extraHeaders = {}) {
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
        ...extraHeaders,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: data ? JSON.parse(data) : {} });
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
      CORS_ALLOWED_ORIGINS: 'https://gcsc.store,http://localhost:5173',
      AUTH_RATE_LIMIT_MAX: '2',
      AUTH_RATE_LIMIT_WINDOW_MS: '60000',
      NODE_OPTIONS: `--require ${registerPath}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stderrText = '';
  child.stderr.on('data', (chunk) => { child.stderrText += chunk.toString(); });

  try {
    const health = await waitForServer(child);
    assert.strictEqual(health.database, 'postgres');

    const allowedPreflight = await request('OPTIONS', '/api/auth/login', null, null, {
      Origin: 'https://gcsc.store',
      'Access-Control-Request-Method': 'POST',
    });
    assert.strictEqual(allowedPreflight.status, 204);
    assert.strictEqual(allowedPreflight.headers['access-control-allow-origin'], 'https://gcsc.store');
    assert.notStrictEqual(allowedPreflight.headers['access-control-allow-origin'], '*');

    const blockedPreflight = await request('OPTIONS', '/api/auth/login', null, null, {
      Origin: 'https://not-gcsc.example',
      'Access-Control-Request-Method': 'POST',
    });
    assert.strictEqual(blockedPreflight.status, 403);
    assert.notStrictEqual(blockedPreflight.headers['access-control-allow-origin'], '*');

    const firstBadLogin = await request('POST', '/api/auth/login', {
      email: 'missing@gcsc.store',
      password: 'WrongPass123',
    });
    const secondBadLogin = await request('POST', '/api/auth/login', {
      email: 'missing@gcsc.store',
      password: 'WrongPass123',
    });
    const rateLimitedLogin = await request('POST', '/api/auth/login', {
      email: 'missing@gcsc.store',
      password: 'WrongPass123',
    });
    assert.strictEqual(firstBadLogin.status, 401);
    assert.strictEqual(secondBadLogin.status, 401);
    assert.strictEqual(rateLimitedLogin.status, 429);
    assert.match(rateLimitedLogin.data.error, /too many/i);

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

    const compliance = await request('GET', '/api/auth/compliance', null, token);
    assert.strictEqual(compliance.status, 200);
    assert.strictEqual(compliance.data.profile_completion.percent, 100);
    assert.strictEqual(compliance.data.overall_status, 'documents_missing');
    assert.strictEqual(compliance.data.documents_submitted, false);
    assert.strictEqual(compliance.data.required_documents.length, 3);
    assert.strictEqual(compliance.data.required_documents[0].status, 'missing');

    const license = await request('POST', '/api/auth/documents', {
      documentType: 'contractor_license',
      fileName: 'license.pdf',
      mimeType: 'application/pdf',
      fileDataUrl: 'data:application/pdf;base64,aGVsbG8=',
      reviewNote: 'Washington contractor license',
    }, token);
    assert.strictEqual(license.status, 201);
    assert.strictEqual(license.data.document.status, 'submitted');
    assert.strictEqual(license.data.document.document_type, 'contractor_license');
    assert.ok(license.data.document.file_sha256);

    const invalidDocument = await request('POST', '/api/auth/documents', {
      documentType: 'random_document',
      fileName: 'bad.pdf',
      mimeType: 'application/pdf',
      fileDataUrl: 'data:application/pdf;base64,aGVsbG8=',
    }, token);
    assert.strictEqual(invalidDocument.status, 400);

    await request('POST', '/api/auth/documents', {
      documentType: 'insurance_certificate',
      fileName: 'insurance.pdf',
      mimeType: 'application/pdf',
      fileDataUrl: 'data:application/pdf;base64,aGVsbG8=',
    }, token);
    await request('POST', '/api/auth/documents', {
      documentType: 'business_ein',
      fileName: 'ein.pdf',
      mimeType: 'application/pdf',
      fileDataUrl: 'data:application/pdf;base64,aGVsbG8=',
    }, token);

    const documents = await request('GET', '/api/auth/documents', null, token);
    assert.strictEqual(documents.status, 200);
    assert.strictEqual(documents.data.documents.length, 3);

    const adminToken = (() => {
      const crypto = require('crypto');
      const base64Url = (value) => Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const body = base64Url(JSON.stringify({ userId: 999, email: 'admin@gcsc.store', role: 'admin', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }));
      const sig = crypto.createHmac('sha256', 'test-secret-minimum-length-for-hs256').update(header + '.' + body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return header + '.' + body + '.' + sig;
    })();

    const adminDocuments = await request('GET', '/api/admin/documents?status=submitted', null, adminToken);
    assert.strictEqual(adminDocuments.status, 200);
    assert.strictEqual(adminDocuments.data.documents.length, 3);
    assert.strictEqual(adminDocuments.data.documents[0].user.full_name, 'Postgres Smoke Builder');
    assert.strictEqual(adminDocuments.data.documents[0].user.companyName, 'Postgres Builder LLC');

    const pendingCompliance = await request('GET', '/api/auth/compliance', null, token);
    assert.strictEqual(pendingCompliance.status, 200);
    assert.strictEqual(pendingCompliance.data.documents_submitted, true);
    assert.strictEqual(pendingCompliance.data.documents_approved, false);
    assert.strictEqual(pendingCompliance.data.overall_status, 'pending_review');

    const wallet = await request('POST', '/api/wallet/connect', {
      accountName: 'gcscacct111',
      permission: 'active',
      walletType: 'webauth',
    }, token);
    assert.strictEqual(wallet.status, 200);
    assert.strictEqual(wallet.data.wallet.accountName, 'gcscacct111');

    for (const doc of documents.data.documents) {
      const reviewed = await request('PUT', `/api/admin/documents/${doc.id}/review`, {
        status: 'approved',
        reviewNote: 'Approved in smoke test',
      }, adminToken);
      assert.strictEqual(reviewed.status, 200);
      assert.strictEqual(reviewed.data.document.status, 'approved');
    }

    const auditEvents = await request('GET', '/api/admin/audit-events', null, adminToken);
    assert.strictEqual(auditEvents.status, 200);
    const auditActions = auditEvents.data.events.map((event) => event.action);
    assert.ok(auditActions.includes('profile.updated'));
    assert.ok(auditActions.includes('document.submitted'));
    assert.ok(auditActions.includes('document.reviewed'));
    assert.ok(auditActions.includes('wallet.connected'));
    const reviewedEvent = auditEvents.data.events.find((event) => event.action === 'document.reviewed');
    assert.strictEqual(reviewedEvent.target_user_id, register.data.user.id);
    assert.strictEqual(reviewedEvent.metadata.status, 'approved');

    const verifiedCompliance = await request('GET', '/api/auth/compliance', null, token);
    assert.strictEqual(verifiedCompliance.status, 200);
    assert.strictEqual(verifiedCompliance.data.documents_approved, true);
    assert.strictEqual(verifiedCompliance.data.wallet_connected, true);
    assert.strictEqual(verifiedCompliance.data.overall_status, 'verified');

    console.log('postgres storage smoke test passed');
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
