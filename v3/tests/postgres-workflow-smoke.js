const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const v3Root = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gcsc-fake-pg-workflow-'));
const port = 13000 + Math.floor(Math.random() * 1000);
const hyperionPort = 15000 + Math.floor(Math.random() * 1000);
const verifiedReleaseTxId = 'a'.repeat(64);
const jsonDbPath = path.join(v3Root, 'gcsc.db');

const statePath = path.join(tempRoot, 'pg-state.json');
const fakePgPath = path.join(tempRoot, 'fake-pg.js');
const registerPath = path.join(tempRoot, 'register-fake-pg.js');

fs.writeFileSync(statePath, JSON.stringify({
  nextId: {
    users: 1,
    projects: 1,
    bids: 1,
    escrow_contracts: 1,
    milestones: 1,
    milestone_chain_txs: 1,
    user_documents: 1,
    audit_events: 1,
  },
  users: [],
  projects: [],
  bids: [],
  escrow_contracts: [],
  milestones: [],
  milestone_chain_txs: [],
  user_documents: [],
  audit_events: [],
}, null, 2));

fs.writeFileSync(fakePgPath, `
const fs = require('fs');
const statePath = ${JSON.stringify(statePath)};

function load() {
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function save(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function normalize(text) {
  return String(text || '').replace(/\\s+/g, ' ').trim().toLowerCase();
}

function nextId(state, table) {
  const id = state.nextId[table] || 1;
  state.nextId[table] = id + 1;
  return id;
}

function byNewest(rows) {
  return [...rows].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

class Pool {
  async query(text, params = []) {
    const sql = normalize(text);
    const state = load();

    if (
      sql.startsWith('create table') ||
      sql.startsWith('alter table') ||
      sql.startsWith('create index') ||
      sql.startsWith('create unique index')
    ) {
      return { rows: [], rowCount: 0 };
    }

    if (sql.startsWith('update milestone_chain_txs set action = case')) {
      state.milestone_chain_txs = state.milestone_chain_txs.map((row) => ({
        ...row,
        action: {
          submitmilestone: 'submitms',
          approvemilestone: 'approvems',
          releasemilestone: 'releasems',
          disputemilestone: 'disputems',
        }[row.action] || row.action,
      }));
      save(state);
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('select 1')) return { rows: [{ ok: 1 }], rowCount: 1 };

    if (sql.includes('select count(*)::int as count from users')) {
      return { rows: [{ count: state.users.length }], rowCount: 1 };
    }

    if (sql.includes('select count(*)::int as count from projects')) {
      return { rows: [{ count: state.projects.length }], rowCount: 1 };
    }

    if (sql.includes("select count(*)::int as count from escrow_contracts where status = 'completed'")) {
      return { rows: [{ count: state.escrow_contracts.filter((row) => row.status === 'completed').length }], rowCount: 1 };
    }

    if (sql.includes('select * from users where lower(email)')) {
      const email = String(params[0] || '').toLowerCase();
      const user = state.users.find((row) => row.email.toLowerCase() === email);
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }

    if (sql.includes('select * from users where id')) {
      const id = Number(params[0]);
      const user = state.users.find((row) => row.id === id);
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }

    if (sql.includes('select * from user_documents where user_id')) {
      const userId = Number(params[0]);
      const rows = state.user_documents.filter((row) => row.user_id === userId);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('insert into users')) {
      const [email, passwordHash, role, fullName, phone, profile, wallet] = params;
      const user = {
        id: nextId(state, 'users'),
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
      state.users.push(user);
      save(state);
      return { rows: [user], rowCount: 1 };
    }

    if (sql.startsWith('update users set profile')) {
      const [fullName, phone, profile, id] = params;
      const user = state.users.find((row) => row.id === Number(id));
      if (!user) return { rows: [], rowCount: 0 };
      user.full_name = fullName;
      user.phone = phone;
      user.profile = profile;
      user.updated_at = new Date().toISOString();
      save(state);
      return { rows: [user], rowCount: 1 };
    }

    if (sql.startsWith('update users set wallet')) {
      const [wallet, id] = params;
      const user = state.users.find((row) => row.id === Number(id));
      if (!user) return { rows: [], rowCount: 0 };
      user.wallet = wallet;
      user.updated_at = new Date().toISOString();
      save(state);
      return { rows: [user], rowCount: 1 };
    }

    if (sql.startsWith('insert into projects')) {
      const [homeownerId, title, description, category, budgetMin, budgetMax, location, timelineDays] = params;
      const project = {
        id: nextId(state, 'projects'),
        homeowner_id: Number(homeownerId),
        title,
        description,
        category,
        budget_min: Number(budgetMin),
        budget_max: Number(budgetMax),
        location,
        timeline_days: Number(timelineDays),
        status: 'open',
        escrow_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.projects.push(project);
      save(state);
      return { rows: [project], rowCount: 1 };
    }

    if (sql.startsWith('select * from projects where id')) {
      const project = state.projects.find((row) => row.id === Number(params[0]));
      return { rows: project ? [project] : [], rowCount: project ? 1 : 0 };
    }

    if (sql.startsWith('select * from projects where homeowner_id')) {
      const rows = byNewest(state.projects.filter((row) => row.homeowner_id === Number(params[0])));
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('select distinct p.* from projects p join bids b')) {
      const contractorId = Number(params[0]);
      const projectIds = new Set(state.bids.filter((row) => row.contractor_id === contractorId).map((row) => row.project_id));
      const rows = byNewest(state.projects.filter((row) => projectIds.has(row.id)));
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('select * from projects')) {
      let rows = state.projects;
      const [status, category, location] = params;
      if (status) rows = rows.filter((row) => row.status === status);
      if (category) rows = rows.filter((row) => row.category === category);
      if (location) rows = rows.filter((row) => row.location && row.location.includes(location));
      rows = byNewest(rows);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('insert into bids')) {
      const [projectId, contractorId, amount, proposedTimelineDays, message] = params;
      const bid = {
        id: nextId(state, 'bids'),
        project_id: Number(projectId),
        contractor_id: Number(contractorId),
        amount: Number(amount),
        proposed_timeline_days: Number(proposedTimelineDays),
        message,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.bids.push(bid);
      save(state);
      return { rows: [bid], rowCount: 1 };
    }

    if (sql.startsWith('select * from bids where id')) {
      const bid = state.bids.find((row) => row.id === Number(params[0]));
      return { rows: bid ? [bid] : [], rowCount: bid ? 1 : 0 };
    }

    if (sql.startsWith('select * from bids where project_id')) {
      const rows = byNewest(state.bids.filter((row) => row.project_id === Number(params[0])));
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('select * from bids where contractor_id')) {
      const rows = byNewest(state.bids.filter((row) => row.contractor_id === Number(params[0])));
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('update bids set status =') && sql.includes('where project_id')) {
      const [projectId, acceptedBidId] = params;
      let count = 0;
      for (const bid of state.bids) {
        if (bid.project_id === Number(projectId) && bid.id !== Number(acceptedBidId)) {
          bid.status = 'rejected';
          bid.updated_at = new Date().toISOString();
          count++;
        }
      }
      save(state);
      return { rows: [], rowCount: count };
    }

    if (sql.startsWith('update bids set status')) {
      const [status, id] = params;
      const bid = state.bids.find((row) => row.id === Number(id));
      if (!bid) return { rows: [], rowCount: 0 };
      if (sql.includes("and status = 'pending'") && bid.status !== 'pending') {
        return { rows: [], rowCount: 0 };
      }
      bid.status = status;
      bid.updated_at = new Date().toISOString();
      save(state);
      return { rows: [bid], rowCount: 1 };
    }

    if (sql.startsWith('insert into escrow_contracts')) {
      const [projectId, homeownerId, contractorId, totalAmount] = params;
      const escrow = {
        id: nextId(state, 'escrow_contracts'),
        project_id: Number(projectId),
        homeowner_id: Number(homeownerId),
        contractor_id: Number(contractorId),
        total_amount: Number(totalAmount),
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.escrow_contracts.push(escrow);
      save(state);
      return { rows: [escrow], rowCount: 1 };
    }

    if (sql.startsWith("update projects set status = 'in_progress'") && sql.includes("status = 'open'")) {
      const project = state.projects.find((row) => row.id === Number(params[0]));
      if (!project || project.status !== 'open') return { rows: [], rowCount: 0 };
      project.status = 'in_progress';
      project.updated_at = new Date().toISOString();
      save(state);
      return { rows: [{ id: project.id }], rowCount: 1 };
    }

    if (sql.startsWith("update projects set status = 'open'")) {
      const project = state.projects.find((row) => row.id === Number(params[0]));
      if (!project) return { rows: [], rowCount: 0 };
      project.status = 'open';
      project.updated_at = new Date().toISOString();
      save(state);
      return { rows: [project], rowCount: 1 };
    }

    if (sql.startsWith('update projects set escrow_id')) {
      const [escrowId, id] = params;
      const project = state.projects.find((row) => row.id === Number(id));
      if (!project) return { rows: [], rowCount: 0 };
      project.escrow_id = Number(escrowId);
      project.updated_at = new Date().toISOString();
      save(state);
      return { rows: [project], rowCount: 1 };
    }

    if (sql.startsWith('update projects set status')) {
      const [status, escrowId, id] = params;
      const project = state.projects.find((row) => row.id === Number(id));
      if (!project) return { rows: [], rowCount: 0 };
      project.status = status;
      project.escrow_id = Number(escrowId);
      project.updated_at = new Date().toISOString();
      save(state);
      return { rows: [project], rowCount: 1 };
    }

    if (sql.startsWith('select * from escrow_contracts where id')) {
      const escrow = state.escrow_contracts.find((row) => row.id === Number(params[0]));
      return { rows: escrow ? [escrow] : [], rowCount: escrow ? 1 : 0 };
    }

    if (sql.startsWith('select * from escrow_contracts where homeowner_id')) {
      const id = Number(params[0]);
      const rows = byNewest(state.escrow_contracts.filter((row) => row.homeowner_id === id || row.contractor_id === id));
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('select coalesce(sum(amount), 0)::int as total from milestones where escrow_id') && sql.includes("status = 'released'")) {
      const total = state.milestones
        .filter((row) => row.escrow_id === Number(params[0]) && row.status === 'released')
        .reduce((sum, row) => sum + Number(row.amount), 0);
      return { rows: [{ total }], rowCount: 1 };
    }

    if (sql.startsWith('select coalesce(sum(amount), 0)::int as total from milestones where escrow_id')) {
      const total = state.milestones
        .filter((row) => row.escrow_id === Number(params[0]))
        .reduce((sum, row) => sum + Number(row.amount), 0);
      return { rows: [{ total }], rowCount: 1 };
    }

    if (sql.startsWith('select * from milestones where escrow_id')) {
      const rows = state.milestones.filter((row) => row.escrow_id === Number(params[0]));
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('select * from milestone_chain_txs where milestone_id = any')) {
      const ids = (params[0] || []).map(Number);
      const rows = state.milestone_chain_txs
        .filter((row) => ids.includes(row.milestone_id))
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0) || b.id - a.id);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('select * from milestone_chain_txs where tx_id')) {
      const tx = state.milestone_chain_txs.find((row) => row.tx_id === params[0]);
      return { rows: tx ? [tx] : [], rowCount: tx ? 1 : 0 };
    }

    if (sql.startsWith('insert into milestones')) {
      const [escrowId, title, description, amount, status] = params;
      const milestone = {
        id: nextId(state, 'milestones'),
        escrow_id: Number(escrowId),
        title,
        description,
        amount: Number(amount),
        status,
        verified_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.milestones.push(milestone);
      save(state);
      return { rows: [milestone], rowCount: 1 };
    }

    if (sql.startsWith('insert into milestone_chain_txs')) {
      const [milestoneId, escrowId, action, txId, chainId, contractAccount, actor, status, createdBy] = params;
      let tx = state.milestone_chain_txs.find((row) => row.tx_id === txId);
      if (tx) {
        tx = {
          ...tx,
          milestone_id: Number(milestoneId),
          escrow_id: Number(escrowId),
          action,
          chain_id: chainId,
          contract_account: contractAccount,
          actor,
          status,
          created_by: Number(createdBy),
          verified_at: null,
          verification_error: null,
        };
        state.milestone_chain_txs = state.milestone_chain_txs.map((row) => row.tx_id === txId ? tx : row);
      } else {
        tx = {
          id: nextId(state, 'milestone_chain_txs'),
          milestone_id: Number(milestoneId),
          escrow_id: Number(escrowId),
          action,
          tx_id: txId,
          chain_id: chainId,
          contract_account: contractAccount,
          actor,
          status,
          created_by: Number(createdBy),
          created_at: new Date().toISOString(),
          verified_at: null,
          verification_error: null,
        };
        state.milestone_chain_txs.push(tx);
      }
      save(state);
      return { rows: [tx], rowCount: 1 };
    }

    if (sql.startsWith('update milestone_chain_txs set status')) {
      const [status, verificationError, txId] = params;
      const tx = state.milestone_chain_txs.find((row) => row.tx_id === txId);
      if (!tx) return { rows: [], rowCount: 0 };
      tx.status = status;
      tx.verification_error = verificationError || null;
      tx.verified_at = new Date().toISOString();
      save(state);
      return { rows: [tx], rowCount: 1 };
    }

    if (sql.startsWith('select * from milestones where id')) {
      const milestone = state.milestones.find((row) => row.id === Number(params[0]));
      return { rows: milestone ? [milestone] : [], rowCount: milestone ? 1 : 0 };
    }

    if (sql.startsWith('update milestones set status')) {
      const [status, verifiedBy, id] = params;
      const milestone = state.milestones.find((row) => row.id === Number(id));
      if (!milestone) return { rows: [], rowCount: 0 };
      milestone.status = status;
      milestone.verified_by = verifiedBy;
      milestone.updated_at = new Date().toISOString();
      save(state);
      return { rows: [milestone], rowCount: 1 };
    }

    if (sql.startsWith('update escrow_contracts set status')) {
      const [status, id] = params;
      const escrow = state.escrow_contracts.find((row) => row.id === Number(id));
      if (!escrow) return { rows: [], rowCount: 0 };
      escrow.status = status;
      escrow.updated_at = new Date().toISOString();
      save(state);
      return { rows: [escrow], rowCount: 1 };
    }

    if (sql.startsWith('insert into audit_events')) {
      const [actorId, targetUserId, action, entityType, entityId, metadata, ipAddress, userAgent] = params;
      const event = {
        id: nextId(state, 'audit_events'),
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
      state.audit_events.push(event);
      save(state);
      return { rows: [event], rowCount: 1 };
    }

    if (sql.includes('select * from audit_events')) {
      let rows = state.audit_events;
      if (sql.includes('where action =')) {
        rows = rows.filter((row) => row.action === params[0]);
      }
      rows = byNewest(rows);
      return { rows, rowCount: rows.length };
    }

    throw new Error('Unhandled SQL in fake pg workflow test: ' + text);
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

function startServer() {
  const child = spawn(process.execPath, ['pure-server.js'], {
    cwd: v3Root,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: 'postgres://gcsc:test@localhost:5432/gcsc',
      JWT_SECRET: 'test-secret-minimum-length-for-hs256',
      XPR_TESTNET_HYPERION_URLS: `http://127.0.0.1:${hyperionPort}`,
      XPR_TX_VERIFIER_ENABLED: 'false',
      NODE_OPTIONS: `--require ${registerPath}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderrText = '';
  child.stderr.on('data', (chunk) => { child.stderrText += chunk.toString(); });
  return child;
}

function startFakeHyperion() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${hyperionPort}`);
    if (url.pathname !== '/v2/history/get_transaction') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    const txId = url.searchParams.get('id');
    if (txId !== verifiedReleaseTxId) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'transaction not found' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: txId,
      transaction_id: txId,
      actions: [
        {
          act: {
            account: 'gcscrow1111',
            name: 'releasems',
            data: { escrow_id: 1, milestone_id: 1 },
          },
        },
      ],
    }));
  });

  return new Promise((resolve) => {
    server.listen(hyperionPort, '127.0.0.1', () => resolve(server));
  });
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function stopHttpServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
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
  fs.rmSync(jsonDbPath, { force: true });
  const hyperion = await startFakeHyperion();
  let child = startServer();
  try {
    const health = await waitForServer(child);
    assert.strictEqual(health.database, 'postgres');

    const stamp = Date.now();
    const ownerEmail = `owner-${stamp}@gcsc.store`;
    const contractorEmail = `contractor-${stamp}@gcsc.store`;
    const password = 'StrongPass123';

    const owner = await request('POST', '/api/auth/register', {
      email: ownerEmail,
      password,
      role: 'owner',
      fullName: 'Workflow Owner',
    });
    assert.strictEqual(owner.status, 201);

    const contractor = await request('POST', '/api/auth/register', {
      email: contractorEmail,
      password,
      role: 'builder',
      fullName: 'Workflow Contractor',
    });
    assert.strictEqual(contractor.status, 201);

    const project = await request('POST', '/api/projects', {
      title: 'Kitchen workflow persistence',
      description: 'Persist this project in PostgreSQL',
      category: 'remodel',
      budget_min: 1000,
      budget_max: 5000,
      location: 'Seattle',
      timeline_days: 14,
    }, owner.data.token);
    assert.strictEqual(project.status, 201);

    const bid = await request('POST', '/api/bids', {
      project_id: project.data.project.id,
      amount: 2500,
      proposed_timeline_days: 10,
      message: 'Ready to build',
    }, contractor.data.token);
    assert.strictEqual(bid.status, 201);

    const projectDetailsBeforeVerification = await request('GET', `/api/projects/${project.data.project.id}`, null, owner.data.token);
    assert.strictEqual(projectDetailsBeforeVerification.status, 200);
    assert.strictEqual(projectDetailsBeforeVerification.data.bids[0].contractor_verification.overall_status, 'profile_incomplete');
    assert.strictEqual(projectDetailsBeforeVerification.data.bids[0].contractor_verification.ready_for_bids, false);

    const riskyAccept = await request('POST', `/api/bids/${bid.data.bid.id}/accept`, null, owner.data.token);
    assert.strictEqual(riskyAccept.status, 400);
    assert.match(riskyAccept.data.error, /verified/i);

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const storedContractor = state.users.find((row) => row.id === contractor.data.user.id);
    assert.ok(storedContractor);
    storedContractor.phone = '555-0100';
    storedContractor.profile = {
      accountType: 'contractor',
      companyName: 'Workflow Builder LLC',
      ein: '12-3456789',
      licenseNumber: 'WA-GCSC-123',
      serviceArea: 'Seattle',
      specialties: ['Kitchen', 'Roofing'],
      yearsInBusiness: '5',
      city: 'Seattle',
      state: 'WA',
    };
    storedContractor.wallet = {
      accountName: 'builder11111',
      permission: 'active',
      walletType: 'webauth',
      connectedAt: new Date().toISOString(),
    };
    for (const documentType of ['contractor_license', 'insurance_certificate', 'business_ein']) {
      state.user_documents.push({
        id: state.nextId.user_documents++,
        user_id: contractor.data.user.id,
        document_type: documentType,
        file_name: `${documentType}.pdf`,
        mime_type: 'application/pdf',
        file_data_url: 'data:application/pdf;base64,aGVsbG8=',
        file_size: 1200,
        file_sha256: documentType.padEnd(64, '0').slice(0, 64),
        status: 'approved',
        review_note: 'Approved in workflow smoke test',
        submitted_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString(),
        reviewed_by: 999,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    const accepted = await request('POST', `/api/bids/${bid.data.bid.id}/accept`, null, owner.data.token);
    assert.strictEqual(accepted.status, 200);
    assert.ok(accepted.data.escrow_id);

    // Regression: re-accepting the same bid must not create a second escrow.
    const reAccept = await request('POST', `/api/bids/${bid.data.bid.id}/accept`, null, owner.data.token);
    assert.strictEqual(reAccept.status, 400);
    const escrowCountAfterReAccept = JSON.parse(fs.readFileSync(statePath, 'utf8')).escrow_contracts.length;
    assert.strictEqual(escrowCountAfterReAccept, 1);

    const adminToken = (() => {
      const crypto = require('crypto');
      const base64Url = (value) => Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const body = base64Url(JSON.stringify({ userId: 999, email: 'admin@gcsc.store', role: 'admin', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }));
      const sig = crypto.createHmac('sha256', 'test-secret-minimum-length-for-hs256').update(header + '.' + body).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return header + '.' + body + '.' + sig;
    })();

    const bidAudit = await request('GET', '/api/admin/audit-events?action=bid.accepted', null, adminToken);
    assert.strictEqual(bidAudit.status, 200);
    assert.strictEqual(bidAudit.data.events.length, 1);
    assert.strictEqual(bidAudit.data.events[0].action, 'bid.accepted');
    assert.strictEqual(bidAudit.data.events[0].entity_id, bid.data.bid.id);
    assert.strictEqual(bidAudit.data.events[0].metadata.escrow_id, accepted.data.escrow_id);

    const projectAudit = await request('GET', '/api/admin/audit-events?action=project.created', null, adminToken);
    assert.strictEqual(projectAudit.status, 200);
    assert.strictEqual(projectAudit.data.events.length, 1);
    assert.strictEqual(projectAudit.data.events[0].actor_id, owner.data.user.id);
    assert.strictEqual(projectAudit.data.events[0].entity_id, project.data.project.id);
    assert.strictEqual(projectAudit.data.events[0].metadata.category, 'remodel');
    assert.strictEqual(projectAudit.data.events[0].metadata.budget_max, 5000);

    const bidSubmittedAudit = await request('GET', '/api/admin/audit-events?action=bid.submitted', null, adminToken);
    assert.strictEqual(bidSubmittedAudit.status, 200);
    assert.strictEqual(bidSubmittedAudit.data.events.length, 1);
    assert.strictEqual(bidSubmittedAudit.data.events[0].actor_id, contractor.data.user.id);
    assert.strictEqual(bidSubmittedAudit.data.events[0].target_user_id, owner.data.user.id);
    assert.strictEqual(bidSubmittedAudit.data.events[0].entity_id, bid.data.bid.id);
    assert.strictEqual(bidSubmittedAudit.data.events[0].metadata.project_id, project.data.project.id);
    assert.strictEqual(bidSubmittedAudit.data.events[0].metadata.amount, 2500);

    await stopServer(child);
    fs.rmSync(jsonDbPath, { force: true });
    child = startServer();
    await waitForServer(child);

    const login = await request('POST', '/api/auth/login', {
      email: ownerEmail,
      password,
    });
    assert.strictEqual(login.status, 200);

    const contractorLogin = await request('POST', '/api/auth/login', {
      email: contractorEmail,
      password,
    });
    assert.strictEqual(contractorLogin.status, 200);

    const myProjects = await request('GET', '/api/projects/my/projects', null, login.data.token);
    assert.strictEqual(myProjects.status, 200);
    assert.strictEqual(myProjects.data.projects.length, 1);
    assert.strictEqual(myProjects.data.projects[0].title, 'Kitchen workflow persistence');
    assert.strictEqual(myProjects.data.projects[0].status, 'in_progress');

    const projectDetails = await request('GET', `/api/projects/${project.data.project.id}`, null, login.data.token);
    assert.strictEqual(projectDetails.status, 200);
    assert.strictEqual(projectDetails.data.bids.length, 1);
    assert.strictEqual(projectDetails.data.bids[0].contractor.id, contractor.data.user.id);
    assert.strictEqual(projectDetails.data.bids[0].contractor.full_name, 'Workflow Contractor');
    assert.strictEqual(projectDetails.data.bids[0].contractor_verification.overall_status, 'verified');
    assert.strictEqual(projectDetails.data.bids[0].contractor_verification.ready_for_bids, true);

    const publicContractor = await request('GET', `/api/contractors/${contractor.data.user.id}/public`);
    assert.strictEqual(publicContractor.status, 200);
    assert.strictEqual(publicContractor.data.contractor.companyName, 'Workflow Builder LLC');
    assert.strictEqual(publicContractor.data.verification.overall_status, 'verified');
    assert.strictEqual(publicContractor.data.verification.ready_for_bids, true);

    const ownerAsContractor = await request('GET', `/api/contractors/${owner.data.user.id}/public`);
    assert.strictEqual(ownerAsContractor.status, 404);

    const escrow = await request('GET', `/api/escrow/${accepted.data.escrow_id}`, null, login.data.token);
    assert.strictEqual(escrow.status, 200);
    assert.strictEqual(escrow.data.escrow.total_amount, 2500);
    assert.strictEqual(escrow.data.milestones.length, 0);

    const milestone = await request('POST', `/api/escrow/${accepted.data.escrow_id}/milestones`, {
      title: 'Demolition complete',
      description: 'Remove old cabinets and prepare rough-in',
      amount: 1000,
    }, login.data.token);
    assert.strictEqual(milestone.status, 201);
    assert.strictEqual(milestone.data.milestone.status, 'pending');

    const milestoneCreatedAudit = await request('GET', '/api/admin/audit-events?action=escrow.milestone.created', null, adminToken);
    assert.strictEqual(milestoneCreatedAudit.status, 200);
    assert.strictEqual(milestoneCreatedAudit.data.events.length, 1);
    assert.strictEqual(milestoneCreatedAudit.data.events[0].actor_id, owner.data.user.id);
    assert.strictEqual(milestoneCreatedAudit.data.events[0].target_user_id, contractor.data.user.id);
    assert.strictEqual(milestoneCreatedAudit.data.events[0].entity_id, milestone.data.milestone.id);
    assert.strictEqual(milestoneCreatedAudit.data.events[0].metadata.escrow_id, accepted.data.escrow_id);

    const submitted = await request('POST', `/api/milestones/${milestone.data.milestone.id}/submit`, null, contractorLogin.data.token);
    assert.strictEqual(submitted.status, 200);
    assert.strictEqual(submitted.data.milestone.status, 'submitted');

    const milestoneSubmittedAudit = await request('GET', '/api/admin/audit-events?action=escrow.milestone.submitted', null, adminToken);
    assert.strictEqual(milestoneSubmittedAudit.status, 200);
    assert.strictEqual(milestoneSubmittedAudit.data.events.length, 1);
    assert.strictEqual(milestoneSubmittedAudit.data.events[0].actor_id, contractor.data.user.id);
    assert.strictEqual(milestoneSubmittedAudit.data.events[0].target_user_id, owner.data.user.id);
    assert.strictEqual(milestoneSubmittedAudit.data.events[0].entity_id, milestone.data.milestone.id);

    const earlyRelease = await request('POST', `/api/milestones/${milestone.data.milestone.id}/release`, null, login.data.token);
    assert.strictEqual(earlyRelease.status, 400);

    const approved = await request('POST', `/api/milestones/${milestone.data.milestone.id}/approve`, null, login.data.token);
    assert.strictEqual(approved.status, 200);
    assert.strictEqual(approved.data.milestone.status, 'approved');

    const milestoneApprovedAudit = await request('GET', '/api/admin/audit-events?action=escrow.milestone.approved', null, adminToken);
    assert.strictEqual(milestoneApprovedAudit.status, 200);
    assert.strictEqual(milestoneApprovedAudit.data.events.length, 1);
    assert.strictEqual(milestoneApprovedAudit.data.events[0].actor_id, owner.data.user.id);
    assert.strictEqual(milestoneApprovedAudit.data.events[0].target_user_id, contractor.data.user.id);
    assert.strictEqual(milestoneApprovedAudit.data.events[0].entity_id, milestone.data.milestone.id);

    const released = await request('POST', `/api/milestones/${milestone.data.milestone.id}/release`, null, login.data.token);
    assert.strictEqual(released.status, 200);
    assert.strictEqual(released.data.milestone.status, 'released');

    // Regression: re-releasing an already-released milestone must be rejected so
    // it cannot emit a second release event / double payout (audit count below
    // must stay at 1).
    const reRelease = await request('POST', `/api/milestones/${milestone.data.milestone.id}/release`, null, login.data.token);
    assert.strictEqual(reRelease.status, 400);

    const milestoneReleasedAudit = await request('GET', '/api/admin/audit-events?action=escrow.milestone.released', null, adminToken);
    assert.strictEqual(milestoneReleasedAudit.status, 200);
    assert.strictEqual(milestoneReleasedAudit.data.events.length, 1);
    assert.strictEqual(milestoneReleasedAudit.data.events[0].actor_id, owner.data.user.id);
    assert.strictEqual(milestoneReleasedAudit.data.events[0].target_user_id, contractor.data.user.id);
    assert.strictEqual(milestoneReleasedAudit.data.events[0].entity_id, milestone.data.milestone.id);
    assert.strictEqual(milestoneReleasedAudit.data.events[0].metadata.released_total, 1000);

    const releaseTxId = verifiedReleaseTxId;
    const releaseTx = await request('POST', `/api/milestones/${milestone.data.milestone.id}/chain-txs`, {
      action: 'releasems',
      tx_id: releaseTxId,
      chain_id: '71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd',
      contract_account: 'gcscrow1111',
      actor: 'owner.test',
      status: 'broadcast',
    }, login.data.token);
    assert.strictEqual(releaseTx.status, 201);
    assert.strictEqual(releaseTx.data.chain_tx.tx_id, releaseTxId);
    assert.strictEqual(releaseTx.data.chain_tx.action, 'releasems');
    assert.strictEqual(releaseTx.data.chain_tx.status, 'broadcast');

    const chainTxRecordedAudit = await request('GET', '/api/admin/audit-events?action=escrow.chain_tx.recorded', null, adminToken);
    assert.strictEqual(chainTxRecordedAudit.status, 200);
    assert.strictEqual(chainTxRecordedAudit.data.events.length, 1);
    assert.strictEqual(chainTxRecordedAudit.data.events[0].actor_id, owner.data.user.id);
    assert.strictEqual(chainTxRecordedAudit.data.events[0].target_user_id, contractor.data.user.id);
    assert.strictEqual(chainTxRecordedAudit.data.events[0].entity_id, releaseTx.data.chain_tx.id);
    assert.strictEqual(chainTxRecordedAudit.data.events[0].metadata.tx_id, releaseTxId);
    assert.strictEqual(chainTxRecordedAudit.data.events[0].metadata.action, 'releasems');

    const duplicateReleaseTx = await request('POST', `/api/milestones/${milestone.data.milestone.id}/chain-txs`, {
      action: 'approvems',
      tx_id: releaseTxId,
      chain_id: '71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd',
      contract_account: 'gcscrow1111',
      actor: 'owner.test',
      status: 'broadcast',
    }, login.data.token);
    assert.strictEqual(duplicateReleaseTx.status, 409);
    assert.match(duplicateReleaseTx.data.error, /duplicate/i);

    const verifiedReleaseTx = await request('POST', `/api/milestones/${milestone.data.milestone.id}/chain-txs/${releaseTxId}/verify`, null, login.data.token);
    assert.strictEqual(verifiedReleaseTx.status, 200);
    assert.strictEqual(verifiedReleaseTx.data.chain_tx.status, 'confirmed');
    assert.ok(verifiedReleaseTx.data.chain_tx.verified_at);

    const confirmedChainAudit = await request('GET', '/api/admin/audit-events?action=escrow.chain_tx.confirmed', null, adminToken);
    assert.strictEqual(confirmedChainAudit.status, 200);
    assert.strictEqual(confirmedChainAudit.data.events.length, 1);
    assert.strictEqual(confirmedChainAudit.data.events[0].entity_type, 'milestone_chain_tx');
    assert.strictEqual(confirmedChainAudit.data.events[0].metadata.tx_id, releaseTxId);
    assert.strictEqual(confirmedChainAudit.data.events[0].metadata.action, 'releasems');

    const missingTxId = 'c'.repeat(64);
    const missingChainTx = await request('POST', `/api/milestones/${milestone.data.milestone.id}/chain-txs`, {
      action: 'approvems',
      tx_id: missingTxId,
      chain_id: '71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd',
      contract_account: 'gcscrow1111',
      actor: 'owner.test',
      status: 'broadcast',
    }, login.data.token);
    assert.strictEqual(missingChainTx.status, 201);
    assert.strictEqual(missingChainTx.data.chain_tx.status, 'broadcast');

    const failedChainTx = await request('POST', `/api/milestones/${milestone.data.milestone.id}/chain-txs/${missingTxId}/verify`, null, login.data.token);
    assert.strictEqual(failedChainTx.status, 200);
    assert.strictEqual(failedChainTx.data.chain_tx.status, 'failed');
    assert.match(failedChainTx.data.chain_tx.verification_error, /transaction not found/i);

    const failedChainAudit = await request('GET', '/api/admin/audit-events?action=escrow.chain_tx.failed', null, adminToken);
    assert.strictEqual(failedChainAudit.status, 200);
    assert.strictEqual(failedChainAudit.data.events.length, 1);
    assert.strictEqual(failedChainAudit.data.events[0].entity_type, 'milestone_chain_tx');
    assert.strictEqual(failedChainAudit.data.events[0].metadata.tx_id, missingTxId);
    assert.strictEqual(failedChainAudit.data.events[0].metadata.verification_status, 'failed');

    const unauthorizedReleaseTx = await request('POST', `/api/milestones/${milestone.data.milestone.id}/chain-txs`, {
      action: 'releasems',
      tx_id: 'b'.repeat(64),
      chain_id: '71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd',
      contract_account: 'gcscrow1111',
      actor: 'contractor.test',
      status: 'broadcast',
    }, contractorLogin.data.token);
    assert.strictEqual(unauthorizedReleaseTx.status, 403);

    const disputedMilestone = await request('POST', `/api/escrow/${accepted.data.escrow_id}/milestones`, {
      title: 'Finish materials',
      description: 'Materials inspection before installation',
      amount: 1500,
    }, login.data.token);
    assert.strictEqual(disputedMilestone.status, 201);

    const disputed = await request('POST', `/api/milestones/${disputedMilestone.data.milestone.id}/dispute`, null, contractorLogin.data.token);
    assert.strictEqual(disputed.status, 200);
    assert.strictEqual(disputed.data.milestone.status, 'disputed');
    assert.strictEqual(disputed.data.escrow.status, 'disputed');

    const milestoneDisputedAudit = await request('GET', '/api/admin/audit-events?action=escrow.milestone.disputed', null, adminToken);
    assert.strictEqual(milestoneDisputedAudit.status, 200);
    assert.strictEqual(milestoneDisputedAudit.data.events.length, 1);
    assert.strictEqual(milestoneDisputedAudit.data.events[0].actor_id, contractor.data.user.id);
    assert.strictEqual(milestoneDisputedAudit.data.events[0].target_user_id, owner.data.user.id);
    assert.strictEqual(milestoneDisputedAudit.data.events[0].entity_id, disputedMilestone.data.milestone.id);
    assert.strictEqual(milestoneDisputedAudit.data.events[0].metadata.escrow_status, 'disputed');

    const escrowAfterMilestones = await request('GET', `/api/escrow/${accepted.data.escrow_id}`, null, login.data.token);
    assert.strictEqual(escrowAfterMilestones.status, 200);
    assert.strictEqual(escrowAfterMilestones.data.milestones.length, 2);
    const milestoneWithTx = escrowAfterMilestones.data.milestones.find((item) => item.id === milestone.data.milestone.id);
    assert.strictEqual(milestoneWithTx.chain_txs.length, 2);
    const confirmedTx = milestoneWithTx.chain_txs.find((tx) => tx.tx_id === releaseTxId);
    const failedTx = milestoneWithTx.chain_txs.find((tx) => tx.tx_id === missingTxId);
    assert.strictEqual(confirmedTx.contract_account, 'gcscrow1111');
    assert.strictEqual(confirmedTx.status, 'confirmed');
    assert.strictEqual(failedTx.contract_account, 'gcscrow1111');
    assert.strictEqual(failedTx.status, 'failed');

    console.log('postgres workflow persistence smoke test passed');
  } finally {
    await stopServer(child);
    await stopHttpServer(hyperion);
    fs.rmSync(jsonDbPath, { force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
