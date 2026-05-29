const required = [
  'ADMIN_BOOTSTRAP_ENABLED',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'ADMIN_FULL_NAME',
  'DATABASE_URL',
  'JWT_SECRET',
  'CORS_ALLOWED_ORIGINS',
];

const sensitive = new Set(['ADMIN_PASSWORD', 'DATABASE_URL', 'JWT_SECRET']);
const missing = required.filter((name) => !process.env[name] || !String(process.env[name]).trim());
const warnings = [];

function statusLine(name, status, extra = '') {
  const suffix = extra ? ` ${extra}` : '';
  console.log(`${name}: ${status}${suffix}`);
}

console.log('Admin bootstrap env check (secret-safe)');

for (const name of required) {
  if (missing.includes(name)) {
    statusLine(name, 'missing');
    continue;
  }
  if (sensitive.has(name)) {
    statusLine(name, 'set');
  } else {
    statusLine(name, 'set', `(length=${String(process.env[name]).length})`);
  }
}

if (process.env.ADMIN_BOOTSTRAP_ENABLED && process.env.ADMIN_BOOTSTRAP_ENABLED !== 'true') {
  warnings.push('ADMIN_BOOTSTRAP_ENABLED should be true only for first-admin creation, then false after first successful login.');
}

if (process.env.ADMIN_PASSWORD && String(process.env.ADMIN_PASSWORD).length < 12) {
  warnings.push('ADMIN_PASSWORD must be at least 12 characters.');
}

if (process.env.JWT_SECRET && String(process.env.JWT_SECRET).length < 32) {
  warnings.push('JWT_SECRET should be at least 32 characters; 64+ random chars recommended.');
}

if (process.env.CORS_ALLOWED_ORIGINS && !String(process.env.CORS_ALLOWED_ORIGINS).includes('https://gcsc.store')) {
  warnings.push('CORS_ALLOWED_ORIGINS should include https://gcsc.store.');
}

for (const warning of warnings) {
  console.warn(`warning: ${warning}`);
}

if (missing.length > 0) {
  console.error(`missing required variables: ${missing.join(', ')}`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.error('admin bootstrap env check failed because warnings must be resolved before bootstrap.');
  process.exit(1);
}

console.log('admin bootstrap env ready');
