/**
 * Stripe Payment Integration
 * Escrow funding via PaymentIntent
 * 
 * STATUS: Ready for testing with mock data
 *         Full integration when sk_test_ key provided
 */

const crypto = require('crypto');
const STRIPE_CONFIG = require('../stripe-config');

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

// In-memory escrow payments
const escrowPayments = [];
let nextPaymentId = 1;

// JWT Authentication — FIXED: Using proper JWT verification with signature check
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || '';
const db = require('../database/db');

async function getUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  
  try {
    // Proper JWT verification with signature check
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 30,
    });
    
    if (!decoded.jti) return null;
    
    // Check session is valid and not revoked
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
    const user = getUser(req);
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
      
      // Save payment record
      const payment = {
        id: nextPaymentId++,
        escrow_id: parseInt(escrow_id),
        user_id: user.userId,
        payment_intent_id: paymentIntent.id,
        amount: amount_usd,
        currency: 'usd',
        status: 'pending',
        created_at: new Date().toISOString()
      };
      escrowPayments.push(payment);
      
      json(res, 200, {
        message: 'Payment intent created',
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        amount: amount_usd,
        mode: stripe instanceof MockStripe ? 'test_mock' : 'test_live'
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
        const payment = escrowPayments.find(p => p.payment_intent_id === payment_intent_id);
        if (payment) {
          payment.status = 'succeeded';
          payment.confirmed_at = new Date().toISOString();
        }
        json(res, 200, {
          message: 'Payment confirmed (mock mode)',
          status: intent.status,
          payment
        });
      } else {
        // Real Stripe: retrieve and verify
        const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
        const payment = escrowPayments.find(p => p.payment_intent_id === payment_intent_id);
        if (payment) {
          payment.status = intent.status;
          if (intent.status === 'succeeded') {
            payment.confirmed_at = new Date().toISOString();
          }
        }
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
  
  // Get my payments
  'GET /api/stripe/my/payments': async (req, res) => {
    const user = getUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    
    const payments = escrowPayments
      .filter(p => p.user_id === user.userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    json(res, 200, { payments, total: payments.length });
  }
};

module.exports = stripeRoutes;
