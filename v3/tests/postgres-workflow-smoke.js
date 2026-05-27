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
  },
  users: [],
  projects: [],
  bids: [],
  escrow_contracts: [],
  milestones: [],
  milestone_chain_txs: [],
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
      sql.startsWith('create index')
    ) {
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
            name: 'releasemilestone',
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

    const accepted = await request('POST', `/api/bids/${bid.data.bid.id}/accept`, null, owner.data.token);
    assert.strictEqual(accepted.status, 200);
    assert.ok(accepted.data.escrow_id);

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

    const submitted = await request('POST', `/api/milestones/${milestone.data.milestone.id}/submit`, null, contractorLogin.data.token);
    assert.strictEqual(submitted.status, 200);
    assert.strictEqual(submitted.data.milestone.status, 'submitted');

    const earlyRelease = await request('POST', `/api/milestones/${milestone.data.milestone.id}/release`, null, login.data.token);
    assert.strictEqual(earlyRelease.status, 400);

    const approved = await request('POST', `/api/milestones/${milestone.data.milestone.id}/approve`, null, login.data.token);
    assert.strictEqual(approved.status, 200);
    assert.strictEqual(approved.data.milestone.status, 'approved');

    const released = await request('POST', `/api/milestones/${milestone.data.milestone.id}/release`, null, login.data.token);
    assert.strictEqual(released.status, 200);
    assert.strictEqual(released.data.milestone.status, 'released');

    const releaseTxId = verifiedReleaseTxId;
    const releaseTx = await request('POST', `/api/milestones/${milestone.data.milestone.id}/chain-txs`, {
      action: 'releasemilestone',
      tx_id: releaseTxId,
      chain_id: '71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd',
      contract_account: 'gcscrow1111',
      actor: 'owner.test',
      status: 'broadcast',
    }, login.data.token);
    assert.strictEqual(releaseTx.status, 201);
    assert.strictEqual(releaseTx.data.chain_tx.tx_id, releaseTxId);
    assert.strictEqual(releaseTx.data.chain_tx.action, 'releasemilestone');

    const verifiedReleaseTx = await request('POST', `/api/milestones/${milestone.data.milestone.id}/chain-txs/${releaseTxId}/verify`, null, login.data.token);
    assert.strictEqual(verifiedReleaseTx.status, 200);
    assert.strictEqual(verifiedReleaseTx.data.chain_tx.status, 'confirmed');
    assert.ok(verifiedReleaseTx.data.chain_tx.verified_at);

    const unauthorizedReleaseTx = await request('POST', `/api/milestones/${milestone.data.milestone.id}/chain-txs`, {
      action: 'releasemilestone',
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

    const escrowAfterMilestones = await request('GET', `/api/escrow/${accepted.data.escrow_id}`, null, login.data.token);
    assert.strictEqual(escrowAfterMilestones.status, 200);
    assert.strictEqual(escrowAfterMilestones.data.milestones.length, 2);
    const milestoneWithTx = escrowAfterMilestones.data.milestones.find((item) => item.id === milestone.data.milestone.id);
    assert.strictEqual(milestoneWithTx.chain_txs.length, 1);
    assert.strictEqual(milestoneWithTx.chain_txs[0].tx_id, releaseTxId);
    assert.strictEqual(milestoneWithTx.chain_txs[0].contract_account, 'gcscrow1111');
    assert.strictEqual(milestoneWithTx.chain_txs[0].status, 'confirmed');

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
