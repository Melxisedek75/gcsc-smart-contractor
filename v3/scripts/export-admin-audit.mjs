import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const evidenceDir = path.join(repoRoot, 'evidence');

const backendUrl = (process.env.BACKEND_URL || 'https://gcsc-backend-production.up.railway.app').replace(/\/+$/, '');
const adminJwt = process.env.ADMIN_JWT;

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function optionalParam(params, name, value) {
  if (value && String(value).trim()) params.set(name, String(value).trim());
}

if (!adminJwt || !adminJwt.trim()) {
  fail('ADMIN_JWT is required to export admin audit events. Set it only in the local terminal session.');
}

const params = new URLSearchParams();
optionalParam(params, 'action', process.env.AUDIT_ACTION);
optionalParam(params, 'actor_id', process.env.AUDIT_ACTOR_ID);
optionalParam(params, 'target_user_id', process.env.AUDIT_TARGET_USER_ID);
optionalParam(params, 'limit', process.env.AUDIT_LIMIT || '100');

const endpoint = `${backendUrl}/api/admin/audit-events${params.toString() ? `?${params}` : ''}`;

const response = await fetch(endpoint, {
  headers: {
    Authorization: `Bearer ${adminJwt}`,
    Accept: 'application/json',
    'Cache-Control': 'no-cache',
  },
});

const text = await response.text();
let body = {};
try {
  body = text ? JSON.parse(text) : {};
} catch {
  body = { raw: text.slice(0, 500) };
}

if (!response.ok) {
  fail(`Audit export failed with HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
}

const events = Array.isArray(body.events) ? body.events : [];
const exportedAt = new Date().toISOString();
const output = {
  exportedAt,
  source: backendUrl,
  filters: {
    action: process.env.AUDIT_ACTION || null,
    actor_id: process.env.AUDIT_ACTOR_ID || null,
    target_user_id: process.env.AUDIT_TARGET_USER_ID || null,
    limit: process.env.AUDIT_LIMIT || '100',
  },
  count: events.length,
  events,
};

fs.mkdirSync(evidenceDir, { recursive: true });
const outputPath = path.join(evidenceDir, `audit-events-${timestamp()}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Audit events exported: ${events.length}`);
console.log(`Evidence file: ${outputPath}`);
