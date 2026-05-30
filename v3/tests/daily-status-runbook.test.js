const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const v3Root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(v3Root, 'package.json'), 'utf8'));
const runbookPath = path.join(repoRoot, 'DAILY-STATUS-RUNBOOK.md');

assert.strictEqual(
  pkg.scripts['test:daily-status-runbook'],
  'node tests/daily-status-runbook.test.js',
  'package.json must expose test:daily-status-runbook'
);

assert.ok(fs.existsSync(runbookPath), 'DAILY-STATUS-RUNBOOK.md must exist');

const doc = fs.readFileSync(runbookPath, 'utf8');
for (const required of [
  '# Daily Status Runbook',
  'Backend Production Checks',
  'production-status-evidence',
  'production-gates-',
  'production-status-',
  'Critical failures',
  'Warnings',
  'Next Actions',
  'Blocked Items',
  'Blocked gates',
  'admin-account',
  'postgres-restore-drill',
  'xpr-webauth-settlement',
  'stripe-readiness',
  'founder-approval',
  'Do not paste secrets',
  'No real money',
  'Next action',
]) {
  assert.ok(doc.includes(required), `daily status runbook must include ${required}`);
}

assert.doesNotMatch(doc, /ghp_[A-Za-z0-9]+/, 'daily status runbook must not include GitHub tokens');
assert.doesNotMatch(doc, /sk_live_[A-Za-z0-9]+/, 'daily status runbook must not include live Stripe keys');
assert.doesNotMatch(doc, /postgres(?:ql)?:\/\/[^\\s)]+/i, 'daily status runbook must not include database URLs');

console.log('daily status runbook validation passed');
