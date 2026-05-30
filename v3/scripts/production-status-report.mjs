import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const evidenceDir = process.env.STATUS_EVIDENCE_DIR
  ? path.resolve(repoRoot, process.env.STATUS_EVIDENCE_DIR)
  : path.join(repoRoot, 'evidence');

const backendUrl = (process.env.BACKEND_URL || 'https://gcsc-backend-production.up.railway.app').replace(/\/+$/, '');
const mainSiteUrl = (process.env.MAIN_SITE_URL || 'https://gcsc.store').replace(/\/+$/, '');
const railwayFrontendUrl = (process.env.RAILWAY_FRONTEND_URL || 'https://gcsc-store-production.up.railway.app').replace(/\/+$/, '');
const githubRepositorySlug = process.env.GITHUB_REPOSITORY_SLUG || 'Melxisedek75/gcsc-smart-contractor';
const githubApiBaseUrl = (process.env.GITHUB_API_BASE_URL || 'https://api.github.com').replace(/\/+$/, '');
const githubActionsStatusFixture = process.env.GITHUB_ACTIONS_STATUS_FIXTURE || '';

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

const productionGates = [
  {
    id: 'admin-account',
    label: 'Admin account and bootstrap disabled',
    status: 'blocked',
    blocker: 'Founder must set Railway ADMIN_BOOTSTRAP_ENABLED, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FULL_NAME, verify login, then disable bootstrap.',
  },
  {
    id: 'live-trust-workflow',
    label: 'Live homeowner to verified contractor workflow',
    status: 'blocked',
    blocker: 'Requires first admin account and live role-by-role rehearsal with homeowner, contractor, and admin test users.',
  },
  {
    id: 'audit-log',
    label: 'Live audit log evidence',
    status: 'blocked',
    blocker: 'Automated audit coverage exists, but live audit evidence requires admin login and role-by-role pilot execution.',
  },
  {
    id: 'postgres-restore-drill',
    label: 'PostgreSQL backup and restore drill',
    status: 'blocked',
    blocker: 'Requires founder-approved production backup run and a non-production PostgreSQL restore target.',
  },
  {
    id: 'monitoring-alerts',
    label: 'Monitoring and alerting configured',
    status: 'blocked',
    blocker: 'Runbook and public smoke automation exist; external alert provider or Railway alert setup still requires founder action.',
  },
  {
    id: 'xpr-webauth-settlement',
    label: 'XPR/WebAuth signed escrow settlement',
    status: 'blocked',
    blocker: 'Requires testnet accounts, deployed contract/permission confirmation, and a real WebAuth-signed testnet transaction.',
  },
  {
    id: 'smart-contract-permissions',
    label: 'Smart contract deployment and permissions',
    status: 'blocked',
    blocker: 'Requires XPR account permission evidence and transfer notify/inline action verification on deployed accounts.',
  },
  {
    id: 'stripe-readiness',
    label: 'Stripe test-mode and payout readiness',
    status: 'blocked',
    blocker: 'Requires founder-provided Stripe test keys, webhook setup, one signed test-card run, and payout/legal review before live use.',
  },
  {
    id: 'security-review',
    label: 'Production security review',
    status: 'partial',
    blocker: 'Internal guardrails exist; external security review and any high-risk remediation remain required before real funds.',
  },
  {
    id: 'legal-review',
    label: 'Legal and compliance review',
    status: 'blocked',
    blocker: 'Requires legal review of escrow, token, financing, insurance, refund, cancellation, and contractor payout language.',
  },
  {
    id: 'founder-approval',
    label: 'Final real-money launch approval',
    status: 'blocked',
    blocker: 'Founder must explicitly approve real-money launch after all technical, legal, security, payment, and settlement gates pass.',
  },
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

function addBlockedItem(report, id, message) {
  const entry = `${id}: ${message}`;
  if (!report.summary.blocked.includes(entry)) {
    report.summary.blocked.push(entry);
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
  const productionGatesSummaryScriptPath = path.join(repoRoot, 'v3', 'scripts', 'production-gates-summary.mjs');
  const evidenceScanScriptPath = path.join(repoRoot, 'v3', 'scripts', 'scan-production-evidence.mjs');
  const dailyStatusRunbookPath = path.join(repoRoot, 'DAILY-STATUS-RUNBOOK.md');
  const workflowPath = path.join(repoRoot, '.github', 'workflows', 'backend-production-checks.yml');
  const missing = [];
  const changed = [];

  const packageJsonRaw = readTextIfExists(packageJsonPath);
  const securityEnvScript = readTextIfExists(securityEnvScriptPath);
  const restoreDrillScript = readTextIfExists(restoreDrillScriptPath);
  const productionGatesSummaryScript = readTextIfExists(productionGatesSummaryScriptPath);
  const evidenceScanScript = readTextIfExists(evidenceScanScriptPath);
  const dailyStatusRunbook = readTextIfExists(dailyStatusRunbookPath);
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
  if (!productionGatesSummaryScript) {
    missing.push('v3/scripts/production-gates-summary.mjs');
  }
  if (!evidenceScanScript) {
    missing.push('v3/scripts/scan-production-evidence.mjs');
  }
  if (!dailyStatusRunbook) {
    missing.push('DAILY-STATUS-RUNBOOK.md');
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
    if (scripts['ops:gates'] !== 'node scripts/production-gates-summary.mjs') {
      changed.push('ops:gates package script');
    }
    if (scripts['test:production-gates-summary-script'] !== 'node tests/production-gates-summary-script.test.js') {
      changed.push('test:production-gates-summary-script package script');
    }
    if (scripts['test:daily-status-runbook'] !== 'node tests/daily-status-runbook.test.js') {
      changed.push('test:daily-status-runbook package script');
    }
    if (scripts['ops:evidence:scan'] !== 'node scripts/scan-production-evidence.mjs') {
      changed.push('ops:evidence:scan package script');
    }
    if (scripts['test:production-evidence-scan-script'] !== 'node tests/production-evidence-scan-script.test.js') {
      changed.push('test:production-evidence-scan-script package script');
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
      'test:production-gates-summary-script',
      'test:daily-status-runbook',
      'test:production-evidence-scan-script',
      'smoke:production',
      'security:cors:smoke',
      'ops:status',
      'ops:gates',
      'ops:evidence:scan',
      'actions/upload-artifact@v4',
      'production-status-evidence',
      'evidence/production-status-*.json',
      'evidence/production-gates-*.md',
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

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'Cache-Control': 'no-cache',
        'User-Agent': 'GCSC-SmartContractor-Production-Status',
      },
      signal: controller.signal,
    });
    const body = await response.text();
    let parsed = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      parsed = { raw: body.slice(0, 300) };
    }
    return { response, parsed };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadGithubActionsStatus() {
  if (githubActionsStatusFixture) {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(githubActionsStatusFixture), 'utf8'));
    return {
      latestRun: fixture.workflow_runs?.[0] || null,
      jobs: fixture.jobs || [],
      annotations: (fixture.jobs || []).flatMap((job) => job.annotations || []),
      source: 'fixture',
    };
  }

  const runsUrl = `${githubApiBaseUrl}/repos/${githubRepositorySlug}/actions/runs?per_page=10`;
  const { response: runsResponse, parsed: runsBody } = await fetchJson(runsUrl);
  if (runsResponse.status !== 200) {
    return {
      latestRun: null,
      jobs: [],
      annotations: [],
      source: runsUrl,
      apiError: `HTTP ${runsResponse.status}`,
    };
  }

  const latestRun = (runsBody.workflow_runs || []).find((run) => run.name === 'Backend Production Checks') || null;
  if (!latestRun) {
    return {
      latestRun: null,
      jobs: [],
      annotations: [],
      source: runsUrl,
      apiError: 'no Backend Production Checks run found',
    };
  }

  const jobsUrl = `${githubApiBaseUrl}/repos/${githubRepositorySlug}/actions/runs/${latestRun.id}/jobs?per_page=100`;
  const { response: jobsResponse, parsed: jobsBody } = await fetchJson(jobsUrl);
  const jobs = jobsResponse.status === 200 ? jobsBody.jobs || [] : [];
  const annotations = [];

  for (const job of jobs) {
    if (job.conclusion !== 'failure') {
      continue;
    }

    const checkUrl = `${githubApiBaseUrl}/repos/${githubRepositorySlug}/check-runs/${job.id}`;
    const { response: checkResponse, parsed: checkBody } = await fetchJson(checkUrl);
    const annotationsUrl = checkResponse.status === 200 ? checkBody.output?.annotations_url : null;
    if (!annotationsUrl) {
      continue;
    }

    const { response: annotationsResponse, parsed: annotationsBody } = await fetchJson(annotationsUrl);
    if (annotationsResponse.status === 200) {
      annotations.push(...(annotationsBody.value || annotationsBody || []).map((item) => item.message || '').filter(Boolean));
    }
  }

  return {
    latestRun,
    jobs,
    annotations,
    source: runsUrl,
  };
}

async function checkGithubActionsStatus(report) {
  const label = 'github actions scheduled smoke';
  try {
    const status = await loadGithubActionsStatus();
    const latestRun = status.latestRun;
    const annotations = status.annotations || [];
    const accountLocked = annotations.some((message) => /account is locked due to a billing issue/i.test(message));

    if (accountLocked) {
      addBlockedItem(
        report,
        'github-actions-account-lock',
        'Founder must resolve GitHub account/billing lock before scheduled production smoke can be treated as active monitoring.'
      );
    }

    const runOk = latestRun?.status === 'completed' && latestRun?.conclusion === 'success';
    const observed = accountLocked
      ? 'The job was not started because your account is locked due to a billing issue.'
      : latestRun
        ? `run=${latestRun.id}, status=${latestRun.status}, conclusion=${latestRun.conclusion || 'none'}, event=${latestRun.event || 'unknown'}`
        : status.apiError || 'no Backend Production Checks run found';

    addCheck(report, {
      label,
      severity: 'warning',
      status: runOk ? 'pass' : 'fail',
      expected: 'Backend Production Checks starts, runs public smoke/status checks, scans evidence, and uploads artifact',
      observed,
      url: latestRun?.html_url || `https://github.com/${githubRepositorySlug}/actions`,
    });
  } catch (error) {
    addCheck(report, {
      label,
      severity: 'warning',
      status: 'fail',
      expected: 'reachable GitHub Actions public status',
      observed: error.message,
      url: `https://github.com/${githubRepositorySlug}/actions`,
    });
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
  productionGates,
  checks: [],
  summary: {
    critical: [],
    warnings: [],
    blocked: productionGates
      .filter((gate) => gate.status !== 'pass')
      .map((gate) => `${gate.id}: ${gate.blocker}`),
  },
};

checkRepositoryGuardrails(report);
await checkGithubActionsStatus(report);
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
