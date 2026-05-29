const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const v3Root = path.resolve(__dirname, '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'backend-production-checks.yml');
const pkg = JSON.parse(fs.readFileSync(path.join(v3Root, 'package.json'), 'utf8'));

assert.strictEqual(
  pkg.scripts['test:ci-monitoring-workflow'],
  'node tests/ci-monitoring-workflow.test.js',
  'package.json must expose test:ci-monitoring-workflow'
);

assert.ok(fs.existsSync(workflowPath), 'backend production checks workflow must exist');

const workflow = fs.readFileSync(workflowPath, 'utf8');

for (const required of [
  'schedule:',
  "cron: '0 14 * * *'",
  'workflow_dispatch:',
  'Production public smoke',
  'npm --prefix v3 run smoke:production',
  'Security CORS smoke script validation',
  'npm --prefix v3 run test:security-cors-smoke-script',
  'Security CORS public smoke',
  'npm --prefix v3 run security:cors:smoke',
  'Production status report',
  'npm --prefix v3 run ops:status',
  'Operations status report script validation',
  'npm --prefix v3 run test:ops-status-report-script',
  'SECURITY-PRODUCTION-CHECKLIST.md',
]) {
  assert.ok(workflow.includes(required), `workflow must include ${required}`);
}

assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./i, 'scheduled monitoring workflow must not require repository secrets');
assert.doesNotMatch(workflow, /ADMIN_JWT|DATABASE_URL|STRIPE_SECRET_KEY|RAILWAY_TOKEN/, 'scheduled monitoring workflow must not reference sensitive env vars');

console.log('ci monitoring workflow validation passed');
