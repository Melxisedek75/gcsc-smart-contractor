import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const backupsDir = path.join(repoRoot, 'backups');
const restoreDatabaseUrl = process.env.RESTORE_DATABASE_URL;
const backupFile = process.env.BACKUP_FILE;
const dryRun = process.env.RESTORE_DRY_RUN === '1' || process.env.RESTORE_DRY_RUN === 'true';

function sanitize(message) {
  let output = String(message || '');

  if (restoreDatabaseUrl) {
    output = output.split(restoreDatabaseUrl).join('[RESTORE_DATABASE_URL]');

    try {
      const parsed = new URL(restoreDatabaseUrl);
      if (parsed.password) {
        output = output.split(parsed.password).join('[password]');
      }
      if (parsed.username) {
        output = output.split(parsed.username).join('[user]');
      }
    } catch {
      // If the value is malformed, exact replacement above still prevents full URL disclosure.
    }
  }

  return output;
}

function fail(message) {
  console.error(sanitize(message));
  process.exit(1);
}

function resolveBackupPath(input) {
  const resolved = path.resolve(repoRoot, input);
  const normalizedResolved = resolved.toLowerCase();
  const normalizedBackups = path.resolve(backupsDir).toLowerCase();

  if (normalizedResolved !== normalizedBackups && !normalizedResolved.startsWith(`${normalizedBackups}${path.sep}`)) {
    fail('BACKUP_FILE must point to a file inside the ignored backups/ directory.');
  }

  return resolved;
}

console.log('PostgreSQL restore drill check (secret-safe)');

const missing = [];
if (!restoreDatabaseUrl || !restoreDatabaseUrl.trim()) {
  missing.push('RESTORE_DATABASE_URL');
}
if (!backupFile || !backupFile.trim()) {
  missing.push('BACKUP_FILE');
}

if (missing.length > 0) {
  fail(`Missing required variables: ${missing.join(', ')}`);
}

const backupPath = resolveBackupPath(backupFile);

if (!fs.existsSync(backupPath)) {
  fail(`BACKUP_FILE does not exist under backups/: ${path.relative(repoRoot, backupPath)}`);
}

const stats = fs.statSync(backupPath);
if (!stats.isFile()) {
  fail('BACKUP_FILE must be a file.');
}
if (stats.size <= 0) {
  fail('BACKUP_FILE must be non-empty.');
}

console.log('RESTORE_DATABASE_URL: set');
console.log(`BACKUP_FILE: ${path.relative(repoRoot, backupPath)}`);
console.log(`Backup size: ${stats.size} bytes`);

const args = [
  '--dbname',
  restoreDatabaseUrl,
  '--clean',
  '--if-exists',
  '--no-owner',
  '--no-privileges',
  '--verbose',
  backupPath,
];

if (dryRun) {
  console.log('Restore drill dry run ready. Set RESTORE_DRY_RUN=0 or remove it to run pg_restore against the non-production target.');
  process.exit(0);
}

const child = spawn('pg_restore', args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
});

child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

child.on('error', (error) => {
  if (error.code === 'ENOENT') {
    fail('pg_restore was not found. Install PostgreSQL client tools before running db:restore:drill.');
  }
  fail(`pg_restore failed to start: ${error.message}`);
});

child.on('close', (code) => {
  const cleanStdout = sanitize(stdout.trim());
  const cleanStderr = sanitize(stderr.trim());

  if (cleanStdout) {
    console.log(cleanStdout);
  }

  if (code !== 0) {
    const detail = cleanStderr || `pg_restore exited with code ${code}`;
    fail(`PostgreSQL restore drill failed: ${detail}`);
  }

  if (cleanStderr) {
    console.warn(cleanStderr);
  }

  console.log('PostgreSQL restore drill completed against non-production target.');
});
