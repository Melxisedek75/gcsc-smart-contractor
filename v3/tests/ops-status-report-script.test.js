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
  'scan-production-evidence.mjs',
  'DAILY-STATUS-RUNBOOK.md',
  'backend-production-checks.yml',
  'test:security-env-check-script',
  'test:restore-drill-script',
  'test:production-gates-summary-script',
  'test:daily-status-runbook',
  'test:production-evidence-scan-script',
  'ops:evidence:scan',
  'db:restore:drill',
  'ops:gates',
  'actions/upload-artifact@v4',
  'production-status-evidence',
  'evidence/production-status-*.json',
  'evidence/production-gates-*.md',
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
  'GITHUB_ACTIONS_STATUS_FIXTURE',
  'github actions scheduled smoke',
  'account is locked due to a billing issue',
  'github-actions-account-lock',
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

const githubFixturePath = path.join(os.tmpdir(), `gcsc-github-actions-lock-${Date.now()}.json`);
fs.writeFileSync(githubFixturePath, JSON.stringify({
  workflow_runs: [
    {
      id: 26675045787,
      name: 'Backend Production Checks',
      head_sha: '004bc8081b618cd6c5e9a99c673427942104e6ec',
      status: 'completed',
      conclusion: 'failure',
      event: 'push',
      created_at: '2026-05-30T04:55:22Z',
      html_url: 'https://github.com/Melxisedek75/gcsc-smart-contractor/actions/runs/26675045787',
    },
  ],
  jobs: [
    {
      name: 'backend-checks',
      conclusion: 'failure',
      annotations: [
        'The job was not started because your account is locked due to a billing issue.',
      ],
    },
  ],
}, null, 2));

const githubLock = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    ...process.env,
    STATUS_EVIDENCE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'gcsc-status-github-lock-')),
    BACKEND_URL: 'http://127.0.0.1:9',
    MAIN_SITE_URL: 'http://127.0.0.1:9',
    RAILWAY_FRONTEND_URL: 'http://127.0.0.1:9',
    GITHUB_ACTIONS_STATUS_FIXTURE: githubFixturePath,
  },
  encoding: 'utf8',
});

assert.notStrictEqual(githubLock.status, 0, 'fixture run still fails because monitored services are unreachable');
const githubLockReportPath = githubLock.stdout.match(/production status report: (.+production-status-[^\r\n]+\.json)/);
assert.ok(githubLockReportPath, 'fixture run must print generated evidence path');
const githubLockReport = JSON.parse(fs.readFileSync(githubLockReportPath[1], 'utf8'));
const githubCheck = githubLockReport.checks.find((check) => check.label === 'github actions scheduled smoke');
assert.ok(githubCheck, 'ops status report must include github actions scheduled smoke check');
assert.strictEqual(githubCheck.severity, 'warning', 'github actions account blocker must be warning severity');
assert.strictEqual(githubCheck.status, 'fail', 'github actions account lock must fail the scheduled smoke check');
assert.match(githubCheck.observed, /billing issue/i, 'github actions check must report the billing issue');
assert.ok(
  githubLockReport.summary.warnings.includes('github actions scheduled smoke'),
  'github actions account lock must appear in warnings'
);
assert.ok(
  githubLockReport.summary.blocked.some((item) => item.includes('github-actions-account-lock')),
  'github actions account lock must appear in blocked items'
);

console.log('ops status report script validation passed');
