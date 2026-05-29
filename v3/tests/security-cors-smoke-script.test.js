const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const v3Root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(v3Root, 'package.json'), 'utf8'));
const scriptPath = path.join(v3Root, 'scripts', 'security-cors-smoke.mjs');

assert.strictEqual(
  pkg.scripts['security:cors:smoke'],
  'node scripts/security-cors-smoke.mjs',
  'package.json must expose security:cors:smoke'
);
assert.strictEqual(
  pkg.scripts['test:security-cors-smoke-script'],
  'node tests/security-cors-smoke-script.test.js',
  'package.json must expose test:security-cors-smoke-script'
);

assert.ok(fs.existsSync(scriptPath), 'security-cors-smoke.mjs must exist');

const source = fs.readFileSync(scriptPath, 'utf8');
for (const required of [
  'https://gcsc-backend-production.up.railway.app',
  'https://gcsc.store',
  'https://evil.example',
  '/health',
  '/api/admin/audit-events?limit=1',
  'Access-Control-Allow-Origin',
  'Origin',
  'Origin not allowed',
  'HTTP 401',
  'security CORS smoke passed',
]) {
  assert.ok(source.includes(required), `security CORS smoke script must include ${required}`);
}

const result = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    ...process.env,
    BACKEND_URL: 'http://127.0.0.1:9',
  },
  encoding: 'utf8',
});

assert.notStrictEqual(result.status, 0, 'security CORS smoke must fail when backend is unreachable');
assert.match(`${result.stdout}\n${result.stderr}`, /failed|fetch/i, 'unreachable backend output must be explicit');
assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Bearer\s+[A-Za-z0-9._-]+/, 'script must not print bearer tokens');

console.log('security CORS smoke script validation passed');
