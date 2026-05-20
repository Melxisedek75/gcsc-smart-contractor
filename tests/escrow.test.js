/**
 * ============================================================================
 * GCSC Escrow Routes — Unit Tests (for patched version)
 * ============================================================================
 *
 * Run: npx jest tests/escrow.test.js
 *
 * Tests cover:
 *   - ESC-001: Contractor marks milestone complete
 *   - ESC-002: Homeowner approves completed milestone
 *   - ESC-004: Race condition — double approve idempotency
 *   - ESC-005: Dispute on funded escrow
 *   - ESC-006: Unauthorized access attempts
 *   - ESC-007: Invalid state transitions
 * ============================================================================
 */

const request = require('supertest');
const express = require('express');

// Mock the database module before requiring routes
const mockDb = {
    query: jest.fn(),
    selectOne: jest.fn(),
    select: jest.fn(),
    transaction: jest.fn((callback) => {
        const client = {
            query: jest.fn(),
        };
        return callback(client);
    }),
};

jest.mock('../v3/database/db', () => mockDb);

const escrowRoutes = require('../v3/routes/escrow-patched');

// Mock JWT_SECRET
process.env.JWT_SECRET = 'test-secret-key-for-jwt-signing-2026';

// Helper: Generate valid JWT for tests
const jwt = require('jsonwebtoken');
function makeToken(email, role = 'homeowner') {
    return jwt.sign(
        { email, role, jti: 'test-jti-' + Math.random() },
        process.env.JWT_SECRET,
        { algorithm: 'HS256' }
    );
}

describe('GCSC Escrow Routes (Patched)', () => {
    let app;
    let homeownerToken;
    let contractorToken;
    let thirdUserToken;

    const homeownerUser = { id: 1, email: 'homeowner@test.com', role: 'homeowner' };
    const contractorUser = { id: 2, email: 'contractor@test.com', role: 'contractor' };
    const thirdUser = { id: 99, email: 'third@test.com', role: 'homeowner' };

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/api/escrow', escrowRoutes);

        homeownerToken = 'Bearer ' + makeToken('homeowner@test.com', 'homeowner');
        contractorToken = 'Bearer ' + makeToken('contractor@test.com', 'contractor');
        thirdUserToken = 'Bearer ' + makeToken('third@test.com', 'homeowner');

        // Reset all mocks
        jest.clearAllMocks();
    });

    // =========================================================================
    // ESC-001: Contractor marks milestone complete
    // =========================================================================
    describe('POST /:id/milestone/:index/complete', () => {
        it('should allow contractor to mark milestone as completed', async () => {
            // Setup mocks
            mockDb.selectOne
                .mockResolvedValueOnce(homeownerUser)   // Session check (JWT middleware)
                .mockResolvedValueOnce(contractorUser)  // Get user from token
                .mockResolvedValueOnce({                  // Get escrow
                    id: 1,
                    homeowner_id: 1,
                    contractor_id: 2,
                    status: 'funded',
                    project_id: 10,
                })
                .mockResolvedValueOnce({                  // Get milestone
                    id: 100,
                    escrow_id: 1,
                    milestone_index: 0,
                    status: 'pending',
                    amount: 50000,
                });

            mockDb.query.mockResolvedValue({ rowCount: 1 });

            const res = await request(app)
                .post('/api/escrow/1/milestone/0/complete')
                .set('Authorization', contractorToken);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('completed');
            expect(res.body.message).toContain('completed');
        });

        it('should reject homeowner trying to complete milestone (ESC-006)', async () => {
            mockDb.selectOne
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce({
                    id: 1,
                    homeowner_id: 1,
                    contractor_id: 2,
                    status: 'funded',
                    project_id: 10,
                });

            const res = await request(app)
                .post('/api/escrow/1/milestone/0/complete')
                .set('Authorization', homeownerToken);

            expect(res.status).toBe(403);
            expect(res.body.error).toContain('Only the contractor');
        });

        it('should reject completing already-completed milestone (ESC-007)', async () => {
            mockDb.selectOne
                .mockResolvedValueOnce(contractorUser)
                .mockResolvedValueOnce(contractorUser)
                .mockResolvedValueOnce({
                    id: 1,
                    homeowner_id: 1,
                    contractor_id: 2,
                    status: 'funded',
                    project_id: 10,
                })
                .mockResolvedValueOnce({
                    id: 100,
                    status: 'completed',
                });

            const res = await request(app)
                .post('/api/escrow/1/milestone/0/complete')
                .set('Authorization', contractorToken);

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('already completed');
        });
    });

    // =========================================================================
    // ESC-002: Homeowner approves completed milestone
    // =========================================================================
    describe('POST /:id/milestone/:index/approve', () => {
        it('should approve completed milestone and release payment', async () => {
            mockDb.selectOne
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce({
                    id: 1,
                    homeowner_id: 1,
                    contractor_id: 2,
                    status: 'funded',
                    project_id: 10,
                })
                .mockResolvedValueOnce({
                    id: 100,
                    escrow_id: 1,
                    milestone_index: 0,
                    status: 'completed',
                    amount: 50000,
                });

            // Mock transaction with client
            mockDb.transaction.mockImplementation(async (callback) => {
                const client = {
                    query: jest.fn()
                        .mockResolvedValueOnce({  // FOR UPDATE lock
                            rows: [{
                                id: 100,
                                status: 'completed',
                                amount: 50000,
                            }]
                        })
                        .mockResolvedValueOnce({ rowCount: 1 })  // UPDATE milestone
                        .mockResolvedValueOnce({ rowCount: 1 })  // INSERT audit log
                        .mockResolvedValueOnce({  // Check pending milestones
                            rows: [{ count: '0' }]
                        })
                        .mockResolvedValueOnce({ rowCount: 1 })  // UPDATE escrow
                        .mockResolvedValueOnce({ rowCount: 1 })  // INSERT escrow audit
                        .mockResolvedValueOnce({ rowCount: 1 }), // UPDATE project
                };
                return callback(client);
            });

            const res = await request(app)
                .post('/api/escrow/1/milestone/0/approve')
                .set('Authorization', homeownerToken);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('released');
            expect(res.body.released_amount_cents).toBe(50000);
        });

        it('should reject contractor trying to approve (ESC-006)', async () => {
            mockDb.selectOne
                .mockResolvedValueOnce(contractorUser)
                .mockResolvedValueOnce(contractorUser)
                .mockResolvedValueOnce({
                    id: 1,
                    homeowner_id: 1,
                    contractor_id: 2,
                    status: 'funded',
                    project_id: 10,
                });

            const res = await request(app)
                .post('/api/escrow/1/milestone/0/approve')
                .set('Authorization', contractorToken);

            expect(res.status).toBe(403);
            expect(res.body.error).toContain('Only the homeowner');
        });

        it('should reject approving pending milestone (ESC-007)', async () => {
            mockDb.selectOne
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce({
                    id: 1,
                    homeowner_id: 1,
                    contractor_id: 2,
                    status: 'funded',
                    project_id: 10,
                })
                .mockResolvedValueOnce({
                    id: 100,
                    status: 'pending',
                });

            const res = await request(app)
                .post('/api/escrow/1/milestone/0/approve')
                .set('Authorization', homeownerToken);

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('must be completed');
        });
    });

    // =========================================================================
    // ESC-004: Race condition — double approve idempotency
    // =========================================================================
    describe('Race Condition Protection (ESC-004)', () => {
        it('should use FOR UPDATE to lock milestone during approve', async () => {
            mockDb.selectOne
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce({
                    id: 1,
                    homeowner_id: 1,
                    contractor_id: 2,
                    status: 'funded',
                    project_id: 10,
                })
                .mockResolvedValueOnce({
                    id: 100,
                    status: 'completed',
                    amount: 50000,
                });

            let capturedQueries = [];
            mockDb.transaction.mockImplementation(async (callback) => {
                const client = {
                    query: jest.fn((sql, params) => {
                        capturedQueries.push(sql);
                        if (sql.includes('FOR UPDATE')) {
                            return Promise.resolve({
                                rows: [{
                                    id: 100,
                                    status: 'completed',
                                    amount: 50000,
                                }]
                            });
                        }
                        if (sql.includes('UPDATE milestones')) {
                            return Promise.resolve({ rowCount: 1 });
                        }
                        if (sql.includes('INSERT INTO milestone_audit_log')) {
                            return Promise.resolve({ rowCount: 1 });
                        }
                        if (sql.includes('COUNT(*)')) {
                            return Promise.resolve({ rows: [{ count: '1' }] });
                        }
                        return Promise.resolve({ rowCount: 1 });
                    }),
                };
                return callback(client);
            });

            const res = await request(app)
                .post('/api/escrow/1/milestone/0/approve')
                .set('Authorization', homeownerToken);

            expect(res.status).toBe(200);
            // Verify FOR UPDATE was used
            const forUpdateQuery = capturedQueries.find(q => q.includes('FOR UPDATE'));
            expect(forUpdateQuery).toBeDefined();
            expect(forUpdateQuery).toContain('FOR UPDATE');
        });
    });

    // =========================================================================
    // ESC-005: Dispute on funded escrow
    // =========================================================================
    describe('POST /:id/dispute', () => {
        it('should allow either party to open dispute on funded escrow', async () => {
            mockDb.selectOne
                .mockResolvedValueOnce(contractorUser)
                .mockResolvedValueOnce(contractorUser)
                .mockResolvedValueOnce({
                    id: 1,
                    homeowner_id: 1,
                    contractor_id: 2,
                    status: 'funded',
                    project_id: 10,
                });

            mockDb.transaction.mockImplementation(async (callback) => {
                const client = {
                    query: jest.fn().mockResolvedValue({ rowCount: 1 }),
                };
                return callback(client);
            });

            const res = await request(app)
                .post('/api/escrow/1/dispute')
                .set('Authorization', contractorToken)
                .send({ reason: 'Work not done properly', evidence: ['photo1.jpg'] });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('disputed');
        });

        it('should reject dispute on released escrow', async () => {
            mockDb.selectOne
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce({
                    id: 1,
                    homeowner_id: 1,
                    contractor_id: 2,
                    status: 'released',
                    project_id: 10,
                });

            const res = await request(app)
                .post('/api/escrow/1/dispute')
                .set('Authorization', homeownerToken)
                .send({ reason: 'I changed my mind' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Cannot dispute');
        });

        it('should reject dispute on cancelled escrow (ESC-003 patch)', async () => {
            mockDb.selectOne
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce({
                    id: 1,
                    homeowner_id: 1,
                    contractor_id: 2,
                    status: 'cancelled',
                    project_id: 10,
                });

            const res = await request(app)
                .post('/api/escrow/1/dispute')
                .set('Authorization', homeownerToken)
                .send({ reason: 'Testing cancelled status' });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Cannot dispute');
        });

        it('should reject third user opening dispute (ESC-006)', async () => {
            mockDb.selectOne
                .mockResolvedValueOnce(thirdUser)
                .mockResolvedValueOnce(thirdUser)
                .mockResolvedValueOnce({
                    id: 1,
                    homeowner_id: 1,
                    contractor_id: 2,
                    status: 'funded',
                    project_id: 10,
                });

            const res = await request(app)
                .post('/api/escrow/1/dispute')
                .set('Authorization', thirdUserToken)
                .send({ reason: 'I am hacker' });

            expect(res.status).toBe(403);
            expect(res.body.error).toContain('Only the homeowner or contractor');
        });
    });

    // =========================================================================
    // GET /api/escrow/:id — Access control
    // =========================================================================
    describe('GET /:id', () => {
        it('should allow homeowner to view their escrow', async () => {
            mockDb.selectOne
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce(homeownerUser)
                .mockResolvedValueOnce({
                    id: 1,
                    homeowner_id: 1,
                    contractor_id: 2,
                    project_id: 10,
                    project_title: 'Test Project',
                    homeowner_email: 'homeowner@test.com',
                    contractor_email: 'contractor@test.com',
                    amount: 150000,
                    status: 'funded',
                });

            mockDb.select
                .mockResolvedValueOnce([])  // milestones
                .mockResolvedValueOnce([])  // disputes
                .mockResolvedValueOnce([]); // payments

            const res = await request(app)
                .get('/api/escrow/1')
                .set('Authorization', homeownerToken);

            expect(res.status).toBe(200);
            expect(res.body.escrow.id).toBe(1);
        });

        it('should reject third user viewing escrow (ESC-006)', async () => {
            mockDb.selectOne
                .mockResolvedValueOnce(thirdUser)
                .mockResolvedValueOnce(thirdUser)
                .mockResolvedValueOnce({
                    id: 1,
                    homeowner_id: 1,
                    contractor_id: 2,
                    project_id: 10,
                });

            const res = await request(app)
                .get('/api/escrow/1')
                .set('Authorization', thirdUserToken);

            expect(res.status).toBe(403);
            expect(res.body.error).toContain('Access denied');
        });
    });
});
