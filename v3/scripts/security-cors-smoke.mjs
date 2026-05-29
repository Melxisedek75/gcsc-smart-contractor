const backendUrl = (process.env.BACKEND_URL || 'https://gcsc-backend-production.up.railway.app').replace(/\/+$/, '');
const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN || 'https://gcsc.store';
const deniedOrigin = process.env.CORS_DENIED_ORIGIN || 'https://evil.example';

function header(response, name) {
  return response.headers.get(name);
}

async function fetchWithOrigin(path, origin) {
  return fetch(`${backendUrl}${path}`, {
    headers: {
      Origin: origin,
      'Cache-Control': 'no-cache',
    },
  });
}

async function expectAllowedHealth() {
  const response = await fetchWithOrigin('/health', allowedOrigin);
  const allowOrigin = header(response, 'Access-Control-Allow-Origin');
  if (response.status !== 200) {
    throw new Error(`allowed /health expected HTTP 200, got ${response.status}`);
  }
  if (allowOrigin !== allowedOrigin) {
    throw new Error(`allowed /health expected Access-Control-Allow-Origin ${allowedOrigin}, got ${allowOrigin}`);
  }
  console.log(`allowed origin /health: HTTP ${response.status}, Access-Control-Allow-Origin=${allowOrigin}`);
}

async function expectDeniedHealth() {
  const response = await fetchWithOrigin('/health', deniedOrigin);
  const text = await response.text();
  const allowOrigin = header(response, 'Access-Control-Allow-Origin');
  if (response.status !== 403) {
    throw new Error(`denied /health expected HTTP 403, got ${response.status}`);
  }
  if (allowOrigin) {
    throw new Error(`denied /health must not include Access-Control-Allow-Origin, got ${allowOrigin}`);
  }
  if (!text.includes('Origin not allowed')) {
    throw new Error('denied /health response must include Origin not allowed');
  }
  console.log(`denied origin /health: HTTP ${response.status}, Origin not allowed`);
}

async function expectAllowedAdminGuard() {
  const response = await fetchWithOrigin('/api/admin/audit-events?limit=1', allowedOrigin);
  const allowOrigin = header(response, 'Access-Control-Allow-Origin');
  if (response.status !== 401) {
    throw new Error(`allowed admin audit guard expected HTTP 401, got ${response.status}`);
  }
  if (allowOrigin !== allowedOrigin) {
    throw new Error(`allowed admin audit guard expected Access-Control-Allow-Origin ${allowedOrigin}, got ${allowOrigin}`);
  }
  console.log(`allowed origin admin audit guard: HTTP 401, Access-Control-Allow-Origin=${allowOrigin}`);
}

try {
  await expectAllowedHealth();
  await expectDeniedHealth();
  await expectAllowedAdminGuard();
  console.log('security CORS smoke passed');
} catch (error) {
  console.error(`security CORS smoke failed: ${error.message}`);
  process.exit(1);
}
