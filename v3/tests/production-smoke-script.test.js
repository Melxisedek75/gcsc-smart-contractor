const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scriptPath = path.join(root, 'scripts', 'production-smoke.mjs');

assert.strictEqual(
  pkg.scripts['smoke:production'],
  'node scripts/production-smoke.mjs',
  'package.json must expose smoke:production'
);

const source = fs.readFileSync(scriptPath, 'utf8');

for (const required of [
  'https://gcsc-backend-production.up.railway.app',
  'https://gcsc.store',
  'https://gcsc-store-production.up.railway.app',
  '/health',
  '/api/admin/audit-events?limit=1',
  'status === 401',
  'database',
]) {
  assert.ok(source.includes(required), `production smoke script must include ${required}`);
}

console.log('production smoke script validation passed');
