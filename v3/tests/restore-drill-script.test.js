const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const v3Root = path.resolve(__dirname, '..');
const backupsDir = path.join(repoRoot, 'backups');
const pkg = JSON.parse(fs.readFileSync(path.join(v3Root, 'package.json'), 'utf8'));
const scriptPath = path.join(v3Root, 'scripts', 'restore-postgres-drill.mjs');

assert.strictEqual(
  pkg.scripts['db:restore:drill'],
  'node scripts/restore-postgres-drill.mjs',
  'package.json must expose db:restore:drill'
);
assert.strictEqual(
  pkg.scripts['test:restore-drill-script'],
  'node tests/restore-drill-script.test.js',
  'package.json must expose test:restore-drill-script'
);

assert.ok(fs.existsSync(scriptPath), 'restore-postgres-drill.mjs must exist');

const source = fs.readFileSync(scriptPath, 'utf8');
for (const required of [
  'RESTORE_DATABASE_URL',
  'BACKUP_FILE',
  'RESTORE_DRY_RUN',
  'pg_restore',
  '--clean',
  '--if-exists',
  '--no-owner',
  '--no-privileges',
  'backups',
  'secret-safe',
]) {
  assert.ok(source.includes(required), `restore script must include ${required}`);
}

const missing = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {},
  encoding: 'utf8',
});

assert.notStrictEqual(missing.status, 0, 'restore drill must fail without required env vars');
assert.match(`${missing.stdout}\n${missing.stderr}`, /RESTORE_DATABASE_URL/i, 'missing restore URL error must be explicit');
assert.match(`${missing.stdout}\n${missing.stderr}`, /BACKUP_FILE/i, 'missing backup file error must be explicit');

const outsidePath = path.join(repoRoot, 'not-a-backup.dump');
const outside = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    RESTORE_DATABASE_URL: 'postgresql://user:SecretPassword@example.com:5432/restore',
    BACKUP_FILE: outsidePath,
    RESTORE_DRY_RUN: '1',
  },
  encoding: 'utf8',
});

const outsideOutput = `${outside.stdout}\n${outside.stderr}`;
assert.notStrictEqual(outside.status, 0, 'restore drill must refuse backup files outside backups/');
assert.match(outsideOutput, /backups/i, 'outside-path error must mention backups directory');
assert.doesNotMatch(outsideOutput, /SecretPassword/, 'restore drill must not print database password');
assert.doesNotMatch(outsideOutput, /postgresql:\/\/user/i, 'restore drill must not print database URL');

fs.mkdirSync(backupsDir, { recursive: true });
const backupPath = path.join(backupsDir, 'restore-drill-test.dump');
fs.writeFileSync(backupPath, 'not-a-real-backup-but-non-empty');

try {
  const dryRun = spawnSync(process.execPath, [scriptPath], {
    cwd: v3Root,
    env: {
      RESTORE_DATABASE_URL: 'postgresql://user:SecretPassword@example.com:5432/restore',
      BACKUP_FILE: backupPath,
      RESTORE_DRY_RUN: '1',
    },
    encoding: 'utf8',
  });

  const dryRunOutput = `${dryRun.stdout}\n${dryRun.stderr}`;
  assert.strictEqual(dryRun.status, 0, 'restore drill dry run must pass with required inputs');
  assert.match(dryRunOutput, /dry run ready/i, 'dry-run output must be explicit');
  assert.match(dryRunOutput, /RESTORE_DATABASE_URL: set/i, 'dry-run output must show restore URL is set without printing it');
  assert.doesNotMatch(dryRunOutput, /SecretPassword/, 'dry-run output must not print database password');
  assert.doesNotMatch(dryRunOutput, /postgresql:\/\/user/i, 'dry-run output must not print database URL');
} finally {
  fs.rmSync(backupPath, { force: true });
}

console.log('restore drill script validation passed');
