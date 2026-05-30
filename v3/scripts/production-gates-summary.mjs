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
