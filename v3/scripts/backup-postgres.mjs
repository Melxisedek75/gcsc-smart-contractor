import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const backupsDir = path.join(repoRoot, 'backups');
const databaseUrl = process.env.DATABASE_URL;

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!databaseUrl || !databaseUrl.trim()) {
  fail('DATABASE_URL is required to create a PostgreSQL backup.');
}

fs.mkdirSync(backupsDir, { recursive: true });

const backupPath = path.join(backupsDir, `gcsc-backup-${timestamp()}.dump`);
const args = [
  '--format=custom',
  '--no-owner',
  '--no-privileges',
  '--file',
  backupPath,
  databaseUrl,
];

const child = spawn('pg_dump', args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
});

child.on('error', (error) => {
  if (error.code === 'ENOENT') {
    fail('pg_dump was not found. Install PostgreSQL client tools before running db:backup.');
  }
  fail(`pg_dump failed to start: ${error.message}`);
});

child.on('close', (code) => {
  if (code !== 0) {
    const cleanError = stderr.trim() || `pg_dump exited with code ${code}`;
    fail(`PostgreSQL backup failed: ${cleanError}`);
  }

  const stats = fs.statSync(backupPath);
  if (stats.size <= 0) {
    fail(`PostgreSQL backup failed: ${backupPath} is empty.`);
  }

  console.log(`Backup created: ${backupPath}`);
  console.log(`Backup size: ${stats.size} bytes`);
});
