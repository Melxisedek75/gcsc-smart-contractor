const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const v3Root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(v3Root, 'package.json'), 'utf8'));
const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
const scriptPath = path.join(v3Root, 'scripts', 'export-admin-audit.mjs');

assert.strictEqual(
  pkg.scripts['audit:export'],
  'node scripts/export-admin-audit.mjs',
  'package.json must expose audit:export'
);
assert.strictEqual(
  pkg.scripts['test:admin-audit-export-script'],
  'node tests/admin-audit-export-script.test.js',
  'package.json must expose test:admin-audit-export-script'
);

assert.ok(gitignore.includes('evidence/'), '.gitignore must ignore local evidence artifacts');
assert.ok(fs.existsSync(scriptPath), 'export-admin-audit.mjs must exist');

const source = fs.readFileSync(scriptPath, 'utf8');
for (const required of [
  'process.env.ADMIN_JWT',
  '/api/admin/audit-events',
  'Authorization',
  'Bearer',
  'evidence',
  'audit-events-',
  'ADMIN_JWT is required',
]) {
  assert.ok(source.includes(required), `audit export script must include ${required}`);
}

const result = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    ...process.env,
    ADMIN_JWT: '',
    BACKEND_URL: 'https://example.invalid',
  },
  encoding: 'utf8',
});

assert.notStrictEqual(result.status, 0, 'audit export script must fail without ADMIN_JWT');
assert.match(`${result.stdout}\n${result.stderr}`, /ADMIN_JWT is required/i, 'missing ADMIN_JWT error must be explicit');
assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Bearer\s+[A-Za-z0-9._-]+/, 'script must not print bearer tokens');

console.log('admin audit export script validation passed');
