/**
 * Stripe Payment Integration (FIXED: Database persistence)
 * Escrow funding via PaymentIntent
 * 
 * STATUS: Database-backed (was in-memory, see SECURITY-AUDIT-2026-05-20.md MEDIUM-1)
 * Apply migration: v3/database/stripe-payments-migration.sql
 */

const crypto = require('crypto');
const STRIPE_CONFIG = require('../stripe-config');
const db = require('../database/db');

// Mock Stripe for testing (until sk_test_ key is provided)
class MockStripe {
  constructor() {
    this.paymentIntents = new Map();
    this.nextId = 1;
  }
  
  async createPaymentIntent(params) {
    const id = `pi_${Buffer.from(String(this.nextId++)).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
    const clientSecret = `${id}_secret_${crypto.randomBytes(16).toString('hex')}`;
    
    const intent = {
      id,
      client_secret: clientSecret,
      amount: params.amount,
      currency: params.currency || 'usd',
      status: 'requires_confirmation',
      metadata: params.metadata || {},
      created: Math.floor(Date.now() / 1000)
    };
    
    this.paymentIntents.set(id, intent);
    console.log(`[MockStripe] Created PaymentIntent: ${id} for $${params.amount/100}`);
    return intent;
  }
  
  async confirmPaymentIntent(id, params) {
    const intent = this.paymentIntents.get(id);
    if (!intent) throw new Error('PaymentIntent not found');
    
    intent.status = 'succeeded';
    console.log(`[MockStripe] Confirmed PaymentIntent: ${id}`);
    return intent;
  }
  
  async retrievePaymentIntent(id) {
    return this.paymentIntents.get(id) || null;
  }
  
  async createRefund(params) {
    return {
      id: `re_${crypto.randomBytes(12).toString('hex')}`,
      amount: params.amount,
      status: 'succeeded',
      payment_intent: params.payment_intent
    };
  }
}

// Use real Stripe if sk_test_ key available, otherwise mock
let stripe;
let useMock = false;

if (STRIPE_CONFIG.secretKey && STRIPE_CONFIG.secretKey.startsWith('sk_test_')) {
  try {
    const Stripe = require('stripe');
    stripe = Stripe(STRIPE_CONFIG.secretKey);
    console.log('[Stripe] ✅ Using REAL Stripe API (test mode)');
    useMock = false;
  } catch (e) {
    console.log('[Stripe] ⚠️ Failed to load Stripe SDK, using mock');
    stripe = new MockStripe();
    useMock = true;
  }
} else {
  console.log('[Stripe] ℹ️ Using MOCK Stripe (add sk_test_ key for real integration)');
  stripe = new MockStripe();
  useMock = true;
}

// JWT Authentication — FIXED: Using proper JWT verification with signature check
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || '';

async function getUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 30,
    });
    
    if (!decoded.jti) return null;
    
    const { rows } = await db.query(
      'SELECT * FROM sessions WHERE jti = $1 AND is_revoked = false AND expires_at > NOW()',
      [decoded.jti]
    );
    
    if (rows.length === 0) return null;
    
    return decoded;
  } catch {
    return null;
  }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}

const stripeRoutes = {
  // Create PaymentIntent for escrow
  'POST /api/stripe/create-payment-intent': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (user.role !== 'homeowner') return json(res, 403, { error: 'Homeowners only' });
    
    const body = await parseBody(req);
    const { escrow_id, amount_usd } = body;
    
    if (!escrow_id || !amount_usd) {
      return json(res, 400, { error: 'escrow_id and amount_usd required' });
    }
    
    const amount = Math.round(parseFloat(amount_usd) * 100); // cents
    
    if (amount < STRIPE_CONFIG.minEscrowAmount) {
      return json(res, 400, { error: `Minimum amount $${STRIPE_CONFIG.minEscrowAmount/100}` });
    }
    if (amount > STRIPE_CONFIG.maxEscrowAmount) {
      return json(res, 400, { error: `Maximum amount $${STRIPE_CONFIG.maxEscrowAmount/100}` });
    }
    
    try {
      const paymentIntent = await stripe.createPaymentIntent({
        amount,
        currency: STRIPE_CONFIG.currency,
        metadata: {
          escrow_id: String(escrow_id),
          user_id: String(user.userId),
          type: 'escrow_funding'
        },
        automatic_payment_methods: { enabled: true }
      });
      
      // FIXED: Save to database instead of in-memory array
      const stripeMode = stripe instanceof MockStripe ? 'test_mock' : 'test_live';
      const result = await db.query(
        `INSERT INTO stripe_payment_intents 
         (escrow_id, user_id, payment_intent_id, amount_usd, currency, status, stripe_mode, client_secret, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING *`,
        [
          parseInt(escrow_id),
          user.userId,
          paymentIntent.id,
          amount,
          STRIPE_CONFIG.currency,
          'pending',
          stripeMode,
          paymentIntent.client_secret
        ]
      );
      
      const payment = result.rows[0];
      
      json(res, 200, {
        message: 'Payment intent created',
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        amount: amount_usd,
        mode: stripeMode
      });
    } catch (err) {
      console.error('[Stripe Error]', err.message);
      json(res, 500, { error: 'Payment creation failed', details: err.message });
    }
  },
  
  // Confirm payment (webhook or manual)
  'POST /api/stripe/confirm': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const body = await parseBody(req);
    const { payment_intent_id } = body;
    
    try {
      if (useMock) {
        // Mock mode: auto-confirm
        const intent = await stripe.confirmPaymentIntent(payment_intent_id, {});
        
        // FIXED: Update database record
        const result = await db.query(
          `UPDATE stripe_payment_intents 
           SET status = 'succeeded', confirmed_at = NOW(), updated_at = NOW()
           WHERE payment_intent_id = $1 AND user_id = $2
           RETURNING *`,
          [payment_intent_id, user.userId]
        );
        
        const payment = result.rows[0] || null;
        
        json(res, 200, {
          message: 'Payment confirmed (mock mode)',
          status: intent.status,
          payment
        });
      } else {
        // Real Stripe: retrieve and verify
        const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
        
        // FIXED: Update database record
        const result = await db.query(
          `UPDATE stripe_payment_intents 
           SET status = $1, confirmed_at = CASE WHEN $1 = 'succeeded' THEN NOW() ELSE confirmed_at END, updated_at = NOW()
           WHERE payment_intent_id = $2 AND user_id = $3
           RETURNING *`,
          [intent.status, payment_intent_id, user.userId]
        );
        
        const payment = result.rows[0] || null;
        
        json(res, 200, {
          message: 'Payment status retrieved',
          status: intent.status,
          payment_intent_id,
          payment
        });
      }
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  },
  
  // Webhook handler
  'POST /api/stripe/webhook': async (req, res) => {
    // For real Stripe, verify signature
    // For mock, just acknowledge
    json(res, 200, { received: true });
  },
  
  // Get payment config (for frontend)
  'GET /api/stripe/config': async (req, res) => {
    json(res, 200, {
      publishableKey: STRIPE_CONFIG.publishableKey,
      currency: STRIPE_CONFIG.currency,
      minAmount: STRIPE_CONFIG.minEscrowAmount,
      maxAmount: STRIPE_CONFIG.maxEscrowAmount,
      escrowFeePercent: STRIPE_CONFIG.escrowFeePercent,
      mode: stripe instanceof MockStripe ? 'test_mock' : 'test_live'
    });
  },
  
  // Get my payments — FIXED: Query database
  'GET /api/stripe/my/payments': async (req, res) => {
    const user = await getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    try {
      const result = await db.query(
        `SELECT * FROM stripe_payment_intents 
         WHERE user_id = $1 
         ORDER BY created_at DESC`,
        [user.userId]
      );
      
      json(res, 200, { payments: result.rows, total: result.rows.length });
    } catch (err) {
      console.error('[Stripe Payments DB Error]', err.message);
      json(res, 500, { error: 'Failed to retrieve payments', details: err.message });
    }
  }
};

module.exports = stripeRoutes;
