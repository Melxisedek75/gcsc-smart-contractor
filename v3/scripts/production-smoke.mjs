const backendUrl = (process.env.BACKEND_URL || 'https://gcsc-backend-production.up.railway.app').replace(/\/+$/, '');
const mainSiteUrl = (process.env.MAIN_SITE_URL || 'https://gcsc.store').replace(/\/+$/, '');
const railwayFrontendUrl = (process.env.RAILWAY_FRONTEND_URL || 'https://gcsc-store-production.up.railway.app').replace(/\/+$/, '');
const strictRailwayFrontend = process.env.STRICT_RAILWAY_FRONTEND === '1';

const requiredFrontendBundleMarkers = [
  'Milestone Released',
  'Chain Tx Failed',
  'Payment intent created',
  'project.created',
];

async function readJson(url) {
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { response, data };
}

async function requireStatus(label, url, expectedStatus) {
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (response.status !== expectedStatus) {
    throw new Error(`${label} expected HTTP ${expectedStatus}, got ${response.status}`);
  }
  console.log(`${label}: HTTP ${response.status}`);
  return response;
}

async function requireFrontend(label, url) {
  const response = await requireStatus(label, url, 200);
  const html = await response.text();
  if (!html.includes('<div id="root"></div>') || !html.includes('assets/index-')) {
    throw new Error(`${label} did not return the expected built frontend shell`);
  }
  console.log(`${label}: frontend shell ok`);
  return { html, url: response.url || url };
}

function extractBundleUrl(label, html, baseUrl) {
  const match = html.match(/<script[^>]+src=["']([^"']*assets\/[^"']+\.js)["']/);
  if (!match) {
    throw new Error(`${label} did not expose a built frontend JS bundle`);
  }
  return new URL(match[1], baseUrl).toString();
}

async function checkFrontendBundle(label, url, options = {}) {
  const { required = true } = options;
  const { html, url: resolvedUrl } = await requireFrontend(label, url);
  const bundleUrl = extractBundleUrl(label, html, resolvedUrl);
  const response = await fetch(`${bundleUrl}?smoke=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (response.status !== 200) {
    throw new Error(`${label} bundle expected HTTP 200, got ${response.status}`);
  }
  const bundle = await response.text();
  const missing = requiredFrontendBundleMarkers.filter((marker) => !bundle.includes(marker));
  if (missing.length === 0) {
    console.log(`${label}: frontend bundle current`);
    return true;
  }
  const message = `${label}: frontend bundle stale warning: missing ${missing.join(', ')}`;
  if (required) {
    throw new Error(message);
  }
  console.warn(message);
  return false;
}

async function run() {
  const healthUrl = `${backendUrl}/health`;
  const { response: healthResponse, data: health } = await readJson(healthUrl);
  if (healthResponse.status !== 200) {
    throw new Error(`backend health expected HTTP 200, got ${healthResponse.status}`);
  }
  if (health.status !== 'ok' || health.database !== 'postgres') {
    throw new Error(`backend health expected status ok and database postgres, got ${JSON.stringify(health)}`);
  }
  console.log(`backend health: ${health.status}, database=${health.database}`);

  const adminAuditResponse = await fetch(`${backendUrl}/api/admin/audit-events?limit=1`);
  if (adminAuditResponse.status === 401) {
    console.log('admin audit unauthenticated guard: HTTP 401');
  } else {
    throw new Error(`admin audit unauthenticated guard expected HTTP 401, got ${adminAuditResponse.status}`);
  }

  await checkFrontendBundle('main site', `${mainSiteUrl}/`, { required: true });
  await checkFrontendBundle('railway frontend', `${railwayFrontendUrl}/`, { required: strictRailwayFrontend });
}

run().catch((error) => {
  console.error(`production smoke failed: ${error.message}`);
  process.exit(1);
});
