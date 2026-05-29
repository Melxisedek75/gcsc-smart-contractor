const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const v3Root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(v3Root, 'package.json'), 'utf8'));
const scriptPath = path.join(v3Root, 'scripts', 'check-migration-readiness.mjs');

const expectedOrder = [
  'database/schema.sql',
  'v3/database/schema_v3_migration.sql',
  'v3/database/persistent-storage-migration.sql',
  'v3/database/stripe-payments-migration.sql',
  'v3/database/escrow-audit-migration.sql',
  'v3/database/bid-audit-migration.sql',
];

assert.strictEqual(
  pkg.scripts['db:migrations:check'],
  'node scripts/check-migration-readiness.mjs',
  'package.json must expose db:migrations:check'
);
assert.strictEqual(
  pkg.scripts['test:migration-readiness-script'],
  'node tests/migration-readiness-script.test.js',
  'package.json must expose test:migration-readiness-script'
);

assert.ok(fs.existsSync(scriptPath), 'check-migration-readiness.mjs must exist');

const source = fs.readFileSync(scriptPath, 'utf8');
for (const required of [
  ...expectedOrder,
  'database/migrations/001-add-contractor-verifications.sql',
  'document_image_url',
  'verification_token',
  'migration readiness ready',
  'do not run',
]) {
  assert.ok(source.includes(required), `migration readiness script must include ${required}`);
}

const result = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  encoding: 'utf8',
});

const output = `${result.stdout}\n${result.stderr}`;
assert.strictEqual(result.status, 0, 'migration readiness check must pass with current repo files');
assert.match(output, /migration readiness ready/i, 'ready output must be explicit');
for (const file of expectedOrder) {
  assert.match(output, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `output must include ${file}`);
}
assert.doesNotMatch(output, /postgresql:\/\/|PASSWORD=|DATABASE_URL=/i, 'migration readiness output must not print connection strings or passwords');

console.log('migration readiness script validation passed');
