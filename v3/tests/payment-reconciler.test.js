/**
 * Strict Hyperion verification + pending-payment reconciler
 *
 * The payloads below are verbatim captures from the live XPR testnet on
 * 2026-07-15, because the whole design rests on one subtle fact: a healthy node
 * and a six-weeks-stale node answer an unknown tx *identically* (HTTP 200 +
 * executed:false). Only last_indexed_block vs lib tells them apart. If that ever
 * changes upstream, these tests are what catches it.
 */

const mod = require('../pure-server');
const {
  db,
  _hooks,
  verifyHyperionTransfer,
  reconcilePendingPayments,
  isHyperionPayloadAuthoritative,
} = mod;

const originalFetch = global.fetch;
const originalVerifier = _hooks.verifyHyperionTransfer;

const LIB = 395482660;
const TX = '73db5534d18b8f152a606a1c8da52ceac35bf6349224c1c1759b67f647f65f0a';

// Healthy node, tx absent: index tracks head, so "not found" is the truth.
const HEALTHY_ABSENT = {
  query_time_ms: 2.5, executed: false, trx_id: TX,
  lib: LIB, cached_lib: false,
  last_indexed_block: 395482996,
  last_indexed_block_time: '2026-07-15T19:39:41.500',
};

// Stale node, same shape, but its index is six weeks behind — it cannot know.
const STALE_ABSENT = {
  query_time_ms: 1.5, executed: false, trx_id: TX,
  lib: LIB, cached_lib: false,
  last_indexed_block: 388431093,
  last_indexed_block_time: '2026-06-04T15:18:14.500',
};

function healthyFound({ from = 'ownerstest15', to = 'gcsctoken111', quantity = '50.0000 XPR', memo = 'gcsc:lead-token', timestamp } = {}) {
  return {
    query_time_ms: 1.0, executed: true, trx_id: TX, lib: LIB,
    last_indexed_block: 395482996,
    actions: [{
      action_ordinal: 1,
      act: {
        account: 'eosio.token', name: 'transfer',
        authorization: [{ actor: from, permission: 'active' }],
        data: { from, to, amount: 50, symbol: 'XPR', memo, quantity },
      },
      '@timestamp': timestamp || new Date().toISOString().replace('Z', ''),
      block_num: 395481564,
    }],
  };
}

function mockNodes(responses) {
  // responses: array matched positionally to the configured node list
  let call = 0;
  global.fetch = jest.fn(async () => {
    const payload = responses[Math.min(call++, responses.length - 1)];
    if (payload === 'network-error') throw new Error('connect ECONNREFUSED');
    return { ok: true, status: 200, json: async () => payload };
  });
}

afterEach(() => {
  global.fetch = originalFetch;
  _hooks.verifyHyperionTransfer = originalVerifier;
  db.payment_receipts.length = 0;
  db.lead_tokens.length = 0;
});

// ---- staleness discriminator ----

test('index at chain head is authoritative', () => {
  expect(isHyperionPayloadAuthoritative(HEALTHY_ABSENT)).toBe(true);
});

test('index weeks behind lib is not authoritative', () => {
  expect(isHyperionPayloadAuthoritative(STALE_ABSENT)).toBe(false);
});

test('payload without index metadata is not authoritative', () => {
  expect(isHyperionPayloadAuthoritative({ executed: false })).toBe(false);
});

// ---- strict verification ----

test('healthy node reporting tx absent rejects definitively, never pending', async () => {
  mockNodes([HEALTHY_ABSENT]);
  const r = await verifyHyperionTransfer({
    txHash: TX, expectedRecipient: 'gcsctoken111', expectedAmount: '50.0000 XPR',
  });
  expect(r.ok).toBe(false);
  expect(r.error).toBe('tx_not_found');
  expect(r.pending).toBeUndefined();
});

test('only stale nodes reachable yields pending, not a false rejection', async () => {
  mockNodes([STALE_ABSENT]);
  const r = await verifyHyperionTransfer({
    txHash: TX, expectedRecipient: 'gcsctoken111', expectedAmount: '50.0000 XPR',
  });
  expect(r.ok).toBe(false);
  expect(r.error).toBe('no_authoritative_node');
  expect(r.pending).toBe(true);
});

test('stale node cannot veto a transfer a healthy node confirms', async () => {
  mockNodes([STALE_ABSENT, healthyFound()]);
  const r = await verifyHyperionTransfer({
    txHash: TX, expectedRecipient: 'gcsctoken111', expectedAmount: '50.0000 XPR',
    expectedMemo: 'gcsc:lead-token', expectedFrom: 'ownerstest15',
  });
  expect(r.ok).toBe(true);
  expect(r.from).toBe('ownerstest15');
});

test('sender binding still rejects a hash paid by someone else', async () => {
  mockNodes([healthyFound({ from: 'attacker111' })]);
  const r = await verifyHyperionTransfer({
    txHash: TX, expectedRecipient: 'gcsctoken111', expectedAmount: '50.0000 XPR',
    expectedFrom: 'ownerstest15',
  });
  expect(r.ok).toBe(false);
  expect(r.error).toBe('bad_sender');
});

test('unreachable nodes yield pending rather than rejecting a paid user', async () => {
  mockNodes(['network-error']);
  const r = await verifyHyperionTransfer({
    txHash: TX, expectedRecipient: 'gcsctoken111', expectedAmount: '50.0000 XPR',
  });
  expect(r.pending).toBe(true);
});

// ---- reconciler ----

function seedPendingLead() {
  db.payment_receipts.push({
    id: 1, tx_hash: TX, kind: 'lead-token', user_id: 7,
    from_account: 'ownerstest15', amount: '50.0000 XPR', block_num: null,
    verification_status: 'pending', verify_error: '', verified_at: null,
    created_at: new Date().toISOString(),
  });
  db.lead_tokens.push({ id: 'lead_x', user_id: 7, tx_hash: TX, status: 'pending_verification' });
}

test('reconciler activates the withheld lead once the transfer verifies', async () => {
  seedPendingLead();
  _hooks.verifyHyperionTransfer = async () => ({ ok: true, from: 'ownerstest15', block_num: 395481564 });

  await reconcilePendingPayments();

  expect(db.payment_receipts[0].verification_status).toBe('confirmed');
  expect(db.lead_tokens[0].status).toBe('active');
});

test('reconciler revokes the lead when the transfer is definitively bad', async () => {
  seedPendingLead();
  _hooks.verifyHyperionTransfer = async () => ({ ok: false, error: 'bad_amount' });

  await reconcilePendingPayments();

  expect(db.payment_receipts[0].verification_status).toBe('rejected');
  expect(db.lead_tokens[0].status).toBe('revoked');
});

test('reconciler leaves the lead withheld while history is still unavailable', async () => {
  seedPendingLead();
  _hooks.verifyHyperionTransfer = async () => ({ ok: false, error: 'no_authoritative_node', pending: true });

  await reconcilePendingPayments();

  expect(db.payment_receipts[0].verification_status).toBe('pending');
  expect(db.lead_tokens[0].status).toBe('pending_verification');
});

test('reconciler judges tx age from acceptance time, not from now', async () => {
  seedPendingLead();
  // Accepted 3 days ago; the tx was fresh then. Re-anchoring to now would trip
  // PAYMENT_TX_MAX_AGE_MS and wrongly revoke a legitimately paid lead.
  const acceptedAt = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  db.payment_receipts[0].created_at = acceptedAt;
  let seenNowMs = null;
  _hooks.verifyHyperionTransfer = async (input) => {
    seenNowMs = input.nowMs;
    return { ok: true, from: 'ownerstest15' };
  };

  await reconcilePendingPayments();

  expect(seenNowMs).toBe(new Date(acceptedAt).getTime());
  expect(db.lead_tokens[0].status).toBe('active');
});
