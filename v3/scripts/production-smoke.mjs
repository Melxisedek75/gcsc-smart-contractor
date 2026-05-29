const backendUrl = (process.env.BACKEND_URL || 'https://gcsc-backend-production.up.railway.app').replace(/\/+$/, '');
const mainSiteUrl = (process.env.MAIN_SITE_URL || 'https://gcsc.store').replace(/\/+$/, '');
const railwayFrontendUrl = (process.env.RAILWAY_FRONTEND_URL || 'https://gcsc-store-production.up.railway.app').replace(/\/+$/, '');

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

  await requireFrontend('main site', `${mainSiteUrl}/`);
  await requireFrontend('railway frontend', `${railwayFrontendUrl}/`);
}

run().catch((error) => {
  console.error(`production smoke failed: ${error.message}`);
  process.exit(1);
});
