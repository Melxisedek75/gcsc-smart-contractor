const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const script = fs.readFileSync(path.join(__dirname, '../public/agent-chat.js'), 'utf8');
const draft = { id: '19d469ca-bda0-4ea3-86aa-178c160011f9', action: 'sendProposal', user_id: 2, status: 'pending',
    expires_at: '2099-01-01T00:00:00Z', payload: { amountCents: 150000, description: '<img src=x onerror=alert(1)>', dueDate: '2026-11-01', homeownerId: 1, contractorId: 2, consequence: 'Submit proposal' } };

function setup(data, documents = []) {
    const dom = new JSDOM('<gcsc-project-agent project-id="10"></gcsc-project-agent>', { url: 'https://gcsc.test', runScripts: 'outside-only' });
    dom.window.localStorage.setItem('gcsc_token', 'test-user-token');
    dom.window.fetch = jest.fn(async url => ({ ok: true, json: async () => url.endsWith('/documents') ? { documents } : data }));
    dom.window.eval(script);
    return { dom, widget: dom.window.document.querySelector('gcsc-project-agent') };
}

test('draft card shows exact money and renders untrusted output as text', async () => {
    const { dom, widget } = setup({ mode: 'contractor', messages: [{ role: 'assistant', content: '<script>alert(1)</script>' }], actions: [draft] });
    try {
        await widget.refresh();
        expect(widget.textContent).toContain('$1,500.00');
        expect(widget.textContent).toContain('Submit proposal');
        expect(widget.querySelector('img')).toBeNull();
        expect(widget.querySelector('script')).toBeNull();
        expect(widget.textContent).toContain('<img');
        expect([...widget.querySelectorAll('button')].some(b => b.textContent === 'Подтвердить')).toBe(true);
    } finally { dom.window.close(); }
});

test('proposal comparison uses a table and stored cents are formatted as USD', async () => {
    const { dom, widget } = setup({ mode: 'homeowner', messages: [{ role: 'tool', content: JSON.stringify({ columns: ['contractor_id', 'amount', 'scope'], rows: [{ contractor_id: 2, amount: 9900, scope: 'Roof' }] }) }], actions: [] });
    try {
        await widget.refresh();
        expect(widget.querySelector('table').textContent).toContain('$99.00');
        expect(widget.querySelector('table').textContent).toContain('Roof');
        expect(widget.querySelector('input[type=number]')).not.toBeNull();
    } finally { dom.window.close(); }
});

test('confirmation sends only stored action ID and explicit confirmation; refresh restores state', async () => {
    const { dom, widget } = setup({ mode: 'contractor', messages: [], actions: [draft] });
    try {
        await widget.refresh();
        [...widget.querySelectorAll('button')].find(b => b.textContent === 'Подтвердить').click();
        for (let i=0;i<10 && widget.busy;i++) await Promise.resolve();
        const request = dom.window.fetch.mock.calls.find(([url]) => url.endsWith('/approve'));
        expect(request[0]).toContain(`/projects/10/actions/${draft.id}/approve`);
        expect(JSON.parse(request[1].body)).toEqual({ confirmed: true });
        expect(request[1].headers.Authorization).toBe('Bearer test-user-token');
    } finally { dom.window.close(); }
});

test('issued documents render with their pending acceptance status', async () => {
    const { dom, widget } = setup({ mode:'homeowner', messages:[], actions:[] }, [{ kind:'createChangeOrder',status:'awaiting_homeowner',payload:{description:'Extra trim',amountCents:1000,consequence:'Owner must approve separately'} }]);
    try {
        await widget.refresh();
        expect(widget.textContent).toContain('awaiting_homeowner');
        expect(widget.textContent).toContain('Owner must approve separately');
    } finally { dom.window.close(); }
});
