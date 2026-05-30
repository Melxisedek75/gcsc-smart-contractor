import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const evidenceDir = path.join(repoRoot, 'evidence');

const backendUrl = (process.env.BACKEND_URL || 'https://gcsc-backend-production.up.railway.app').replace(/\/+$/, '');
const mainSiteUrl = (process.env.MAIN_SITE_URL || 'https://gcsc.store').replace(/\/+$/, '');
const railwayFrontendUrl = (process.env.RAILWAY_FRONTEND_URL || 'https://gcsc-store-production.up.railway.app').replace(/\/+$/, '');

const requiredFrontendBundleMarkers = [
  'Milestone Released',
  'Chain Tx Failed',
  'Payment intent created',
  'project.created',
];

const requiredSecurityHeaders = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'no-referrer'],
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ['Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"],
  ['Permissions-Policy', 'geolocation=(), camera=(), microphone=()'],
];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function addCheck(report, check) {
  report.checks.push(check);
  if (check.severity === 'critical' && check.status !== 'pass') {
    report.summary.critical.push(check.label);
  }
  if (check.severity === 'warning' && check.status !== 'pass') {
    report.summary.warnings.push(check.label);
  }
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

function checkRepositoryGuardrails(report) {
  const label = 'repository production guardrails';
  const packageJsonPath = path.join(repoRoot, 'v3', 'package.json');
  const securityEnvScriptPath = path.join(repoRoot, 'v3', 'scripts', 'check-security-env.mjs');
  const restoreDrillScriptPath = path.join(repoRoot, 'v3', 'scripts', 'restore-postgres-drill.mjs');
  const workflowPath = path.join(repoRoot, '.github', 'workflows', 'backend-production-checks.yml');
  const missing = [];
  const changed = [];

  const packageJsonRaw = readTextIfExists(packageJsonPath);
  const securityEnvScript = readTextIfExists(securityEnvScriptPath);
  const restoreDrillScript = readTextIfExists(restoreDrillScriptPath);
  const workflow = readTextIfExists(workflowPath);

  if (!packageJsonRaw) {
    missing.push('v3/package.json');
  }
  if (!securityEnvScript) {
    missing.push('v3/scripts/check-security-env.mjs');
  }
  if (!restoreDrillScript) {
    missing.push('v3/scripts/restore-postgres-drill.mjs');
  }
  if (!workflow) {
    missing.push('.github/workflows/backend-production-checks.yml');
  }

  if (packageJsonRaw) {
    const packageJson = JSON.parse(packageJsonRaw);
    const scripts = packageJson.scripts || {};
    if (scripts['security:env:check'] !== 'node scripts/check-security-env.mjs') {
      changed.push('security:env:check package script');
    }
    if (scripts['test:security-env-check-script'] !== 'node tests/security-env-check-script.test.js') {
      changed.push('test:security-env-check-script package script');
    }
    if (scripts['db:restore:drill'] !== 'node scripts/restore-postgres-drill.mjs') {
      changed.push('db:restore:drill package script');
    }
    if (scripts['test:restore-drill-script'] !== 'node tests/restore-drill-script.test.js') {
      changed.push('test:restore-drill-script package script');
    }
  }

  if (securityEnvScript) {
    for (const required of ['secret-safe', 'JWT_SECRET', 'DATABASE_URL', 'CORS_ALLOWED_ORIGINS']) {
      if (!securityEnvScript.includes(required)) {
        changed.push(`check-security-env.mjs missing ${required}`);
      }
    }
  }

  if (workflow) {
    for (const required of [
      'test:security-env-check-script',
      'test:restore-drill-script',
      'smoke:production',
      'security:cors:smoke',
      'ops:status',
    ]) {
      if (!workflow.includes(required)) {
        changed.push(`backend-production-checks.yml missing ${required}`);
      }
    }

    if (workflow.includes('${{ secrets.')) {
      changed.push('backend-production-checks.yml references repository secrets');
    }
  }

  const problems = [...missing.map((item) => `missing ${item}`), ...changed];

  addCheck(report, {
    label,
    severity: 'critical',
    status: problems.length === 0 ? 'pass' : 'fail',
    expected: 'CI validates production smoke, CORS smoke, ops status, and secret-safe env checker without repository secrets',
    observed: problems.length === 0 ? 'all repository production guardrails present' : problems.join('; '),
  });
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkBackendHealth(report) {
  const label = 'backend health';
  const url = `${backendUrl}/health`;
  try {
    const { response, text } = await fetchText(url);
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    const ok = response.status === 200 && body.status === 'ok' && body.database === 'postgres';
    addCheck(report, {
      label,
      severity: 'critical',
      status: ok ? 'pass' : 'fail',
      expected: 'HTTP 200, status=ok, database=postgres',
      observed: `HTTP ${response.status}, body=${JSON.stringify(body).slice(0, 300)}`,
      url,
    });

    const missingHeaders = requiredSecurityHeaders
      .map(([name, expected]) => {
        const observed = response.headers.get(name);
        return observed === expected ? null : { name, expected, observed };
      })
      .filter(Boolean);

    addCheck(report, {
      label: 'backend security headers',
      severity: 'critical',
      status: missingHeaders.length === 0 ? 'pass' : 'fail',
      expected: 'baseline security headers on /health',
      observed: missingHeaders.length === 0
        ? 'all baseline security headers present'
        : `missing_or_changed=${JSON.stringify(missingHeaders)}`,
      url,
    });
  } catch (error) {
    addCheck(report, {
      label,
      severity: 'critical',
      status: 'fail',
      expected: 'reachable backend health endpoint',
      observed: error.message,
      url,
    });
  }
}

async function checkAdminGuard(report) {
  const label = 'admin audit unauthenticated guard';
  const url = `${backendUrl}/api/admin/audit-events?limit=1`;
  try {
    const { response } = await fetchText(url);
    addCheck(report, {
      label,
      severity: 'critical',
      status: response.status === 401 ? 'pass' : 'fail',
      expected: 'HTTP 401 without JWT',
      observed: `HTTP ${response.status}`,
      url,
    });
  } catch (error) {
    addCheck(report, {
      label,
      severity: 'critical',
      status: 'fail',
      expected: 'reachable protected endpoint returning 401',
      observed: error.message,
      url,
    });
  }
}

function extractBundleUrl(html, baseUrl) {
  const match = html.match(/<script[^>]+src=["']([^"']*assets\/[^"']+\.js)["']/);
  return match ? new URL(match[1], baseUrl).toString() : null;
}

async function checkFrontend(report, label, url, severity) {
  try {
    const { response, text: html } = await fetchText(`${url}/`);
    const shellOk = html.includes('<div id="root"></div>') && html.includes('assets/index-');
    const bundleUrl = shellOk ? extractBundleUrl(html, response.url || `${url}/`) : null;

    if (response.status !== 200 || !shellOk || !bundleUrl) {
      addCheck(report, {
        label,
        severity,
        status: 'fail',
        expected: 'HTTP 200 built frontend shell with JS bundle',
        observed: `HTTP ${response.status}, shellOk=${shellOk}, bundle=${bundleUrl || 'missing'}`,
        url,
      });
      return;
    }

    const { response: bundleResponse, text: bundle } = await fetchText(`${bundleUrl}?status=${Date.now()}`);
    const missing = requiredFrontendBundleMarkers.filter((marker) => !bundle.includes(marker));
    const ok = bundleResponse.status === 200 && missing.length === 0;

    addCheck(report, {
      label,
      severity,
      status: ok ? 'pass' : 'fail',
      expected: 'current frontend bundle markers present',
      observed: ok
        ? `HTTP ${bundleResponse.status}, bundle current`
        : `HTTP ${bundleResponse.status}, missing=${missing.join(', ') || 'none'}`,
      url,
      bundleUrl,
    });
  } catch (error) {
    addCheck(report, {
      label,
      severity,
      status: 'fail',
      expected: 'reachable frontend',
      observed: error.message,
      url,
    });
  }
}

function writeReport(report) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const outputPath = path.join(evidenceDir, `production-status-${timestamp()}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return outputPath;
}

const report = {
  generatedAt: new Date().toISOString(),
  source: {
    backendUrl,
    mainSiteUrl,
    railwayFrontendUrl,
  },
  checks: [],
  summary: {
    critical: [],
    warnings: [],
    blocked: [
      'first admin account requires founder-set Railway variables',
      'Railway frontend freshness requires manual redeploy or secret-safe Railway token',
      'restore drill requires non-production PostgreSQL target',
      'real XPR/Stripe/legal/security gates require founder or external approval',
    ],
  },
};

checkRepositoryGuardrails(report);
await checkBackendHealth(report);
await checkAdminGuard(report);
await checkFrontend(report, 'main site frontend freshness', mainSiteUrl, 'critical');
await checkFrontend(report, 'railway frontend freshness', railwayFrontendUrl, 'warning');

const outputPath = writeReport(report);

console.log(`production status report: ${outputPath}`);
console.log(`critical failures: ${report.summary.critical.length}`);
console.log(`warnings: ${report.summary.warnings.length}`);
console.log(`blocked items: ${report.summary.blocked.length}`);

if (report.summary.critical.length > 0) {
  console.error(`critical: ${report.summary.critical.join(', ')}`);
  process.exit(1);
}

if (report.summary.warnings.length > 0) {
  console.warn(`warnings: ${report.summary.warnings.join(', ')}`);
}
