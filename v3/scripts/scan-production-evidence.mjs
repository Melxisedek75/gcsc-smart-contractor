import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const evidenceDir = process.env.STATUS_EVIDENCE_DIR
  ? path.resolve(repoRoot, process.env.STATUS_EVIDENCE_DIR)
  : path.join(repoRoot, 'evidence');

const secretPatterns = [
  { name: 'GitHub token', pattern: /ghp_[A-Za-z0-9_]+/ },
  { name: 'Railway token', pattern: /RAILWAY_TOKEN\s*[:=]\s*[^\s,"']+/i },
  { name: 'Stripe live secret key', pattern: /sk_live_[A-Za-z0-9]+/ },
  { name: 'Stripe test secret key', pattern: /sk_test_[A-Za-z0-9]+/ },
  { name: 'Stripe webhook secret', pattern: /whsec_[A-Za-z0-9]+/ },
  { name: 'PostgreSQL URL', pattern: /postgres(?:ql)?:\/\/[^\s)"']+/i },
  { name: 'Bearer token', pattern: /Bearer\s+[A-Za-z0-9._-]+/ },
  { name: 'private key marker', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function evidenceFiles() {
  if (!fs.existsSync(evidenceDir)) {
    return [];
  }

  return fs.readdirSync(evidenceDir)
    .filter((name) => /^production-status-.+\.json$/.test(name) || /^production-gates-.+\.md$/.test(name))
    .map((name) => path.join(evidenceDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile());
}

console.log('production evidence secret scan');

const files = evidenceFiles();
if (files.length === 0) {
  fail(`No production evidence files found in ${evidenceDir}. Run npm --prefix v3 run ops:status and npm --prefix v3 run ops:gates first.`);
}

const findings = [];
for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(content)) {
      findings.push(`${path.relative(repoRoot, filePath)} contains secret pattern: ${name}`);
    }
  }
}

if (findings.length > 0) {
  fail(`Production evidence secret scan failed:\n${findings.join('\n')}`);
}

console.log(`production evidence secret scan passed: ${files.length} files checked`);
