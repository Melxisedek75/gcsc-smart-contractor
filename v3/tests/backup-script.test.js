const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const v3Root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(v3Root, 'package.json'), 'utf8'));
const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
const scriptPath = path.join(v3Root, 'scripts', 'backup-postgres.mjs');

assert.strictEqual(pkg.scripts['db:backup'], 'node scripts/backup-postgres.mjs', 'package.json must expose db:backup');
assert.ok(gitignore.includes('backups/'), '.gitignore must ignore local backup artifacts');

const source = fs.readFileSync(scriptPath, 'utf8');
for (const required of [
  'process.env.DATABASE_URL',
  'pg_dump',
  '--format=custom',
  'backups',
  'gcsc-backup-',
]) {
  assert.ok(source.includes(required), `backup script must include ${required}`);
}

const result = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: { ...process.env, DATABASE_URL: '' },
  encoding: 'utf8',
});

assert.notStrictEqual(result.status, 0, 'backup script must fail without DATABASE_URL');
assert.match(`${result.stdout}\n${result.stderr}`, /DATABASE_URL/i, 'missing DATABASE_URL error must be explicit');

console.log('backup script validation passed');
