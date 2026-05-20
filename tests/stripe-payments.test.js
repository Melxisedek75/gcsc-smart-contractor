/**
 * ============================================================================
 * GCSC Stripe Payment Routes — Unit Tests (Patched)
 * ============================================================================
 *
 * Tests cover:
 *   - Auth: JWT signature verification, session validation
 *   - Create payment intent: validation, database persistence
 *   - Confirm payment: status update in database
 *   - List payments: user-scoped queries
 *   - Security: unauthorized access, role checks
 * ============================================================================
 */

const request = require('supertest');

// Mock database before requiring routes
const mockDb = {
  query: jest.fn(),
};

jest.mock('../v3/database/db', () => mockDb);

// Mock stripe-config
jest.mock('../v3/stripe-config', () => ({
  secretKey: null, // Force mock mode
  publishableKey: 'pk_test_123',
  currency: 'usd',
  minEscrowAmount: 1000, // $10
  maxEscrowAmount: 10000000, // $100,000
  escrowFeePercent: 2.5
}));

const stripeRoutes = require('../v3/routes/stripe-payments');

// Helper to create Express app with stripe routes
function createApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  
  // Convert route object to Express router
  app.post('/api/stripe/create-payment-intent', async (req, res) => {
    await stripeRoutes['POST /api/stripe/create-payment-intent'](req, res);
  });
  app.post('/api/stripe/confirm', async (req, res) => {
    await stripeRoutes['POST /api/stripe/confirm'](req, res);
  });
  app.get('/api/stripe/config', async (req, res) => {
    await stripeRoutes['GET /api/stripe/config'](req, res);
  });
  app.get('/api/stripe/my/payments', async (req, res) => {
    await stripeRoutes['GET /api/stripe/my/payments'](req, res);
  });
  
  return app;
}

// JWT helper
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'test-secret-key';

function makeToken(email, role, userId) {
  return jwt.sign(
    { email, role, userId, jti: 'test-jti-' + Math.random() },
    process.env.JWT_SECRET,
    { algorithm: 'HS256' }
  );
}

describe('GCSC Stripe Payment Routes (Patched)', () => {
  let app;
  let homeownerToken;
  let contractorToken;
  let invalidToken;

  beforeEach(() => {
    app = createApp();
    homeownerToken = 'Bearer ' + makeToken('homeowner@test.com', 'homeowner', 1);
    contractorToken = 'Bearer ' + makeToken('contractor@test.com', 'contractor', 2);
    invalidToken = 'Bearer invalid.jwt.token';
    
    jest.clearAllMocks();
  });

  // ========================================================================
  // Authentication Tests (HIGH-2 fix validation)
  // ========================================================================
  describe('Authentication', () => {
    it('should reject invalid JWT token', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      
      const res = await request(app)
        .post('/api/stripe/create-payment-intent')
        .set('Authorization', invalidToken)
        .send({ escrow_id: 1, amount_usd: 100 });
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should reject revoked session', async () => {
      mockDb.query.mockResolvedValue({ rows: [] }); // No valid session
      
      const res = await request(app)
        .post('/api/stripe/create-payment-intent')
        .set('Authorization', homeownerToken)
        .send({ escrow_id: 1, amount_usd: 100 });
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should reject contractor trying to create payment', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ jti: 'test' }] });
      
      const res = await request(app)
        .post('/api/stripe/create-payment-intent')
        .set('Authorization', contractorToken)
        .send({ escrow_id: 1, amount_usd: 100 });
      
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Homeowners only');
    });
  });

  // ========================================================================
  // Create Payment Intent Tests (MEDIUM-1 fix validation)
  // ========================================================================
  describe('POST /api/stripe/create-payment-intent', () => {
    it('should create payment intent and save to database', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ jti: 'test' }] }) // Session check
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            escrow_id: 1,
            user_id: 1,
            payment_intent_id: 'pi_test_123',
            amount_usd: 10000,
            currency: 'usd',
            status: 'pending',
            stripe_mode: 'test_mock'
          }]
        }); // INSERT payment
      
      const res = await request(app)
        .post('/api/stripe/create-payment-intent')
        .set('Authorization', homeownerToken)
        .send({ escrow_id: 1, amount_usd: 100 });
      
      expect(res.status).toBe(200);
      expect(res.body.payment_intent_id).toMatch(/^pi_/);
      expect(res.body.mode).toBe('test_mock');
      
      // Verify database INSERT was called (MEDIUM-1 fix)
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const insertCall = mockDb.query.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO stripe_payment_intents');
    });

    it('should reject amount below minimum', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ jti: 'test' }] });
      
      const res = await request(app)
        .post('/api/stripe/create-payment-intent')
        .set('Authorization', homeownerToken)
        .send({ escrow_id: 1, amount_usd: 5 }); // Below $10 minimum
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Minimum');
    });

    it('should reject missing escrow_id', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ jti: 'test' }] });
      
      const res = await request(app)
        .post('/api/stripe/create-payment-intent')
        .set('Authorization', homeownerToken)
        .send({ amount_usd: 100 });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('escrow_id');
    });
  });

  // ========================================================================
  // Confirm Payment Tests
  // ========================================================================
  describe('POST /api/stripe/confirm', () => {
    it('should confirm payment and update database', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ jti: 'test' }] }) // Session
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            payment_intent_id: 'pi_test_123',
            status: 'succeeded'
          }]
        }); // UPDATE payment
      
      const res = await request(app)
        .post('/api/stripe/confirm')
        .set('Authorization', homeownerToken)
        .send({ payment_intent_id: 'pi_test_123' });
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('succeeded');
      
      // Verify database UPDATE was called
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const updateCall = mockDb.query.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE stripe_payment_intents');
    });
  });

  // ========================================================================
  // List Payments Tests (MEDIUM-1 fix validation)
  // ========================================================================
  describe('GET /api/stripe/my/payments', () => {
    it('should return payments from database', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ jti: 'test' }] }) // Session
        .mockResolvedValueOnce({
          rows: [
            { id: 1, amount_usd: 10000, status: 'succeeded' },
            { id: 2, amount_usd: 5000, status: 'pending' }
          ]
        }); // SELECT payments
      
      const res = await request(app)
        .get('/api/stripe/my/payments')
        .set('Authorization', homeownerToken);
      
      expect(res.status).toBe(200);
      expect(res.body.payments).toHaveLength(2);
      expect(res.body.total).toBe(2);
      
      // Verify database SELECT was called
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const selectCall = mockDb.query.mock.calls[1];
      expect(selectCall[0]).toContain('SELECT * FROM stripe_payment_intents');
    });

    it('should reject unauthenticated request', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      
      const res = await request(app)
        .get('/api/stripe/my/payments')
        .set('Authorization', invalidToken);
      
      expect(res.status).toBe(401);
    });
  });

  // ========================================================================
  // Config Endpoint Tests
  // ========================================================================
  describe('GET /api/stripe/config', () => {
    it('should return stripe config without auth', async () => {
      const res = await request(app)
        .get('/api/stripe/config');
      
      expect(res.status).toBe(200);
      expect(res.body.publishableKey).toBe('pk_test_123');
      expect(res.body.mode).toBe('test_mock');
    });
  });
});
