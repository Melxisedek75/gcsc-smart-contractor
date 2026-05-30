const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const v3Root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(v3Root, 'package.json'), 'utf8'));
const scriptPath = path.join(v3Root, 'scripts', 'production-gates-summary.mjs');

assert.strictEqual(
  pkg.scripts['ops:gates'],
  'node scripts/production-gates-summary.mjs',
  'package.json must expose ops:gates'
);
assert.strictEqual(
  pkg.scripts['test:production-gates-summary-script'],
  'node tests/production-gates-summary-script.test.js',
  'package.json must expose test:production-gates-summary-script'
);

assert.ok(fs.existsSync(scriptPath), 'production-gates-summary.mjs must exist');

const source = fs.readFileSync(scriptPath, 'utf8');
for (const required of [
  'STATUS_EVIDENCE_DIR',
  'productionGates',
  'production-gates-',
  'Production Gate Summary',
  'No secrets',
  'admin-account',
  'stripe-readiness',
  'founder-approval',
]) {
  assert.ok(source.includes(required), `production gates summary script must include ${required}`);
}

const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcsc-gates-test-'));
const reportPath = path.join(evidenceDir, 'production-status-2026-05-30T00-00-00-000Z.json');
fs.writeFileSync(reportPath, JSON.stringify({
  generatedAt: '2026-05-30T00:00:00.000Z',
  productionGates: [
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
  ].map((id) => ({
    id,
    label: id === 'security-review' ? 'Production security review' : `Gate ${id}`,
    status: id === 'security-review' ? 'partial' : 'blocked',
    blocker: id === 'admin-account' ? 'Founder must create first admin.' : `Blocker for ${id}.`,
  })),
  summary: {
    critical: [],
    warnings: ['railway frontend freshness'],
    blocked: [
      'admin-account: Founder must create first admin.',
      'github-actions-account-lock: Founder must resolve GitHub account/billing lock before scheduled production smoke can be treated as active monitoring.',
    ],
  },
}, null, 2));

const result = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    ...process.env,
    STATUS_EVIDENCE_DIR: evidenceDir,
  },
  encoding: 'utf8',
});

assert.strictEqual(result.status, 0, `production gates summary must pass with a valid status report: ${result.stderr}`);
assert.match(result.stdout, /production gates summary:/i, 'script must print generated summary path');
const outputPath = result.stdout.match(/production gates summary: (.+production-gates-[^\r\n]+\.md)/)[1];
const markdown = fs.readFileSync(outputPath, 'utf8');

assert.match(markdown, /# Production Gate Summary/, 'summary must have a clear title');
assert.match(markdown, /## Blocked Items/, 'summary must include a blocked items section');
assert.match(markdown, /\| Gate \| Status \| Blocker \|/, 'summary must include a gates table');
assert.match(markdown, /admin-account/, 'summary must include admin account gate');
assert.match(markdown, /security-review/, 'summary must include security review gate');
assert.match(markdown, /railway frontend freshness/, 'summary must include warning summary');
assert.match(markdown, /github-actions-account-lock/, 'summary must include dynamic blocked items from ops:status');
assert.match(markdown, /No secrets/, 'summary must include no-secrets note');
assert.doesNotMatch(markdown, /Bearer\s+[A-Za-z0-9._-]+/, 'summary must not include bearer tokens');
assert.doesNotMatch(markdown, /postgres:\/\/|postgresql:\/\//i, 'summary must not include database URLs');

const missingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcsc-gates-missing-'));
const missing = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    ...process.env,
    STATUS_EVIDENCE_DIR: missingDir,
  },
  encoding: 'utf8',
});

assert.notStrictEqual(missing.status, 0, 'summary script must fail when no production status report exists');
assert.match(`${missing.stdout}\n${missing.stderr}`, /ops:status/i, 'missing report error must point operator to ops:status');

console.log('production gates summary script validation passed');
