/**
 * ============================================================================
 * GCSC Bid Race Condition — Unit Tests
 * ============================================================================
 *
 * Tests that bid acceptance uses FOR UPDATE locks to prevent
 * duplicate escrow creation on parallel requests.
 * ============================================================================
 */

const request = require('supertest');
const express = require('express');

process.env.JWT_SECRET = 'test-secret-key';

// Mock database
const mockDb = {
    query: jest.fn(),
    transaction: jest.fn(),
    selectOne: jest.fn(),
};

jest.mock('../v3/database/db', () => mockDb);

const bidsRoutes = require('../v3/routes/bids');

const jwt = require('jsonwebtoken');
function makeToken(email, role, userId) {
    return jwt.sign(
        { email, role, userId, jti: 'test-jti-' + Math.random() },
        process.env.JWT_SECRET,
        { algorithm: 'HS256' }
    );
}

describe('GCSC Bid Race Condition Protection', () => {
    let app;
    let homeownerToken;
    let bidId;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/api/bids', bidsRoutes);

        homeownerToken = 'Bearer ' + makeToken('homeowner@test.com', 'homeowner', 1);
        bidId = 42;

        jest.clearAllMocks();
        mockDb.query.mockResolvedValue({ rows: [{ jti: 'valid-jti' }] });
    });

    it('should use FOR UPDATE when accepting a bid', async () => {
        // Setup: bid exists and is pending
        mockDb.selectOne
            .mockResolvedValueOnce({ id: 1, email: 'homeowner@test.com', role: 'homeowner' }) // get user
            .mockResolvedValueOnce({   // get bid (outside tx)
                id: bidId,
                status: 'pending',
                project_id: 10,
                project_status: 'bidding',
                contractor_id: 2,
                amount: 50000,
                homeowner_id: 1,
            });

        // Mock transaction — verify FOR UPDATE is used
        let forUpdateUsed = false;
        mockDb.transaction.mockImplementation(async (callback) => {
            const client = {
                query: jest.fn((sql, params) => {
                    if (sql.includes('FOR UPDATE')) {
                        forUpdateUsed = true;
                    }
                    if (sql.includes('SELECT * FROM bids')) {
                        return Promise.resolve({
                            rows: [{
                                id: bidId,
                                status: 'pending',
                                project_id: 10,
                                contractor_id: 2,
                                amount: 50000,
                            }]
                        });
                    }
                    if (sql.includes('SELECT * FROM projects')) {
                        return Promise.resolve({
                            rows: [{
                                id: 10,
                                status: 'bidding',
                            }]
                        });
                    }
                    if (sql.includes('UPDATE bids SET status')) {
                        return Promise.resolve({
                            rows: [{
                                id: bidId,
                                status: 'accepted',
                            }]
                        });
                    }
                    if (sql.includes('INSERT INTO escrow_contracts')) {
                        return Promise.resolve({
                            rows: [{
                                id: 100,
                                project_id: 10,
                                bid_id: bidId,
                                amount: 50000,
                                status: 'pending',
                            }]
                        });
                    }
                    return Promise.resolve({ rows: [] });
                }),
            };
            return callback(client);
        });

        const res = await request(app)
            .post(`/api/bids/${bidId}/accept`)
            .set('Authorization', homeownerToken)
            .send({ accepted_terms: true });

        expect(res.status).toBe(200);
        expect(forUpdateUsed).toBe(true);
        expect(res.body.escrow.id).toBe(100);
    });

    it('should reject accepting already-accepted bid (concurrent request simulation)', async () => {
        mockDb.selectOne
            .mockResolvedValueOnce({ id: 1, email: 'homeowner@test.com', role: 'homeowner' })
            .mockResolvedValueOnce({
                id: bidId,
                status: 'pending',
                project_id: 10,
                project_status: 'bidding',
                contractor_id: 2,
                amount: 50000,
                homeowner_id: 1,
            });

        // Simulate second request seeing bid already accepted inside tx
        mockDb.transaction.mockImplementation(async (callback) => {
            const client = {
                query: jest.fn((sql, params) => {
                    if (sql.includes('SELECT * FROM bids')) {
                        return Promise.resolve({
                            rows: [{
                                id: bidId,
                                status: 'accepted', // Already accepted by first request!
                                project_id: 10,
                            }]
                        });
                    }
                    return Promise.resolve({ rows: [] });
                }),
            };
            return callback(client);
        });

        const res = await request(app)
            .post(`/api/bids/${bidId}/accept`)
            .set('Authorization', homeownerToken)
            .send({ accepted_terms: true });

        expect(res.status).toBe(409);
        expect(res.body.error).toContain('already');
    });

    it('should reject accepting bid when project is in_progress', async () => {
        mockDb.selectOne
            .mockResolvedValueOnce({ id: 1, email: 'homeowner@test.com', role: 'homeowner' })
            .mockResolvedValueOnce({
                id: bidId,
                status: 'pending',
                project_id: 10,
                project_status: 'in_progress', // Already started!
                contractor_id: 2,
                amount: 50000,
                homeowner_id: 1,
            });

        mockDb.transaction.mockImplementation(async (callback) => {
            const client = {
                query: jest.fn((sql, params) => {
                    if (sql.includes('SELECT * FROM bids')) {
                        return Promise.resolve({
                            rows: [{
                                id: bidId,
                                status: 'pending',
                                project_id: 10,
                            }]
                        });
                    }
                    if (sql.includes('SELECT * FROM projects')) {
                        return Promise.resolve({
                            rows: [{
                                id: 10,
                                status: 'in_progress', // Project already started!
                            }]
                        });
                    }
                    return Promise.resolve({ rows: [] });
                }),
            };
            return callback(client);
        });

        const res = await request(app)
            .post(`/api/bids/${bidId}/accept`)
            .set('Authorization', homeownerToken)
            .send({ accepted_terms: true });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Cannot accept bids');
    });

    it('should reject non-whitelisted bid update fields before loading bid data', async () => {
        const contractorToken = 'Bearer ' + makeToken('contractor@test.com', 'contractor', 2);
        mockDb.query.mockResolvedValueOnce({ rows: [{ jti: 'valid-jti' }] });

        const res = await request(app)
            .put('/api/bids/42')
            .set('Authorization', contractorToken)
            .send({ amount: 50000, status: 'accepted' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('not allowed');
        expect(mockDb.selectOne).not.toHaveBeenCalled();
    });

    it('should use an explicit parameterized query for allowed bid update fields', async () => {
        const contractorToken = 'Bearer ' + makeToken('contractor@test.com', 'contractor', 2);
        mockDb.query.mockReset();

        mockDb.selectOne
            .mockResolvedValueOnce({ id: 2, email: 'contractor@test.com', role: 'contractor' })
            .mockResolvedValueOnce({
                id: 42,
                project_id: 10,
                contractor_id: 2,
                status: 'pending',
            });

        mockDb.query
            .mockResolvedValueOnce({ rows: [{ jti: 'valid-jti' }] })
            .mockResolvedValueOnce({
                rows: [{
                    id: 42,
                    project_id: 10,
                    amount: 75000,
                    timeline_days: 21,
                    description: 'Updated bid',
                    status: 'pending',
                    updated_at: '2026-05-23T00:00:00.000Z',
                }],
            })
            .mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
            .put('/api/bids/42')
            .set('Authorization', contractorToken)
            .send({
                amount: 75000,
                timeline_days: 21,
                description: 'Updated bid',
            });

        expect(res.status).toBe(200);
        expect(mockDb.query.mock.calls[1][0]).toBe(
            `UPDATE bids SET amount = $1, timeline_days = $2, description = $3, updated_at = NOW() WHERE id = $4 RETURNING *`
        );
        expect(mockDb.query.mock.calls[1][1]).toEqual([75000, 21, 'Updated bid', 42]);
    });
});
