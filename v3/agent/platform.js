/* Called only after a durable UI approval claim. Never exposed as a model tool. */
async function submitProposal(db, action, runtime) {
    return db.transaction(async tx => {
        const p = action.payload;
        const project = (await tx.query('SELECT id,homeowner_id,status FROM projects WHERE id=$1 FOR UPDATE', [action.project_id])).rows[0];
        if (!project || project.homeowner_id !== p.homeownerId || !['open', 'bidding'].includes(project.status) || project.homeowner_id === action.user_id) throw new Error('Project changed');
        const current = (await tx.query(`SELECT id,amount,status,COALESCE(to_jsonb(b)->>'description',to_jsonb(b)->>'message') AS description,
            COALESCE(to_jsonb(b)->>'timeline_days',to_jsonb(b)->>'proposed_timeline_days') AS timeline FROM bids b
            WHERE project_id=$1 AND contractor_id=$2 AND status='pending' ORDER BY id LIMIT 1 FOR UPDATE`, [action.project_id,action.user_id])).rows[0] || null;
        if (Boolean(current) !== Boolean(p.previousBid) || (current && ['id','amount','status','description','timeline'].some(key => current[key] !== p.previousBid[key]))) throw new Error('Existing proposal changed; prepare a new draft');
        const pure = runtime === 'pure';
        const query = current
            ? pure ? "UPDATE bids SET amount=$1,proposed_timeline_days=$2,message=$3,updated_at=NOW() WHERE id=$4 AND contractor_id=$5 AND status='pending' RETURNING *"
                : "UPDATE bids SET amount=$1,timeline_days=$2,description=$3,updated_at=NOW() WHERE id=$4 AND contractor_id=$5 AND status='pending' RETURNING *"
            : pure ? "INSERT INTO bids(amount,proposed_timeline_days,message,project_id,contractor_id,status) VALUES($1,$2,$3,$4,$5,'pending') RETURNING *"
                : "INSERT INTO bids(amount,timeline_days,description,project_id,contractor_id,status,created_at) VALUES($1,$2,$3,$4,$5,'pending',NOW()) RETURNING *";
        const result = await tx.query(query, [p.amountCents,p.timelineDays,p.description,current?.id || action.project_id,action.user_id]);
        if (!result.rows[0]) throw new Error('Proposal changed');
        await tx.query("UPDATE projects SET status='bidding',updated_at=NOW() WHERE id=$1 AND status='open'", [action.project_id]);
        await tx.query('INSERT INTO agent_audit_log(who,action,project_id,approved_by,action_id) VALUES($1,$2,$3,$1,$4)',
            [action.user_id,current ? 'proposal.updated' : 'proposal.sent',action.project_id,action.id]);
        return { bid: result.rows[0], operation: current ? 'updated' : 'sent' };
    });
}
module.exports = { submitProposal };
