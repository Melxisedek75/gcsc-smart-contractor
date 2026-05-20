/**
 * ============================================================================
 * GCSC Admin Middleware — Unit Tests
 * ============================================================================
 */

const request = require('supertest');
const express = require('express');

// Mock database
const mockDb = {
  query: jest.fn(),
};

jest.mock('../v3/database/db', () => mockDb);

const { requireAuth, requireAdmin, requireRole, requireEscrowParty } = require('../v3/middleware/admin');

process.env.JWT_SECRET = 'test-secret-key';

const jwt = require('jsonwebtoken');
function makeToken(email, role, userId, jti) {
  return jwt.sign(
    { email, role, userId, jti: jti || 'test-jti-' + Math.random() },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

// Create a test app with protected routes
function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/protected', requireAuth, (req, res) => {
    res.json({ message: 'OK', user: req.user });
  });

  app.get('/api/admin-only', requireAdmin, (req, res) => {
    res.json({ message: 'Admin OK', user: req.user });
  });

  app.get('/api/moderator', requireRole('admin', 'mediator'), (req, res) => {
    res.json({ message: 'Moderator OK', user: req.user });
  });

  app.get('/api/escrow-party', requireEscrowParty, (req, res) => {
    res.json({ message: 'Escrow Party OK', user: req.user });
  });

  return app;
}

describe('GCSC Admin Middleware', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('should allow authenticated user', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ jti: 'valid-jti' }] });
      const token = 'Bearer ' + makeToken('user@test.com', 'homeowner', 1, 'valid-jti');

      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', token);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('OK');
      expect(res.body.user.email).toBe('user@test.com');
    });

    it('should reject missing token', async () => {
      const res = await request(app).get('/api/protected');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(res.status).toBe(401);
    });

    it('should reject revoked session', async () => {
      mockDb.query.mockResolvedValue({ rows: [] }); // Session not found
      const token = 'Bearer ' + makeToken('user@test.com', 'homeowner', 1, 'revoked-jti');

      const res = await request(app)
        .get('/api/protected')
        .set('Authorization', token);

      expect(res.status).toBe(401);
    });
  });

  describe('requireAdmin', () => {
    it('should allow admin user', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ jti: 'admin-jti' }] });
      const token = 'Bearer ' + makeToken('admin@test.com', 'admin', 1, 'admin-jti');

      const res = await request(app)
        .get('/api/admin-only')
        .set('Authorization', token);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Admin OK');
    });

    it('should reject homeowner', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ jti: 'user-jti' }] });
      const token = 'Bearer ' + makeToken('user@test.com', 'homeowner', 1, 'user-jti');

      const res = await request(app)
        .get('/api/admin-only')
        .set('Authorization', token);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Admin access required');
    });

    it('should reject contractor', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ jti: 'contractor-jti' }] });
      const token = 'Bearer ' + makeToken('contractor@test.com', 'contractor', 2, 'contractor-jti');

      const res = await request(app)
        .get('/api/admin-only')
        .set('Authorization', token);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Admin access required');
    });
  });

  describe('requireRole', () => {
    it('should allow admin', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ jti: 'admin-jti' }] });
      const token = 'Bearer ' + makeToken('admin@test.com', 'admin', 1, 'admin-jti');

      const res = await request(app)
        .get('/api/moderator')
        .set('Authorization', token);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Moderator OK');
    });

    it('should allow mediator', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ jti: 'mediator-jti' }] });
      const token = 'Bearer ' + makeToken('mediator@test.com', 'mediator', 3, 'mediator-jti');

      const res = await request(app)
        .get('/api/moderator')
        .set('Authorization', token);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Moderator OK');
    });

    it('should reject homeowner', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ jti: 'user-jti' }] });
      const token = 'Bearer ' + makeToken('user@test.com', 'homeowner', 1, 'user-jti');

      const res = await request(app)
        .get('/api/moderator')
        .set('Authorization', token);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Required role: admin or mediator');
    });
  });

  describe('requireEscrowParty', () => {
    it('should allow homeowner', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ jti: 'user-jti' }] });
      const token = 'Bearer ' + makeToken('user@test.com', 'homeowner', 1, 'user-jti');

      const res = await request(app)
        .get('/api/escrow-party')
        .set('Authorization', token);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Escrow Party OK');
    });

    it('should allow contractor', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ jti: 'contractor-jti' }] });
      const token = 'Bearer ' + makeToken('contractor@test.com', 'contractor', 2, 'contractor-jti');

      const res = await request(app)
        .get('/api/escrow-party')
        .set('Authorization', token);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Escrow Party OK');
    });

    it('should reject admin', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ jti: 'admin-jti' }] });
      const token = 'Bearer ' + makeToken('admin@test.com', 'admin', 1, 'admin-jti');

      const res = await request(app)
        .get('/api/escrow-party')
        .set('Authorization', token);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Only homeowners or contractors allowed');
    });
  });
});
