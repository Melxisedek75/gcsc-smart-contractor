const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const v3Root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(v3Root, 'package.json'), 'utf8'));
const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
const scriptPath = path.join(v3Root, 'scripts', 'production-status-report.mjs');

assert.strictEqual(
  pkg.scripts['ops:status'],
  'node scripts/production-status-report.mjs',
  'package.json must expose ops:status'
);
assert.strictEqual(
  pkg.scripts['test:ops-status-report-script'],
  'node tests/ops-status-report-script.test.js',
  'package.json must expose test:ops-status-report-script'
);

assert.ok(gitignore.includes('evidence/'), '.gitignore must ignore local evidence artifacts');
assert.ok(fs.existsSync(scriptPath), 'production-status-report.mjs must exist');

const source = fs.readFileSync(scriptPath, 'utf8');
for (const required of [
  'https://gcsc-backend-production.up.railway.app',
  'https://gcsc.store',
  'https://gcsc-store-production.up.railway.app',
  '/health',
  '/api/admin/audit-events?limit=1',
  'requiredSecurityHeaders',
  'backend security headers',
  'repository production guardrails',
  'checkRepositoryGuardrails',
  'check-security-env.mjs',
  'restore-postgres-drill.mjs',
  'production-gates-summary.mjs',
  'backend-production-checks.yml',
  'test:security-env-check-script',
  'test:restore-drill-script',
  'test:production-gates-summary-script',
  'db:restore:drill',
  'ops:gates',
  '${{ secrets.',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Strict-Transport-Security',
  'Content-Security-Policy',
  'Permissions-Policy',
  'requiredFrontendBundleMarkers',
  'Milestone Released',
  'Chain Tx Failed',
  'Payment intent created',
  'project.created',
  'evidence',
  'production-status-',
  'productionGates',
  'admin-account',
  'live-trust-workflow',
  'postgres-restore-drill',
  'xpr-webauth-settlement',
  'stripe-readiness',
  'critical',
  'warnings',
  'blocked',
]) {
  assert.ok(source.includes(required), `production status report script must include ${required}`);
}

const result = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    ...process.env,
    STATUS_EVIDENCE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'gcsc-status-test-')),
    BACKEND_URL: 'http://127.0.0.1:9',
    MAIN_SITE_URL: 'http://127.0.0.1:9',
    RAILWAY_FRONTEND_URL: 'http://127.0.0.1:9',
  },
  encoding: 'utf8',
});

assert.notStrictEqual(result.status, 0, 'ops status report must fail when all monitored services are unreachable');
assert.match(`${result.stdout}\n${result.stderr}`, /critical/i, 'ops status report must label critical failures');
assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Bearer\s+[A-Za-z0-9._-]+/, 'script must not print bearer tokens');

const evidenceDirMatch = result.stdout.match(/production status report: (.+production-status-[^\r\n]+\.json)/);
assert.ok(evidenceDirMatch, 'ops status report must print the generated evidence path');
const generatedReport = JSON.parse(fs.readFileSync(evidenceDirMatch[1], 'utf8'));
assert.ok(Array.isArray(generatedReport.productionGates), 'ops status report must include productionGates array');
assert.ok(generatedReport.productionGates.length >= 10, 'ops status report must track all major production gates');

for (const gateId of [
  'admin-account',
  'live-trust-workflow',
  'audit-log',
  'postgres-restore-drill',
  'monitoring-alerts',
  'xpr-webauth-settlement',
  'smart-contract-permissions',
  'stripe-readiness',
  'security-review',
  'legal-review',
  'founder-approval',
]) {
  const gate = generatedReport.productionGates.find((item) => item.id === gateId);
  assert.ok(gate, `production gate ${gateId} must be present`);
  assert.ok(gate.status, `production gate ${gateId} must have a status`);
  assert.ok(gate.blocker, `production gate ${gateId} must have an explicit blocker or completion note`);
}

console.log('ops status report script validation passed');
