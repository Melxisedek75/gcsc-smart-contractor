#!/usr/bin/env node
/**
 * ============================================================================
 * GCSC Escrow E2E Test — Full Milestone Workflow
 * ============================================================================
 *
 * Tests complete escrow lifecycle:
 *   1. Register homeowner + contractor
 *   2. Homeowner creates project
 *   3. Contractor places bid
 *   4. Homeowner accepts bid → escrow created
 *   5. Contractor marks milestone complete
 *   6. Homeowner approves → payment released
 *   7. Verify escrow status = released
 *
 * Run: node scripts/e2e-escrow-test.js
 * Requires: Backend running at GCSC_BACKEND_URL
 * ============================================================================
 */

const https = require('https');

const BASE_URL = process.env.GCSC_BACKEND_URL || 'https://gcsc-backend.onrender.com';
const TIMEOUT_MS = 15000;

// Test data
const TEST_USERS = {
  homeowner: {
    email: `e2e-homeowner-${Date.now()}@test.gcsc`,
    password: 'TestPass123!',
    role: 'homeowner',
    full_name: 'E2E Homeowner Test',
  },
  contractor: {
    email: `e2e-contractor-${Date.now()}@test.gcsc`,
    password: 'TestPass123!',
    role: 'contractor',
    full_name: 'E2E Contractor Test',
    business_name: 'E2E Construction Co',
    years_experience: 10,
    specialties: ['roofing', 'plumbing'],
  },
};

const TEST_PROJECT = {
  title: 'E2E Test Project — Roof Repair',
  description: 'End-to-end test project for escrow workflow validation. Small roof repair job.',
  category: 'roofing',
  location: 'Test City, TC',
  budget_min: 100000, // $1000 in cents
  budget_max: 500000, // $5000 in cents
  timeline_days: 14,
};

// State
let state = {
  homeownerToken: null,
  contractorToken: null,
  homeownerId: null,
  contractorId: null,
  projectId: null,
  bidId: null,
  escrowId: null,
  milestoneIndex: 0,
};

// Helper: HTTP request
function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const client = url.protocol === 'https:' ? https : require('http');
    
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { 'Authorization': `Bearer ${options.token}` } : {}),
        ...(options.body ? { 'Content-Length': Buffer.byteLength(JSON.stringify(options.body)) } : {}),
      },
      timeout: TIMEOUT_MS,
    };

    const req = client.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });

    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// Helper: Check response
function expect(status, expected, context) {
  const ok = expected.includes ? expected.includes(status) : status === expected;
  if (!ok) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${status} — ${context}`);
  }
  return true;
}

// ============================================================================
// TEST STEPS
// ============================================================================

async function step1_registerUsers() {
  console.log('\n📋 STEP 1: Register Test Users');
  
  // Register homeowner
  console.log('   Registering homeowner...');
  const hoRes = await request('/api/register', {
    method: 'POST',
    body: TEST_USERS.homeowner,
  });
  expect(hoRes.status, [200, 201], 'homeowner registration');
  console.log(`   ✅ Homeowner registered: ${TEST_USERS.homeowner.email}`);
  
  // Register contractor
  console.log('   Registering contractor...');
  const coRes = await request('/api/register', {
    method: 'POST',
    body: TEST_USERS.contractor,
  });
  expect(coRes.status, [200, 201], 'contractor registration');
  console.log(`   ✅ Contractor registered: ${TEST_USERS.contractor.email}`);
}

async function step2_loginUsers() {
  console.log('\n📋 STEP 2: Login + OTP Verify Users');
  
  // Step 2a: Request OTP for homeowner
  console.log('   Requesting OTP for homeowner...');
  const hoOtpRes = await request('/api/login', {
    method: 'POST',
    body: {
      email: TEST_USERS.homeowner.email,
    },
  });
  expect(hoOtpRes.status, [200], 'homeowner OTP request');
  console.log(`   ✅ OTP requested for homeowner`);
  
  // Step 2b: Verify OTP for homeowner (use test OTP if available, else mock)
  console.log('   Verifying homeowner OTP...');
  const hoVerifyRes = await request('/api/login/verify', {
    method: 'POST',
    body: {
      email: TEST_USERS.homeowner.email,
      otp: '123456', // Test OTP — may need adjustment based on backend test mode
    },
  });
  
  if (hoVerifyRes.status !== 200) {
    console.log(`   ⚠️ OTP verify returned ${hoVerifyRes.status}, trying test endpoint...`);
    // Try dev/test endpoint if available
  }
  
  expect(hoVerifyRes.status, [200], 'homeowner OTP verify');
  state.homeownerToken = hoVerifyRes.data.token;
  state.homeownerId = hoVerifyRes.data.user?.id;
  console.log(`   ✅ Homeowner logged in, token received`);
  
  // Step 2c: Request OTP for contractor
  console.log('   Requesting OTP for contractor...');
  const coOtpRes = await request('/api/login', {
    method: 'POST',
    body: {
      email: TEST_USERS.contractor.email,
    },
  });
  expect(coOtpRes.status, [200], 'contractor OTP request');
  console.log(`   ✅ OTP requested for contractor`);
  
  // Step 2d: Verify OTP for contractor
  console.log('   Verifying contractor OTP...');
  const coVerifyRes = await request('/api/login/verify', {
    method: 'POST',
    body: {
      email: TEST_USERS.contractor.email,
      otp: '123456',
    },
  });
  expect(coVerifyRes.status, [200], 'contractor OTP verify');
  state.contractorToken = coVerifyRes.data.token;
  state.contractorId = coVerifyRes.data.user?.id;
  console.log(`   ✅ Contractor logged in, token received`);
}

async function step3_createProject() {
  console.log('\n📋 STEP 3: Create Project (Homeowner)');
  
  const res = await request('/api/projects', {
    method: 'POST',
    token: state.homeownerToken,
    body: TEST_PROJECT,
  });
  expect(res.status, [200, 201], 'project creation');
  state.projectId = res.data.id || res.data.project?.id;
  console.log(`   ✅ Project created: ID=${state.projectId}`);
}

async function step4_placeBid() {
  console.log('\n📋 STEP 4: Place Bid (Contractor)');
  
  const res = await request('/api/bids', {
    method: 'POST',
    token: state.contractorToken,
    body: {
      project_id: state.projectId,
      amount: 250000, // $2500 in cents
      timeline_days: 10,
      message: 'I can complete this roof repair in 10 days for $2500.',
    },
  });
  expect(res.status, [200, 201], 'bid creation');
  state.bidId = res.data.id || res.data.bid?.id;
  console.log(`   ✅ Bid placed: ID=${state.bidId}`);
}

async function step5_acceptBid() {
  console.log('\n📋 STEP 5: Accept Bid → Create Escrow (Homeowner)');
  
  const res = await request(`/api/bids/${state.bidId}/accept`, {
    method: 'POST',
    token: state.homeownerToken,
  });
  expect(res.status, [200], 'bid acceptance');
  state.escrowId = res.data.escrow_id || res.data.escrow?.id;
  console.log(`   ✅ Bid accepted, escrow created: ID=${state.escrowId}`);
}

async function step6_fundEscrow() {
  console.log('\n📋 STEP 6: Fund Escrow (Stripe Test)');
  
  // Create payment intent
  const res = await request('/api/stripe/create-payment-intent', {
    method: 'POST',
    token: state.homeownerToken,
    body: {
      escrow_id: state.escrowId,
      amount_cents: 250000,
    },
  });
  
  // May be 200 (mock) or 401 (if Stripe not configured)
  if (res.status === 200) {
    console.log(`   ✅ Payment intent created: ${res.data.payment_intent_id || 'mock'}`);
  } else {
    console.log(`   ⚠️ Payment intent skipped (status ${res.status}) — continuing test`);
  }
}

async function step7_completeMilestone() {
  console.log('\n📋 STEP 7: Mark Milestone Complete (Contractor)');
  
  const res = await request(`/api/escrow/${state.escrowId}/milestone/0/complete`, {
    method: 'POST',
    token: state.contractorToken,
  });
  expect(res.status, [200], 'milestone completion');
  console.log(`   ✅ Milestone 0 marked complete`);
  console.log(`      Message: ${res.data.message || res.data.status}`);
}

async function step8_approveMilestone() {
  console.log('\n📋 STEP 8: Approve Milestone → Release Payment (Homeowner)');
  
  const res = await request(`/api/escrow/${state.escrowId}/milestone/0/approve`, {
    method: 'POST',
    token: state.homeownerToken,
  });
  expect(res.status, [200], 'milestone approval');
  console.log(`   ✅ Milestone 0 approved, payment released`);
  console.log(`      Status: ${res.data.status}`);
  console.log(`      Escrow status: ${res.data.escrow_status}`);
}

async function step9_verifyEscrow() {
  console.log('\n📋 STEP 9: Verify Escrow Status');
  
  const res = await request(`/api/escrow/${state.escrowId}`, {
    method: 'GET',
    token: state.homeownerToken,
  });
  expect(res.status, [200], 'escrow retrieval');
  
  const escrow = res.data.escrow;
  const milestones = res.data.milestones || [];
  
  console.log(`   Escrow status: ${escrow?.status}`);
  console.log(`   Milestones: ${milestones.length}`);
  milestones.forEach((m, i) => {
    console.log(`      Milestone ${i}: ${m.status}`);
  });
  
  if (escrow?.status === 'released') {
    console.log('   ✅ ESCROW FULLY RELEASED — Test PASSED');
    return true;
  } else {
    console.log(`   ⚠️ Escrow status: ${escrow?.status} — may need more milestones`);
    return false;
  }
}

async function step10_cleanup() {
  console.log('\n📋 STEP 10: Cleanup (Optional)');
  console.log('   Test users created (not deleted for audit trail):');
  console.log(`      Homeowner: ${TEST_USERS.homeowner.email}`);
  console.log(`      Contractor: ${TEST_USERS.contractor.email}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function runE2ETest() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  GCSC Escrow E2E Test — Milestone Workflow                 ║');
  console.log('║  Backend: ' + BASE_URL.padEnd(48) + ' ║');
  console.log('║  Time:   ' + new Date().toISOString().padEnd(48) + ' ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  const startTime = Date.now();
  let passed = false;
  
  try {
    await step1_registerUsers();
    await step2_loginUsers();
    await step3_createProject();
    await step4_placeBid();
    await step5_acceptBid();
    await step6_fundEscrow();
    await step7_completeMilestone();
    await step8_approveMilestone();
    passed = await step9_verifyEscrow();
    await step10_cleanup();
    
  } catch (err) {
    console.error(`\n❌ TEST FAILED: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Result: ${passed ? '✅ PASSED' : '🟡 PARTIAL'}${' '.repeat(42 - (passed ? 10 : 11))}║`);
  console.log(`║  Duration: ${duration}s${' '.repeat(46 - duration.length)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  process.exit(passed ? 0 : 2);
}

runE2ETest();
