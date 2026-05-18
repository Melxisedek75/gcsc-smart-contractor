/**
 * Stripe Configuration
 * Uses test keys for development
 */

// Public key (from Serhiy's Stripe account)
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_51TYIq72L5mE6p0DUoeWdjUjB2FYjUOcfoVu4DObk587CQuVUW1P5BrEuwT4D8vJSz1vZP9h9hRvJbE2BW37AGOJW00OxT01z90';

// Secret key (MUST be set as environment variable)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

// Webhook secret
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Config
const STRIPE_CONFIG = {
  publishableKey: STRIPE_PUBLISHABLE_KEY,
  secretKey: STRIPE_SECRET_KEY,
  webhookSecret: STRIPE_WEBHOOK_SECRET,
  currency: 'usd',
  
  // Escrow fee: 1.5% per transaction
  escrowFeePercent: 1.5,
  
  // Minimum escrow amount
  minEscrowAmount: 500, // $5.00
  
  // Maximum escrow amount
  maxEscrowAmount: 10000000, // $100,000.00
  
  // Payout delay (7 days for contractors)
  payoutDelayDays: 7
};

module.exports = STRIPE_CONFIG;
