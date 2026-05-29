const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const v3Root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(v3Root, 'package.json'), 'utf8'));
const scriptPath = path.join(v3Root, 'scripts', 'check-admin-bootstrap-env.mjs');

assert.strictEqual(
  pkg.scripts['admin:bootstrap:check'],
  'node scripts/check-admin-bootstrap-env.mjs',
  'package.json must expose admin:bootstrap:check'
);
assert.strictEqual(
  pkg.scripts['test:admin-bootstrap-check-script'],
  'node tests/admin-bootstrap-check-script.test.js',
  'package.json must expose test:admin-bootstrap-check-script'
);

assert.ok(fs.existsSync(scriptPath), 'check-admin-bootstrap-env.mjs must exist');

const source = fs.readFileSync(scriptPath, 'utf8');
for (const required of [
  'ADMIN_BOOTSTRAP_ENABLED',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'ADMIN_FULL_NAME',
  'DATABASE_URL',
  'JWT_SECRET',
  'CORS_ALLOWED_ORIGINS',
  'secret-safe',
  'missing',
  'ready',
]) {
  assert.ok(source.includes(required), `bootstrap check script must include ${required}`);
}

const missing = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {},
  encoding: 'utf8',
});

assert.notStrictEqual(missing.status, 0, 'bootstrap check must fail when required env vars are missing');
assert.match(`${missing.stdout}\n${missing.stderr}`, /missing/i, 'missing-env output must be explicit');

const secretPassword = 'DoNotPrintThisPassword123!';
const secretJwt = 'DoNotPrintThisJwtSecret1234567890';
const secretDb = 'postgresql://user:pass@example.com:5432/db';
const ready = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    ADMIN_BOOTSTRAP_ENABLED: 'true',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: secretPassword,
    ADMIN_FULL_NAME: 'GCSC Admin',
    DATABASE_URL: secretDb,
    JWT_SECRET: secretJwt,
    CORS_ALLOWED_ORIGINS: 'https://gcsc.store,https://www.gcsc.store',
  },
  encoding: 'utf8',
});

const readyOutput = `${ready.stdout}\n${ready.stderr}`;
assert.strictEqual(ready.status, 0, 'bootstrap check must pass with required env vars');
assert.match(readyOutput, /ready/i, 'ready output must be explicit');
assert.doesNotMatch(readyOutput, new RegExp(secretPassword), 'bootstrap check must not print admin password');
assert.doesNotMatch(readyOutput, new RegExp(secretJwt), 'bootstrap check must not print JWT secret');
assert.doesNotMatch(readyOutput, /postgresql:\/\/user:pass/i, 'bootstrap check must not print database URL');

console.log('admin bootstrap env check script validation passed');
