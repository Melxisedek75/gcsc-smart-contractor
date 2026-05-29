const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const v3Root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(v3Root, 'package.json'), 'utf8'));
const scriptPath = path.join(v3Root, 'scripts', 'check-security-env.mjs');

assert.strictEqual(
  pkg.scripts['security:env:check'],
  'node scripts/check-security-env.mjs',
  'package.json must expose security:env:check'
);
assert.strictEqual(
  pkg.scripts['test:security-env-check-script'],
  'node tests/security-env-check-script.test.js',
  'package.json must expose test:security-env-check-script'
);

assert.ok(fs.existsSync(scriptPath), 'check-security-env.mjs must exist');

const source = fs.readFileSync(scriptPath, 'utf8');
for (const required of [
  'NODE_ENV',
  'JWT_SECRET',
  'DATABASE_URL',
  'FRONTEND_URL',
  'CORS_ALLOWED_ORIGINS',
  'RATE_LIMITS_DISABLED',
  'ADMIN_BOOTSTRAP_ENABLED',
  'secret-safe',
  'security env check passed',
]) {
  assert.ok(source.includes(required), `security env check script must include ${required}`);
}

const missing = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {},
  encoding: 'utf8',
});

assert.notStrictEqual(missing.status, 0, 'security env check must fail when critical env vars are missing');
assert.match(`${missing.stdout}\n${missing.stderr}`, /JWT_SECRET/i, 'missing-env output must mention JWT_SECRET by name');

const weakSecret = 'DoNotPrintWeakJwtSecret123';
const unsafe = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    NODE_ENV: 'production',
    JWT_SECRET: weakSecret,
    DATABASE_URL: 'postgresql://user:pass@example.com:5432/gcsc',
    FRONTEND_URL: 'http://localhost:5173',
    CORS_ALLOWED_ORIGINS: '*,http://localhost:5173',
    RATE_LIMITS_DISABLED: 'true',
    ADMIN_BOOTSTRAP_ENABLED: 'false',
  },
  encoding: 'utf8',
});

const unsafeOutput = `${unsafe.stdout}\n${unsafe.stderr}`;
assert.notStrictEqual(unsafe.status, 0, 'security env check must fail with unsafe production settings');
assert.match(unsafeOutput, /CORS_ALLOWED_ORIGINS/i, 'unsafe output must identify CORS problem by variable name');
assert.match(unsafeOutput, /RATE_LIMITS_DISABLED/i, 'unsafe output must identify disabled rate limits by variable name');
assert.doesNotMatch(unsafeOutput, new RegExp(weakSecret), 'security env check must not print JWT secret');

const missingBootstrap = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(64),
    DATABASE_URL: 'postgresql://user:pass@example.com:5432/gcsc',
    FRONTEND_URL: 'https://gcsc.store',
    CORS_ALLOWED_ORIGINS: 'https://gcsc.store,https://www.gcsc.store',
    RATE_LIMITS_DISABLED: 'false',
    ADMIN_BOOTSTRAP_ENABLED: 'true',
    ADMIN_EMAIL: 'admin@example.com',
  },
  encoding: 'utf8',
});

assert.notStrictEqual(missingBootstrap.status, 0, 'bootstrap-enabled check must fail without password/full name');
assert.match(
  `${missingBootstrap.stdout}\n${missingBootstrap.stderr}`,
  /ADMIN_PASSWORD/i,
  'bootstrap failure must identify missing admin password by variable name only'
);

const secretPassword = 'DoNotPrintThisPassword123!';
const safe = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    NODE_ENV: 'production',
    JWT_SECRET: 'b'.repeat(64),
    DATABASE_URL: 'postgresql://user:pass@example.com:5432/gcsc',
    FRONTEND_URL: 'https://gcsc.store',
    CORS_ALLOWED_ORIGINS: 'https://gcsc.store,https://www.gcsc.store',
    RATE_LIMITS_DISABLED: 'false',
    ADMIN_BOOTSTRAP_ENABLED: 'true',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: secretPassword,
    ADMIN_FULL_NAME: 'GCSC Admin',
  },
  encoding: 'utf8',
});

const safeOutput = `${safe.stdout}\n${safe.stderr}`;
assert.strictEqual(safe.status, 0, 'security env check must pass with safe production settings');
assert.match(safeOutput, /security env check passed/i, 'safe output must be explicit');
assert.doesNotMatch(safeOutput, /bbbbbbbbbbbb/i, 'security env check must not print JWT secret fragments');
assert.doesNotMatch(safeOutput, new RegExp(secretPassword), 'security env check must not print admin password');

console.log('security env check script validation passed');
