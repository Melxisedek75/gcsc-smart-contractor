import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const evidenceDir = process.env.STATUS_EVIDENCE_DIR
  ? path.resolve(repoRoot, process.env.STATUS_EVIDENCE_DIR)
  : path.join(repoRoot, 'evidence');

const requiredGateIds = [
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
];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function redactKnownSecrets(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, '[postgres-url-redacted]')
    .replace(/sk_live_[A-Za-z0-9]+/g, 'sk_live_[redacted]')
    .replace(/sk_test_[A-Za-z0-9]+/g, 'sk_test_[redacted]')
    .replace(/whsec_[A-Za-z0-9]+/g, 'whsec_[redacted]');
}

function escapeTableCell(value) {
  return redactKnownSecrets(value)
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function addUnique(items, item) {
  if (!items.includes(item)) {
    items.push(item);
  }
}

function buildNextActions(critical, warnings, blocked) {
  const actions = [];

  if (critical.length > 0) {
    addUnique(actions, 'Codex/operator: treat critical failures as incident work; inspect production-status JSON and fix or rollback before feature work.');
  }

  for (const warning of warnings) {
    const normalized = String(warning).toLowerCase();
    if (normalized.includes('railway frontend freshness')) {
      addUnique(actions, 'Founder/operator: Redeploy Railway frontend, then run STRICT_RAILWAY_FRONTEND=1 npm --prefix v3 run smoke:production.');
    } else if (normalized.includes('github actions scheduled smoke')) {
      addUnique(actions, 'Founder/operator: check GitHub Actions status; use local fallback smoke/status commands until scheduled monitoring is healthy.');
    }
  }

  for (const item of blocked) {
    const normalized = String(item).toLowerCase();
    if (normalized.startsWith('github-actions-account-lock:')) {
      addUnique(actions, 'Founder: Resolve GitHub account/billing lock, then rerun Backend Production Checks and confirm the daily artifact uploads.');
    } else if (normalized.startsWith('admin-account:')) {
      addUnique(actions, 'Founder: create first admin with Railway bootstrap variables, log in, disable bootstrap, redeploy, then verify admin UI.');
    } else if (normalized.startsWith('live-trust-workflow:')) {
      addUnique(actions, 'Founder/Codex: after first admin exists, run the role-by-role rehearsal in PILOT-RUNBOOK.md with homeowner, contractor, and admin test users.');
    } else if (normalized.startsWith('audit-log:')) {
      addUnique(actions, 'Founder/Codex: after the role-by-role rehearsal, export non-secret admin audit evidence with npm --prefix v3 run audit:export.');
    } else if (normalized.startsWith('postgres-restore-drill:')) {
      addUnique(actions, 'Founder/Codex: provide a non-production PostgreSQL restore target and approve a production backup run before any risky DB change.');
    } else if (normalized.startsWith('monitoring-alerts:')) {
      addUnique(actions, 'Founder: choose an alert provider or Railway alerts; Codex/operator verifies alert coverage with MONITORING-RUNBOOK.md.');
    } else if (normalized.startsWith('xpr-webauth-settlement:')) {
      addUnique(actions, 'Founder/Codex: use testnet accounts for one real WebAuth-signed escrow action; no mainnet funds without explicit approval.');
    } else if (normalized.startsWith('smart-contract-permissions:')) {
      addUnique(actions, 'Founder/Codex: verify deployed XPR contract permissions, transfer notify behavior, and inline action permissions before any settlement pilot.');
    } else if (normalized.startsWith('stripe-readiness:')) {
      addUnique(actions, 'Founder/Codex: add Stripe test-mode keys through secret-safe env handling and run a signed webhook/test-card smoke only in test mode.');
    } else if (normalized.startsWith('legal-review:')) {
      addUnique(actions, 'Founder: get legal review for escrow, token, financing, insurance, refund, cancellation, and payout language.');
    } else if (normalized.startsWith('security-review:')) {
      addUnique(actions, 'Founder/Codex: complete external or structured internal security review before real funds.');
    } else if (normalized.startsWith('founder-approval:')) {
      addUnique(actions, 'Founder: keep real-money status disabled until every technical, legal, security, payment, and settlement gate passes.');
    }
  }

  if (actions.length === 0) {
    actions.push('Operator: no immediate action from this report; continue with the first safe unchecked task in TWO-WEEK-PRODUCTION-99-PLAN.md.');
  }

  return actions;
}

function findLatestStatusReport() {
  if (!fs.existsSync(evidenceDir)) {
    return null;
  }

  const reports = fs.readdirSync(evidenceDir)
    .filter((name) => /^production-status-.+\.json$/.test(name))
    .map((name) => {
      const fullPath = path.join(evidenceDir, name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return reports[0]?.fullPath || null;
}

function validateReport(report, reportPath) {
  if (!Array.isArray(report.productionGates)) {
    fail(`Latest status report is missing productionGates. Run npm --prefix v3 run ops:status again. Report: ${reportPath}`);
  }

  const presentIds = new Set(report.productionGates.map((gate) => gate.id));
  const missingGateIds = requiredGateIds.filter((id) => !presentIds.has(id));
  if (missingGateIds.length > 0) {
    fail(`Latest status report is missing required production gates: ${missingGateIds.join(', ')}`);
  }
}

function buildMarkdown(report, reportPath) {
  const summary = report.summary || {};
  const critical = Array.isArray(summary.critical) ? summary.critical : [];
  const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
  const blocked = Array.isArray(summary.blocked) ? summary.blocked : [];
  const gates = report.productionGates;
  const gateBlockers = gates
    .filter((gate) => gate.status !== 'pass')
    .map((gate) => `${gate.id}: ${gate.blocker || ''}`);
  const nextActions = buildNextActions(critical, warnings, [...blocked, ...gateBlockers]);

  const rows = gates.map((gate) => (
    `| \`${escapeTableCell(gate.id)}\` ${escapeTableCell(gate.label || '')} | ${escapeTableCell(gate.status)} | ${escapeTableCell(gate.blocker)} |`
  ));

  return [
    '# Production Gate Summary',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Source status report: ${escapeTableCell(path.relative(repoRoot, reportPath))}`,
    '',
    'No secrets: this summary is generated from non-secret operations status evidence and redacts common token/database patterns.',
    '',
    '## Snapshot',
    '',
    `- Critical failures: ${critical.length}`,
    `- Warnings: ${warnings.length}${warnings.length ? ` (${warnings.map(escapeTableCell).join(', ')})` : ''}`,
    `- Open/blocked gates: ${blocked.length}`,
    '',
    '## Next Actions',
    '',
    ...nextActions.map((item) => `- ${escapeTableCell(item)}`),
    '',
    '## Blocked Items',
    '',
    ...(blocked.length ? blocked.map((item) => `- ${escapeTableCell(item)}`) : ['- None']),
    '',
    '## Gates',
    '',
    '| Gate | Status | Blocker |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

const latestReportPath = findLatestStatusReport();
if (!latestReportPath) {
  fail(`No production status report found in ${evidenceDir}. Run npm --prefix v3 run ops:status first.`);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(latestReportPath, 'utf8'));
} catch (error) {
  fail(`Could not read latest production status report: ${error.message}`);
}

validateReport(report, latestReportPath);

fs.mkdirSync(evidenceDir, { recursive: true });
const outputPath = path.join(evidenceDir, `production-gates-${timestamp()}.md`);
fs.writeFileSync(outputPath, buildMarkdown(report, latestReportPath));

console.log(`production gates summary: ${outputPath}`);
