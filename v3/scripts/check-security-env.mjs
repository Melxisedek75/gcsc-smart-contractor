const required = [
  'NODE_ENV',
  'JWT_SECRET',
  'DATABASE_URL',
  'FRONTEND_URL',
  'CORS_ALLOWED_ORIGINS',
  'RATE_LIMITS_DISABLED',
  'ADMIN_BOOTSTRAP_ENABLED',
];

const sensitive = new Set(['JWT_SECRET', 'DATABASE_URL', 'ADMIN_PASSWORD']);
const failures = [];

function value(name) {
  return String(process.env[name] || '').trim();
}

function hasValue(name) {
  return value(name).length > 0;
}

function reportStatus(name) {
  if (!hasValue(name)) {
    console.log(`${name}: missing`);
    return;
  }

  if (sensitive.has(name)) {
    console.log(`${name}: set`);
    return;
  }

  console.log(`${name}: set`);
}

function fail(name, reason) {
  failures.push(`${name}: ${reason}`);
}

function parseOrigins(raw) {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

console.log('Production security env check (secret-safe)');

for (const name of required) {
  reportStatus(name);
  if (!hasValue(name)) {
    fail(name, 'missing');
  }
}

const nodeEnv = value('NODE_ENV');
if (nodeEnv && nodeEnv !== 'production') {
  fail('NODE_ENV', 'must be production');
}

const jwtSecret = value('JWT_SECRET');
if (jwtSecret) {
  const unsafeSecrets = new Set([
    'secret',
    'changeme',
    'password',
    'gcsc-dev-secret',
    'gcsc-dev-secret-256-bits-minimum-length',
  ]);

  if (jwtSecret.length < 32) {
    fail('JWT_SECRET', 'must be at least 32 characters; 64+ random characters recommended');
  }

  if (unsafeSecrets.has(jwtSecret.toLowerCase())) {
    fail('JWT_SECRET', 'must not use a default or placeholder value');
  }
}

const databaseUrl = value('DATABASE_URL');
if (databaseUrl && !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  fail('DATABASE_URL', 'must be a PostgreSQL connection string');
}

const frontendUrl = value('FRONTEND_URL');
if (frontendUrl) {
  if (frontendUrl !== 'https://gcsc.store') {
    fail('FRONTEND_URL', 'must be https://gcsc.store for production');
  }

  if (!frontendUrl.startsWith('https://')) {
    fail('FRONTEND_URL', 'must use https');
  }
}

const corsOrigins = parseOrigins(value('CORS_ALLOWED_ORIGINS'));
if (corsOrigins.length > 0) {
  if (!corsOrigins.includes('https://gcsc.store')) {
    fail('CORS_ALLOWED_ORIGINS', 'must include https://gcsc.store');
  }

  for (const origin of corsOrigins) {
    if (origin === '*') {
      fail('CORS_ALLOWED_ORIGINS', 'must not contain wildcard origins');
    }

    if (/localhost|127\.0\.0\.1|\[::1\]/i.test(origin)) {
      fail('CORS_ALLOWED_ORIGINS', 'must not contain local development origins in production');
    }

    if (origin !== '*' && !origin.startsWith('https://')) {
      fail('CORS_ALLOWED_ORIGINS', 'every production origin must use https');
    }
  }
}

const rateLimitsDisabled = value('RATE_LIMITS_DISABLED').toLowerCase();
if (rateLimitsDisabled === 'true' || rateLimitsDisabled === '1' || rateLimitsDisabled === 'yes') {
  fail('RATE_LIMITS_DISABLED', 'must be false in production');
}

const bootstrapEnabled = value('ADMIN_BOOTSTRAP_ENABLED').toLowerCase();
if (bootstrapEnabled && bootstrapEnabled !== 'true' && bootstrapEnabled !== 'false') {
  fail('ADMIN_BOOTSTRAP_ENABLED', 'must be true or false');
}

if (bootstrapEnabled === 'true') {
  for (const name of ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_FULL_NAME']) {
    reportStatus(name);
    if (!hasValue(name)) {
      fail(name, 'required while ADMIN_BOOTSTRAP_ENABLED is true');
    }
  }

  if (hasValue('ADMIN_PASSWORD') && value('ADMIN_PASSWORD').length < 12) {
    fail('ADMIN_PASSWORD', 'must be at least 12 characters');
  }
}

if (failures.length > 0) {
  console.error('security env check failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('security env check passed');
