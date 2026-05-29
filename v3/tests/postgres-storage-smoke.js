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
let financingPrechecks = [];
let nextId = 1;
let nextDocumentId = 1;
let nextAuditEventId = 1;
let nextFinancingPrecheckId = 1;

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

    if (sql.startsWith('update milestone_chain_txs set action = case')) {
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

    if (sql.startsWith('insert into financing_prechecks')) {
      const [userId, role, productType, state, context, safetyAcknowledged, status] = params;
      const precheck = {
        id: nextFinancingPrecheckId++,
        user_id: Number(userId),
        role,
        product_type: productType,
        state,
        context,
        safety_acknowledged: Boolean(safetyAcknowledged),
        status,
        admin_note: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      financingPrechecks.push(precheck);
      return { rows: [precheck], rowCount: 1 };
    }

    if (sql.includes('select * from financing_prechecks')) {
      let rows = financingPrechecks;
      if (sql.includes('where user_id')) rows = rows.filter((row) => row.user_id === Number(params[0]));
      if (sql.includes('where status')) rows = rows.filter((row) => row.status === params[0]);
      return { rows, rowCount: rows.length };
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
      ADMIN_BOOTSTRAP_ENABLED: 'true',
      ADMIN_EMAIL: 'admin-smoke@gcsc.store',
      ADMIN_PASSWORD: 'AdminSmokePass123!',
      ADMIN_FULL_NAME: 'Smoke Admin',
      NODE_OPTIONS: `--require ${registerPath}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stderrText = '';
  child.stderr.on('data', (chunk) => { child.stderrText += chunk.toString(); });

  try {
    const health = await waitForServer(child);
    assert.strictEqual(health.database, 'postgres');

    const healthHeaders = await request('GET', '/health');
    assert.strictEqual(healthHeaders.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(healthHeaders.headers['x-frame-options'], 'DENY');
    assert.strictEqual(healthHeaders.headers['referrer-policy'], 'no-referrer');
    assert.strictEqual(healthHeaders.headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');
    assert.strictEqual(healthHeaders.headers['content-security-policy'], "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    assert.strictEqual(healthHeaders.headers['permissions-policy'], 'geolocation=(), camera=(), microphone=()');

    const adminLogin = await request('POST', '/api/auth/login', {
      email: 'admin-smoke@gcsc.store',
      password: 'AdminSmokePass123!',
    }, null, { 'X-Forwarded-For': '203.0.113.10' });
    assert.strictEqual(adminLogin.status, 200);
    assert.strictEqual(adminLogin.data.user.role, 'admin');
    assert.strictEqual(adminLogin.data.user.email, 'admin-smoke@gcsc.store');

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

    const unauthAdminDocuments = await request('GET', '/api/admin/documents?status=submitted');
    assert.strictEqual(unauthAdminDocuments.status, 401);

    const nonAdminDocuments = await request('GET', '/api/admin/documents?status=submitted', null, token);
    assert.strictEqual(nonAdminDocuments.status, 403);

    const nonAdminAuditEvents = await request('GET', '/api/admin/audit-events', null, token);
    assert.strictEqual(nonAdminAuditEvents.status, 403);

    const nonAdminPrechecks = await request('GET', '/api/admin/financing-prechecks?status=demo_precheck', null, token);
    assert.strictEqual(nonAdminPrechecks.status, 403);

    const nonAdminReview = await request('PUT', `/api/admin/documents/${documents.data.documents[0].id}/review`, {
      status: 'approved',
      reviewNote: 'Non-admin attempt must be blocked',
    }, token);
    assert.strictEqual(nonAdminReview.status, 403);

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

    const licenseForRejection = documents.data.documents.find((doc) => doc.document_type === 'contractor_license');
    const rejectionNote = 'License image is unreadable; please upload a clearer copy.';
    const rejected = await request('PUT', `/api/admin/documents/${licenseForRejection.id}/review`, {
      status: 'rejected',
      reviewNote: rejectionNote,
    }, adminToken);
    assert.strictEqual(rejected.status, 200);
    assert.strictEqual(rejected.data.document.status, 'rejected');
    assert.strictEqual(rejected.data.document.review_note, rejectionNote);

    const rejectedCompliance = await request('GET', '/api/auth/compliance', null, token);
    assert.strictEqual(rejectedCompliance.status, 200);
    assert.strictEqual(rejectedCompliance.data.overall_status, 'rejected');

    const resubmittedLicense = await request('POST', '/api/auth/documents', {
      documentType: 'contractor_license',
      fileName: 'license-clear.pdf',
      mimeType: 'application/pdf',
      fileDataUrl: 'data:application/pdf;base64,aGVsbG8=',
      reviewNote: 'Clearer Washington contractor license',
    }, token);
    assert.strictEqual(resubmittedLicense.status, 201);
    assert.strictEqual(resubmittedLicense.data.document.status, 'submitted');

    const resubmittedCompliance = await request('GET', '/api/auth/compliance', null, token);
    assert.strictEqual(resubmittedCompliance.status, 200);
    assert.strictEqual(resubmittedCompliance.data.overall_status, 'pending_review');

    const wallet = await request('POST', '/api/wallet/connect', {
      accountName: 'gcscacct111',
      permission: 'active',
      walletType: 'webauth',
    }, token);
    assert.strictEqual(wallet.status, 200);
    assert.strictEqual(wallet.data.wallet.accountName, 'gcscacct111');

    const documentsForApproval = await request('GET', '/api/auth/documents', null, token);
    assert.strictEqual(documentsForApproval.status, 200);
    assert.strictEqual(documentsForApproval.data.documents.length, 3);

    for (const doc of documentsForApproval.data.documents) {
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

    const precheck = await request('POST', '/api/financing/prechecks', {
      productType: 'escrow_advance',
      state: 'WA',
      safetyAcknowledged: true,
      context: {
        escrowBalance: 50000,
        requestedAmount: 10000,
      },
    }, token);
    assert.strictEqual(precheck.status, 201);
    assert.strictEqual(precheck.data.precheck.product_type, 'escrow_advance');
    assert.strictEqual(precheck.data.precheck.status, 'demo_precheck');
    assert.strictEqual(precheck.data.precheck.safety_acknowledged, true);
    assert.match(precheck.data.message, /demo\/mvp/i);

    const myPrechecks = await request('GET', '/api/financing/prechecks', null, token);
    assert.strictEqual(myPrechecks.status, 200);
    assert.strictEqual(myPrechecks.data.prechecks.length, 1);

    const adminPrechecks = await request('GET', '/api/admin/financing-prechecks?status=demo_precheck', null, adminToken);
    assert.strictEqual(adminPrechecks.status, 200);
    assert.strictEqual(adminPrechecks.data.prechecks.length, 1);
    assert.strictEqual(adminPrechecks.data.prechecks[0].user.companyName, 'Postgres Builder LLC');

    console.log('postgres storage smoke test passed');
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
