#!/usr/bin/env node
/**
 * ============================================================================
 * GCSC Public API Test — No Auth Required
 * ============================================================================
 *
 * Tests endpoints that don't require authentication:
 *   - Health check
 *   - Project listing (public)
 *   - Registration (creates OTP)
 *
 * Run: node scripts/public-api-test.js
 * ============================================================================
 */

const https = require('https');

const BASE_URL = process.env.GCSC_BACKEND_URL || 'https://gcsc-backend.onrender.com';

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
        ...(options.body ? { 'Content-Length': Buffer.byteLength(JSON.stringify(options.body)) } : {}),
      },
      timeout: 15000,
    };

    const req = client.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });

    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  GCSC Public API Test                                       ║');
  console.log('║  Backend: ' + BASE_URL.padEnd(48) + ' ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  let passed = 0;
  let failed = 0;

  // Test 1: Health check
  try {
    const res = await request('/health');
    if (res.status === 200 && res.data.status === 'ok') {
      console.log('✅ /health — OK');
      passed++;
    } else {
      console.log(`❌ /health — Status ${res.status}, expected 200`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ /health — ${err.message}`);
    failed++;
  }

  // Test 2: Project listing (public)
  try {
    const res = await request('/api/projects');
    if (res.status === 200 && Array.isArray(res.data.projects)) {
      console.log(`✅ /api/projects — OK (${res.data.projects.length} projects)`);
      passed++;
    } else {
      console.log(`❌ /api/projects — Status ${res.status}, expected 200`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ /api/projects — ${err.message}`);
    failed++;
  }

  // Test 3: Registration (no auth required)
  try {
    const testEmail = `public-test-${Date.now()}@test.gcsc`;
    const res = await request('/api/register', {
      method: 'POST',
      body: {
        email: testEmail,
        password: 'Test123!',
        role: 'homeowner',
        full_name: 'Public Test User',
      },
    });
    if (res.status === 200 && res.data.message === 'OTP sent') {
      console.log(`✅ /api/register — OK (OTP sent to ${testEmail})`);
      passed++;
    } else {
      console.log(`❌ /api/register — Status ${res.status}, expected 200 with OTP sent`);
      console.log(`   Response: ${JSON.stringify(res.data).slice(0, 100)}`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ /api/register — ${err.message}`);
    failed++;
  }

  // Test 4: Login (currently broken — should be 200 but returns 404)
  try {
    const res = await request('/api/login', {
      method: 'POST',
      body: { email: 'any@test.com' },
    });
    if (res.status === 200) {
      console.log(`✅ /api/login — OK`);
      passed++;
    } else {
      console.log(`❌ /api/login — Status ${res.status}, expected 200`);
      console.log(`   This is a KNOWN ISSUE — auth endpoints return 404 on Render`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ /api/login — ${err.message}`);
    failed++;
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Results: ${passed} passed, ${failed} failed${' '.repeat(42 - passed.toString().length - failed.toString().length)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n⚠️  Known issue: /api/login returns 404 on Render deployment');
    console.log('   GCSC ClawDesctop needs to verify auth routes are connected');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
