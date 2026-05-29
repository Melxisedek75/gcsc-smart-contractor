const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const v3Root = path.resolve(__dirname, '..');
const jsonDbPath = path.join(v3Root, 'gcsc.db');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gcsc-stripe-smoke-'));
const fakeStripePath = path.join(tempRoot, 'fake-stripe.js');
const registerPath = path.join(tempRoot, 'register-fake-stripe.js');

fs.writeFileSync(fakeStripePath, `
const crypto = require('crypto');

module.exports = function createStripeClient(secretKey) {
  return {
    paymentIntents: {
      async create(params) {
        return {
          id: 'pi_test_local_1',
          client_secret: 'pi_test_local_1_secret_local',
          status: 'requires_payment_method',
          amount: params.amount,
          currency: params.currency,
          metadata: params.metadata || {},
        };
      },
    },
    webhooks: {
      constructEvent(rawBody, signature, webhookSecret) {
        const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
        const timestampMatch = String(signature || '').match(/(?:^|,)t=([^,]+)/);
        const signatureMatch = String(signature || '').match(/(?:^|,)v1=([^,]+)/);
        if (!timestampMatch || !signatureMatch) throw new Error('Invalid Stripe signature header');
        const expected = crypto
          .createHmac('sha256', webhookSecret)
          .update(timestampMatch[1] + '.' + body)
          .digest('hex');
        if (signatureMatch[1] !== expected) throw new Error('Invalid Stripe signature');
        return JSON.parse(body);
      },
    },
  };
};
`);

fs.writeFileSync(registerPath, `
const Module = require('module');
const fakeStripe = require(${JSON.stringify(fakeStripePath)});
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'stripe') return fakeStripe;
  return originalLoad.apply(this, arguments);
};
`);

function signStripePayload(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(timestamp + '.' + payload)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function request(port, method, pathname, body, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const isRaw = Buffer.isBuffer(body) || typeof body === 'string';
    const payload = body === undefined || body === null
      ? ''
      : (isRaw ? body : JSON.stringify(body));
    const headers = {
      'Content-Length': Buffer.byteLength(payload),
      ...(isRaw ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    };

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: data ? JSON.parse(data) : {} });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function startServer(port, env = {}) {
  fs.rmSync(jsonDbPath, { force: true });
  const child = spawn(process.execPath, ['pure-server.js'], {
    cwd: v3Root,
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: 'test-secret-minimum-length-for-hs256',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      XPR_TX_VERIFIER_ENABLED: 'false',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderrText = '';
  child.stderr.on('data', (chunk) => { child.stderrText += chunk.toString(); });
  return child;
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function waitForServer(port, child) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < 8000) {
    try {
      const health = await request(port, 'GET', '/health');
      if (health.status === 200) return health.data;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Server did not start. Last error: ${lastError?.message || 'none'}\\nSTDERR:\\n${child.stderrText || ''}`);
}

async function createHomeownerProject(port, suffix) {
  const registered = await request(port, 'POST', '/api/auth/register', {
    email: `stripe-owner-${suffix}@gcsc.store`,
    password: 'StrongPass123',
    role: 'owner',
    fullName: 'Stripe Smoke Owner',
  });
  assert.strictEqual(registered.status, 201);

  const project = await request(port, 'POST', '/api/projects', {
    title: 'Stripe readiness smoke project',
    description: 'Test-mode escrow funding readiness only',
    category: 'remodel',
    budget_min: 1000,
    budget_max: 5000,
    location: 'Seattle',
    timeline_days: 14,
  }, registered.data.token);
  assert.strictEqual(project.status, 201);
  return { user: registered.data.user, token: registered.data.token, project: project.data.project };
}

(async () => {
  let child;
  try {
    const missingKeyPort = 14100 + Math.floor(Math.random() * 500);
    child = startServer(missingKeyPort);
    await waitForServer(missingKeyPort, child);
    const missingKeyFixture = await createHomeownerProject(missingKeyPort, `missing-${Date.now()}`);
    const missingKeyPayment = await request(missingKeyPort, 'POST', '/api/stripe/create-payment-intent', {
      project_id: missingKeyFixture.project.id,
      amount_usd: 5000,
    }, missingKeyFixture.token);
    assert.strictEqual(missingKeyPayment.status, 503);
    assert.match(missingKeyPayment.data.error, /payment service unavailable/i);
    await stopServer(child);

    const webhookSecret = 'whsec_' + 'local_smoke_secret';
    const configuredPort = 14600 + Math.floor(Math.random() * 500);
    child = startServer(configuredPort, {
      STRIPE_SECRET_KEY: 'sk_' + 'test_local_smoke',
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      NODE_OPTIONS: `--require ${registerPath}`,
    });
    await waitForServer(configuredPort, child);
    const configuredFixture = await createHomeownerProject(configuredPort, `configured-${Date.now()}`);
    const createdPayment = await request(configuredPort, 'POST', '/api/stripe/create-payment-intent', {
      project_id: configuredFixture.project.id,
      amount_usd: 5000,
    }, configuredFixture.token);
    assert.strictEqual(createdPayment.status, 200);
    assert.strictEqual(createdPayment.data.payment_intent_id, 'pi_test_local_1');
    assert.strictEqual(createdPayment.data.client_secret, 'pi_test_local_1_secret_local');
    assert.strictEqual(createdPayment.data.mode, 'test');

    const eventPayload = JSON.stringify({
      id: 'evt_test_local_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_local_1',
          metadata: {
            gcsc_project_id: String(configuredFixture.project.id),
            gcsc_user_id: String(configuredFixture.user.id),
          },
        },
      },
    });
    const invalidWebhook = await request(configuredPort, 'POST', '/api/stripe/webhook', eventPayload, null, {
      'Content-Type': 'application/json',
      'Stripe-Signature': 't=1,v1=bad',
    });
    assert.strictEqual(invalidWebhook.status, 400);
    assert.match(invalidWebhook.data.error, /invalid signature/i);

    const validWebhook = await request(configuredPort, 'POST', '/api/stripe/webhook', eventPayload, null, {
      'Content-Type': 'application/json',
      'Stripe-Signature': signStripePayload(eventPayload, webhookSecret),
    });
    assert.strictEqual(validWebhook.status, 200);
    assert.strictEqual(validWebhook.data.received, true);

    console.log('stripe readiness smoke test passed');
  } finally {
    await stopServer(child);
    fs.rmSync(jsonDbPath, { force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
