/* Run only against a disposable database named gcsc_agent_test*. Never production. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { createAgentService } = require('../agent/service');

async function main() {
    const connectionString = process.env.AGENT_TEST_PG_URL;
    if (!connectionString || !new URL(connectionString).pathname.startsWith('/gcsc_agent_test')) throw new Error('Disposable AGENT_TEST_PG_URL required');
    process.env.DATABASE_URL = connectionString;
    process.env.JWT_SECRET = 'agent-test-only-secret-32-characters';
    const pool = new Pool({ connectionString });
    const server = require('../pure-server');
    await server.initStorage();
    const query = (sql, params) => pool.query(sql, params);
    const db = { query, async transaction(work) {
        const client = await pool.connect();
        try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
        catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    } };
    let listener;
    try {
        await query(fs.readFileSync(path.join(__dirname, '../database/agent-migration.sql'), 'utf8'));
        await query(fs.readFileSync(path.join(__dirname, '../database/agent-migration.sql'), 'utf8'));
        await query(`INSERT INTO users(id,email,password_hash,role) VALUES
            (9001,'owner@agent.test','test','homeowner'), (9002,'contractor@agent.test','test','contractor'),
            (9003,'other@agent.test','test','homeowner'), (9004,'competitor@agent.test','test','contractor')`);
        await query(`INSERT INTO projects(id,homeowner_id,title,status) VALUES(9010,9001,'Roof','open'),(9011,9003,'Private project','open')`);
        await query(`INSERT INTO bids(project_id,contractor_id,amount,message) VALUES(9010,9002,10000,'Initial'),(9010,9004,12000,'Competitor')`);
        await query(`INSERT INTO escrow_contracts(id,project_id,homeowner_id,contractor_id,total_amount,status) VALUES(9020,9010,9001,9002,10000,'funded')`);
        await query(`INSERT INTO milestones(id,escrow_id,amount,status) VALUES(9030,9020,5000,'submitted')`);
        const contractor = { userId: 9002, role: 'homeowner' }; // DB role must win.
        const owner = { userId: 9001 };
        const executed = [];
        const service = createAgentService({ db, runtime: 'pure', prompt: 'Test agent', executePlatformAction: async action => { executed.push(action.id); return { id: action.id }; },
            completion: async messages => {
                if (messages.at(-1).role === 'tool') return { choices: [{ message: { role: 'assistant', content: 'Draft ready' } }] };
                return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'draft_call', type: 'function', function: { name: 'draftProposal', arguments: JSON.stringify({ projectId: 9010, amountCents: 25000, description: 'Roof installation', dueDate: '2026-11-01', timelineDays: 15 }) } }] } }] };
            } });
        const response = await service.chat(contractor, 9010, 'Draft proposal');
        assert.equal(response.mode, 'contractor');
        assert.equal(response.actions[0].status, 'pending');
        assert.equal(executed.length, 0);
        const freshService = createAgentService({ db, runtime: 'pure', executePlatformAction: async () => ({}) });
        assert.deepEqual((await freshService.history(contractor, 9010)).messages, response.messages);
        assert.equal((await service.history(owner, 9010)).messages.length, 0);
        await assert.rejects(service.history({ userId: 9003 }, 9010), { status: 404 });
        await assert.rejects(service.history(contractor, 9011), { status: 404 });
        const ctx = await service.context(db, contractor, 9010);
        await assert.rejects(service.tool(db, ctx, 'getProjectDetails', { projectId: 9011 }), { status: 403 });
        await assert.rejects(service.tool(db, ctx, 'getDocumentsStatus', { contractorId: 9004 }), { status: 403 });
        const table = await service.tool(db, await service.context(db, owner, 9010), 'compareProposals', { projectId: 9010 });
        assert.equal(table.rows.length, 2);
        assert.equal(table.amountUnit, 'cents');

        listener = await new Promise(resolve => { const s = server.listen(0, '127.0.0.1', () => resolve(s)); });
        const base = `http://127.0.0.1:${listener.address().port}`;
        const token = server.jwtSign({ userId: 9002, role: 'contractor', email: 'contractor@agent.test' });
        const ownerToken = server.jwtSign({ userId: 9001, role: 'homeowner', email: 'owner@agent.test' });
        const request = async (url, body, auth = token) => {
            const res = await fetch(base + url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, ...(body && { body: JSON.stringify(body) }) });
            return { status: res.status, body: await res.json() };
        };
        const draft = response.actions[0];
        const approve = `/api/agent/projects/9010/actions/${draft.id}/approve`;
        assert.equal((await request(approve, {})).status, 400);
        assert.equal((await request(approve, { confirmed: true, amountCents: 1 })).status, 400);
        assert.equal((await request(approve, { confirmed: true }, ownerToken)).status, 404);
        const [first, second] = await Promise.all([request(approve, { confirmed: true }), request(approve, { confirmed: true })]);
        assert.equal([first, second].filter(r => r.status === 200).length >= 1, true);
        assert.equal(Number((await query("SELECT COUNT(*) FROM bids WHERE project_id=9010 AND amount=25000")).rows[0].count), 1);
        assert.equal((await request(approve, { confirmed: true })).body.action.status, 'completed');
        const hoCtx = await service.context(db, owner, 9010);
        const confirm = await service.tool(db, hoCtx, 'confirmMilestone', { milestoneId: 9030 });
        assert.equal((await request(`/api/agent/projects/9010/actions/${confirm.id}/approve`, { confirmed: true }, ownerToken)).status, 200);
        assert.equal((await query('SELECT status FROM milestones WHERE id=9030')).rows[0].status, 'approved');
        const invoice = await service.tool(db, ctx, 'createInvoice', { stageId: 9030, dueDate: '2026-11-01' });
        await service.decide(contractor, 9010, invoice.id, 'approve', {});
        assert.equal((await service.documents(owner, 9010))[0].kind, 'createInvoice');
        const renewal = await service.tool(db,ctx,'requestDocumentUpdate',{contractorId:9002,documentType:'insurance',description:'Private insurance issue'});
        await service.decide(contractor,9010,renewal.id,'approve',{});
        assert.equal((await service.documents(owner,9010)).some(d => d.kind === 'requestDocumentUpdate'),false);
        await query("INSERT INTO users(id,email,password_hash,role) VALUES(9005,'new@agent.test','test','contractor')");
        await assert.rejects(service.context(db,{userId:9005},9010),{status:404});
        await service.grantAccess(owner,9010,9005);
        const newCtx = await service.context(db,{userId:9005},9010);
        const newDraft = await service.tool(db,newCtx,'draftProposal',{projectId:9010,amountCents:30000,description:'New authorized contractor',dueDate:'2026-11-01',timelineDays:20});
        assert.equal(newDraft.payload.previousBid,null);
        const { submitProposal } = require('../agent/platform');
        const newService = createAgentService({db,runtime:'pure',executePlatformAction:action=>submitProposal(db,action,'pure')});
        await newService.decide({userId:9005},9010,newDraft.id,'approve',{});
        assert.equal(Number((await query('SELECT COUNT(*) FROM bids WHERE contractor_id=9005')).rows[0].count),1);
        const co = await service.tool(db, ctx, 'createChangeOrder', { projectId: 9010, amountCents: 1000, description: 'Extra trim', dueDate: '2026-11-01' });
        await service.decide(contractor, 9010, co.id, 'reject', {});
        await assert.rejects(service.decide(contractor, 9010, co.id, 'approve', {}), { status: 409 });
        const stale = await service.tool(db, ctx, 'createInvoice', { stageId: 9030, dueDate: '2026-11-01' });
        await query('UPDATE milestones SET amount=6000 WHERE id=9030');
        await assert.rejects(service.decide(contractor, 9010, stale.id, 'approve', {}), { status: 409 });
        const expired = await service.tool(db, ctx, 'createChangeOrder', { projectId: 9010, amountCents: 1000, description: 'Expired', dueDate: '2026-11-01' });
        await query("UPDATE agent_actions SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [expired.id]);
        await assert.rejects(service.decide(contractor, 9010, expired.id, 'approve', {}), { status: 409 });
        assert.equal((await query('SELECT COUNT(*) FROM agent_audit_log WHERE approved_by=9002')).rows[0].count > 0, true);
        assert.equal((await request('/api/agent/projects/9010/chat', undefined, token + 'bad')).status, 401);
        await query('CREATE TABLE sessions(jti TEXT PRIMARY KEY,is_revoked BOOLEAN NOT NULL DEFAULT false,expires_at TIMESTAMPTZ NOT NULL)');
        await query("INSERT INTO sessions(jti,is_revoked,expires_at) VALUES('valid',false,NOW()+INTERVAL '1 day'),('revoked',true,NOW()+INTERVAL '1 day')");
        assert.equal((await request('/api/agent/projects/9010/chat',undefined,token)).status,401);
        const sessionToken = server.jwtSign({userId:9002,role:'contractor',email:'contractor@agent.test',jti:'valid'});
        const revokedToken = server.jwtSign({userId:9002,role:'contractor',email:'contractor@agent.test',jti:'revoked'});
        assert.equal((await request('/api/agent/projects/9010/chat',undefined,sessionToken)).status,200);
        assert.equal((await request('/api/agent/projects/9010/chat',undefined,revokedToken)).status,401);
        console.log('PASS: PostgreSQL migration replay, draft, UI approval, concurrent/repeated clicks, real bid submission, milestone approval, roles, project/private-history isolation, comparisons, invoice issuance, stale/expired/rejected actions and audit.');
    } finally {
        if (listener) await new Promise(resolve => listener.close(resolve));
        await server.closeStorage();
        await pool.end();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
