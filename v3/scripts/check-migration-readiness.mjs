import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const expectedOrder = [
  'database/schema.sql',
  'v3/database/schema_v3_migration.sql',
  'v3/database/persistent-storage-migration.sql',
  'v3/database/stripe-payments-migration.sql',
  'v3/database/escrow-audit-migration.sql',
  'v3/database/bid-audit-migration.sql',
];

const incompatibleMigration = 'database/migrations/001-add-contractor-verifications.sql';
const requiredPersistentColumns = ['document_image_url', 'verification_token'];
const errors = [];

function readRelative(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8');
}

console.log('GCSC migration readiness check');
console.log('Expected production migration order:');

for (const [index, file] of expectedOrder.entries()) {
  const fullPath = path.join(repoRoot, file);
  const exists = fs.existsSync(fullPath);
  console.log(`${index + 1}. ${file}: ${exists ? 'present' : 'missing'}`);
  if (!exists) errors.push(`missing required migration file: ${file}`);
}

const persistentFile = 'v3/database/persistent-storage-migration.sql';
if (fs.existsSync(path.join(repoRoot, persistentFile))) {
  const persistentSql = readRelative(persistentFile);
  for (const column of requiredPersistentColumns) {
    if (!persistentSql.includes(column)) {
      errors.push(`${persistentFile} must include ${column}`);
    }
  }
}

if (fs.existsSync(path.join(repoRoot, incompatibleMigration))) {
  console.log(`warning: ${incompatibleMigration} exists for older route assumptions; do not run it for v3 production without manual column comparison.`);
} else {
  console.log(`warning: ${incompatibleMigration} not present; no incompatible legacy migration detected.`);
}

if (errors.length > 0) {
  console.error('migration readiness failed');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('migration readiness ready');
