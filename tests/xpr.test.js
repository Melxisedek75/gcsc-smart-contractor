/**
 * ============================================================================
 * GCSC XPR Routes — Unit Tests
 * ============================================================================
 *
 * Tests cover:
 *   - Account lookup validation
 *   - Escrow creation auth + validation
 *   - Transaction push validation
 *   - Input sanitization
 * ============================================================================
 */

const request = require('supertest');
const express = require('express');

// Mock database
const mockDb = {
  query: jest.fn(),
  selectOne: jest.fn(),
};

jest.mock('../v3/database/db', () => mockDb);

// Mock @proton/api
jest.mock('@proton/api', () => ({
  JsonRpc: jest.fn().mockImplementation(() => ({
    get_account: jest.fn().mockResolvedValue({
      account_name: 'testuser',
      created: '2024-01-01',
      ram_usage: 1000,
      ram_quota: 10000,
      cpu_limit: { used: 100, available: 900, max: 1000 },
      net_limit: { used: 100, available: 900, max: 1000 },
      permissions: []
    }),
    get_currency_balance: jest.fn().mockResolvedValue(['100.0000 XPR']),
    history_get_transaction: jest.fn().mockResolvedValue({
      block_num: 12345,
      block_time: '2024-01-01T00:00:00',
      last_irreversible_block: 12350,
      trx: { trx: { actions: [] } }
    })
  }))
}));

// Mock @proton/js
jest.mock('@proton/js', () => ({
  Api: jest.fn(),
  JsonRpc: jest.fn().mockImplementation(() => ({
    push_transaction: jest.fn().mockResolvedValue({
      transaction_id: 'abc123def456',
      processed: { receipt: { status: 'executed' } }
    })
  }))
}));

const xprRoutes = require('../v3/routes/xpr');

process.env.JWT_SECRET = 'test-secret-key';

const jwt = require('jsonwebtoken');
function makeToken(email, role, userId) {
  return jwt.sign(
    { email, role, userId, jti: 'test-jti-' + Math.random() },
    process.env.JWT_SECRET,
    { algorithm: 'HS256' }
  );
}

describe('GCSC XPR Routes', () => {
  let app;
  let homeownerToken;
  let contractorToken;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/xpr', xprRoutes);

    homeownerToken = 'Bearer ' + makeToken('homeowner@test.com', 'homeowner', 1);
    contractorToken = 'Bearer ' + makeToken('contractor@test.com', 'contractor', 2);

    jest.clearAllMocks();
  });

  describe('GET /api/xpr/account/:account_name', () => {
    it('should validate account name format', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ jti: 'test' }] });

      const res = await request(app)
        .get('/api/xpr/account/INVALID_NAME_123')
        .set('Authorization', homeownerToken);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid account name');
    });

    it('should reject invalid account names (too long)', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ jti: 'test' }] });

      const res = await request(app)
        .get('/api/xpr/account/verylongaccountname')
        .set('Authorization', homeownerToken);

      expect(res.status).toBe(400);
    });

    it('should return account info for valid name', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ jti: 'test' }] });

      const res = await request(app)
        .get('/api/xpr/account/testuser')
        .set('Authorization', homeownerToken);

      expect(res.status).toBe(200);
      expect(res.body.account_name).toBe('testuser');
      expect(res.body.balances).toContain('100.0000 XPR');
    });

    it('should reject unauthenticated requests', async () => {
      const res = await request(app)
        .get('/api/xpr/account/testuser');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/xpr/escrow/create', () => {
    it('should require homeowner role', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ jti: 'test' }] });

      const res = await request(app)
        .post('/api/xpr/escrow/create')
        .set('Authorization', contractorToken)
        .send({
          project_id: 1,
          homeowner_account: 'homeowner',
          contractor_account: 'contractor',
          amount_xpr: '100.0000',
          milestones: [{ description: 'Phase 1', amount: '50.0000' }]
        });

      expect(res.status).toBe(403);
    });

    it('should validate milestone count (max 20)', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ jti: 'test' }] });

      const milestones = Array(21).fill({ description: 'Test', amount: '1.0000' });

      const res = await request(app)
        .post('/api/xpr/escrow/create')
        .set('Authorization', homeownerToken)
        .send({
          project_id: 1,
          homeowner_account: 'homeowner',
          contractor_account: 'contractor',
          amount_xpr: '100.0000',
          milestones
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('1-20');
    });

    it('should validate XPR account name format', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ jti: 'test' }] });

      const res = await request(app)
        .post('/api/xpr/escrow/create')
        .set('Authorization', homeownerToken)
        .send({
          project_id: 1,
          homeowner_account: 'INVALID_NAME!!!',
          contractor_account: 'contractor',
          amount_xpr: '100.0000',
          milestones: [{ description: 'Phase 1', amount: '50.0000' }]
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/xpr/escrow/dispute', () => {
    it('should reject dispute on released escrow', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ jti: 'test' }] });
      mockDb.selectOne
        .mockResolvedValueOnce({ id: 1, email: 'homeowner@test.com' })
        .mockResolvedValueOnce({
          id: 1,
          homeowner_id: 1,
          contractor_id: 2,
          status: 'released',
          project_id: 10
        });

      const res = await request(app)
        .post('/api/xpr/escrow/dispute')
        .set('Authorization', homeownerToken)
        .send({ escrow_id: 1, reason: 'Test dispute' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot dispute');
    });

    it('should reject third-party dispute', async () => {
      const thirdToken = 'Bearer ' + makeToken('third@test.com', 'homeowner', 99);
      mockDb.query.mockResolvedValueOnce({ rows: [{ jti: 'test' }] });
      mockDb.selectOne
        .mockResolvedValueOnce({ id: 99, email: 'third@test.com' })
        .mockResolvedValueOnce({
          id: 1,
          homeowner_id: 1,
          contractor_id: 2,
          status: 'funded',
          project_id: 10
        });

      const res = await request(app)
        .post('/api/xpr/escrow/dispute')
        .set('Authorization', thirdToken)
        .send({ escrow_id: 1, reason: 'I am hacker' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/xpr/transaction/push', () => {
    it('should validate actions array', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ jti: 'test' }] });

      const res = await request(app)
        .post('/api/xpr/transaction/push')
        .set('Authorization', homeownerToken)
        .send({ actions: [], signatures: ['sig1'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non-empty');
    });

    it('should validate signature format', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ jti: 'test' }] });

      const res = await request(app)
        .post('/api/xpr/transaction/push')
        .set('Authorization', homeownerToken)
        .send({
          actions: [{ account: 'test', name: 'test', authorization: [{ actor: 'test', permission: 'active' }], data: {} }],
          signatures: ['short'] // too short
        });

      expect(res.status).toBe(400);
    });
  });
});
