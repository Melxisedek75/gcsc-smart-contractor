const id = { type: 'integer', minimum: 1, maximum: 2147483647 };
const text = { type: 'string', minLength: 1, maxLength: 5000 };
const money = { type: 'integer', minimum: 1, maximum: 100000000, description: 'USD cents, never dollars' };
const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'ISO date YYYY-MM-DD' };
const document = { amountCents: money, description: text, dueDate: date };
const definitions = {
    getProjects: ['common', {}, 'Read the current project only; never load another project into this conversation.'],
    getProjectDetails: ['common', { projectId: id }, 'Read authorized project details.'],
    getMilestones: ['common', { projectId: id }, 'Read milestones and their current status.'],
    getDocumentsStatus: ['common', { contractorId: id }, 'Read only license, insurance and bond status and expiry. Unknown dates stay unknown.'],
    draftProposal: ['contractor', { projectId: id, ...document, timelineDays: { ...id, maximum: 3650 } }, 'Prepare a private proposal draft; sendProposal requires UI approval.'],
    sendProposal: ['contractor', { draftId: { type: 'string', format: 'uuid' } }, 'Prepare sending a proposal. Returns requiresApproval; cannot execute from model calls.'],
    createEstimate: ['contractor', { projectId: id, items: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', properties: { description: text, quantity: { ...id, maximum: 10000 }, unitPriceCents: money }, required: ['description', 'quantity', 'unitPriceCents'], additionalProperties: false } } }, 'Calculate a private estimate from supplied line items. Do not invent prices.'],
    createInvoice: ['contractor', { stageId: id, dueDate: date }, 'Prepare an invoice for the stored milestone amount; issuance requires UI approval.'],
    createChangeOrder: ['contractor', { projectId: id, ...document }, 'Prepare a change order for UI approval; homeowner must separately accept before scope or funds change.'],
    requestDocumentUpdate: ['contractor', { contractorId: id, documentType: { type: 'string', enum: ['license', 'insurance', 'bond'] }, description: text }, 'Prepare a renewal request requiring UI approval; does not verify or alter documents.'],
    compareProposals: ['homeowner', { projectId: id }, 'Read a comparison table of submitted bids for the owner.'],
    getEscrowStatus: ['homeowner', { projectId: id }, 'Read escrow status without moving funds.'],
    confirmMilestone: ['homeowner', { milestoneId: id }, 'Prepare approval of an existing milestone; UI approval required. Existing settlement gates still apply.'],
};

function validate(schema, value) {
    if (schema.type === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid arguments');
        if (Object.keys(value).some(k => !Object.hasOwn(schema.properties, k))) throw new Error('Unknown argument');
        for (const k of schema.required) if (!Object.hasOwn(value, k)) throw new Error('Missing argument');
        for (const [k, v] of Object.entries(value)) validate(schema.properties[k], v);
    } else if (schema.type === 'integer') {
        if (!Number.isSafeInteger(value) || value < schema.minimum || value > schema.maximum) throw new Error('Invalid integer');
    } else if (schema.type === 'string') {
        if (typeof value !== 'string' || (schema.minLength && !value.trim()) || value.length > (schema.maxLength || 100)) throw new Error('Invalid text');
        if (schema.enum && !schema.enum.includes(value)) throw new Error('Invalid choice');
        if (schema.pattern && (!new RegExp(schema.pattern).test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error('Invalid date');
        if (schema.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error('Invalid draft ID');
    } else if (schema.type === 'array') {
        if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) throw new Error('Invalid list');
        value.forEach(v => validate(schema.items, v));
    }
}

function toolsFor(role) {
    return Object.entries(definitions).filter(([, d]) => d[0] === 'common' || d[0] === role).map(([name, d]) => ({
        type: 'function', function: { name, description: d[2], parameters: { type: 'object', properties: d[1], required: Object.keys(d[1]), additionalProperties: false } },
    }));
}

function validateCall(role, name, args) {
    const tool = toolsFor(role).find(t => t.function.name === name);
    if (!tool) throw Object.assign(new Error('Tool unavailable'), { status: 403 });
    try { validate(tool.function.parameters, args); } catch { throw Object.assign(new Error('Invalid tool arguments'), { status: 400 }); }
}

module.exports = { toolsFor, validateCall };
