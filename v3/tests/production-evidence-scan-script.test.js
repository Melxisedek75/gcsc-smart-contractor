const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const v3Root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(v3Root, 'package.json'), 'utf8'));
const scriptPath = path.join(v3Root, 'scripts', 'scan-production-evidence.mjs');

assert.strictEqual(
  pkg.scripts['ops:evidence:scan'],
  'node scripts/scan-production-evidence.mjs',
  'package.json must expose ops:evidence:scan'
);
assert.strictEqual(
  pkg.scripts['test:production-evidence-scan-script'],
  'node tests/production-evidence-scan-script.test.js',
  'package.json must expose test:production-evidence-scan-script'
);

assert.ok(fs.existsSync(scriptPath), 'scan-production-evidence.mjs must exist');

const source = fs.readFileSync(scriptPath, 'utf8');
for (const required of [
  'STATUS_EVIDENCE_DIR',
  'production-status-',
  'production-gates-',
  'ghp_',
  'RAILWAY_TOKEN',
  'sk_live_',
  'whsec_',
  'postgres',
  'Bearer',
  'production evidence secret scan',
]) {
  assert.ok(source.includes(required), `evidence scan script must include ${required}`);
}

const cleanDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcsc-evidence-clean-'));
fs.writeFileSync(path.join(cleanDir, 'production-status-clean.json'), JSON.stringify({
  summary: { critical: [], warnings: [], blocked: [] },
  productionGates: [],
}, null, 2));
fs.writeFileSync(path.join(cleanDir, 'production-gates-clean.md'), '# Production Gate Summary\n\nNo secrets here.\n');

const clean = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    ...process.env,
    STATUS_EVIDENCE_DIR: cleanDir,
  },
  encoding: 'utf8',
});

assert.strictEqual(clean.status, 0, `scan must pass clean evidence: ${clean.stderr}`);
assert.match(clean.stdout, /passed/i, 'clean scan output must say passed');

const dirtyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcsc-evidence-dirty-'));
fs.writeFileSync(path.join(dirtyDir, 'production-status-dirty.json'), JSON.stringify({
  leaked: 'Bearer abc.def.ghi',
}, null, 2));

const dirty = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    ...process.env,
    STATUS_EVIDENCE_DIR: dirtyDir,
  },
  encoding: 'utf8',
});

assert.notStrictEqual(dirty.status, 0, 'scan must fail dirty evidence');
assert.match(`${dirty.stdout}\n${dirty.stderr}`, /secret pattern/i, 'dirty scan must report secret pattern');
assert.doesNotMatch(`${dirty.stdout}\n${dirty.stderr}`, /abc\.def\.ghi/, 'dirty scan must not print leaked token value');

const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcsc-evidence-empty-'));
const empty = spawnSync(process.execPath, [scriptPath], {
  cwd: v3Root,
  env: {
    ...process.env,
    STATUS_EVIDENCE_DIR: emptyDir,
  },
  encoding: 'utf8',
});

assert.notStrictEqual(empty.status, 0, 'scan must fail when no evidence files exist');
assert.match(`${empty.stdout}\n${empty.stderr}`, /No production evidence files/i, 'empty scan must explain missing evidence files');

console.log('production evidence scan script validation passed');
