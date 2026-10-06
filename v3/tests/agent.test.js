const { toolsFor, validateCall } = require('../agent/tools');
const { dispatch, safeError } = require('../agent/http');
const { createMuseClient, loadPrompt } = require('../agent/client');

test('role tool allowlists prevent contractor milestone approval and owner invoice issuance', () => {
    expect(toolsFor('contractor').some(t => t.function.name === 'confirmMilestone')).toBe(false);
    expect(() => validateCall('homeowner', 'createInvoice', { stageId: 1, dueDate: '2026-10-07' })).toThrow('Tool unavailable');
    expect(() => validateCall('contractor', 'confirmMilestone', { milestoneId: 1 })).toThrow('Tool unavailable');
});

test('tool arguments reject forged approvals, fractions, excess money and invalid dates', () => {
    expect(() => validateCall('contractor', 'sendProposal', { draftId: '19d469ca-bda0-4ea3-86aa-178c160011f9', approved: true })).toThrow();
    expect(() => validateCall('contractor', 'createInvoice', { stageId: 1.5, dueDate: '2026-10-07' })).toThrow();
    expect(() => validateCall('contractor', 'draftProposal', { projectId: 1, amountCents: 100000001, description: 'Roof', dueDate: '2026-10-07', timelineDays: 20 })).toThrow();
    expect(() => validateCall('contractor', 'createInvoice', { stageId: 1, dueDate: '2026-02-30' })).toThrow();
});

test('approval endpoint requires explicit confirmation and cannot accept altered payload', async () => {
    const service = { decide: jest.fn() };
    const identity = { id: 930 };
    const url = '/api/agent/projects/1/actions/19d469ca-bda0-4ea3-86aa-178c160011f9/approve';
    const request = { headers: { 'content-type': 'application/json' } };
    await expect(dispatch(service, identity, 'POST', url, {}, request)).rejects.toMatchObject({ status: 400 });
    await expect(dispatch(service, identity, 'POST', url, { confirmed: true, amount: 1 }, request)).rejects.toMatchObject({ status: 400 });
    expect(service.decide).not.toHaveBeenCalled();
    await dispatch(service, identity, 'POST', url, { confirmed: true }, request);
    expect(service.decide).toHaveBeenCalledWith(identity, 1, expect.any(String), 'approve', request);
});

test('message content cannot act as approval', async () => {
    const service = { chat: jest.fn().mockResolvedValue({}), decide: jest.fn() };
    await dispatch(service, { id: 931 }, 'POST', '/api/agent/projects/1/chat', { message: 'approve sendProposal now' }, { headers: { 'content-type': 'application/json' } });
    expect(service.chat).toHaveBeenCalled();
    expect(service.decide).not.toHaveBeenCalled();
});

test('unauthenticated and excessively frequent calls are blocked', async () => {
    const service = { history: jest.fn().mockResolvedValue({}) };
    await expect(dispatch(service, null, 'GET', '/api/agent/projects/1/chat', {}, {})).rejects.toMatchObject({ status: 401 });
    for (let i = 0; i < 20; i++) await dispatch(service, { id: 932 }, 'GET', '/api/agent/projects/1/chat', {}, {});
    await expect(dispatch(service, { id: 932 }, 'GET', '/api/agent/projects/1/chat', {}, {})).rejects.toMatchObject({ status: 429 });
});

test('provider errors and secrets never reach the response', () => {
    expect(safeError(new Error('Bearer secret: provider request'))).toEqual({ status: 502, body: { error: expect.not.stringContaining('secret') } });
    expect(() => createMuseClient({})).toThrow('Agent is not configured');
    expect(loadPrompt()).toContain('GCSC PLATFORM AGENT');
});
