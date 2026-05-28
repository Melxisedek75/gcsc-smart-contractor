import fs from 'node:fs';
import path from 'node:path';

const root = path.basename(process.cwd()) === 'v3'
  ? process.cwd()
  : path.resolve(process.cwd(), 'v3');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const server = read('pure-server.js');

const checks = [
  {
    ok: server.includes("verificationMode") && server.includes("verification_required"),
    message: 'Registration must support an explicit verification-required mode before issuing a token.',
  },
  {
    ok: server.includes("selectVerificationChannel") &&
      server.includes("role === 'homeowner'") &&
      server.includes("'sms'") &&
      server.includes("'email'"),
    message: 'Verification channel selection must route homeowners to SMS and contractors to email.',
  },
  {
    ok: server.includes("sendSmsVerification") &&
      server.includes("TWILIO_VERIFY_SERVICE_SID") &&
      server.includes("verify.twilio.com"),
    message: 'SMS verification must use Twilio Verify behind env-based configuration.',
  },
  {
    ok: server.includes("POST /api/auth/verification/check") &&
      server.includes("auth.verification.completed"),
    message: 'Backend must expose a verification check endpoint that completes account creation and audits it.',
  },
];

const failed = checks.filter((check) => !check.ok);

if (failed.length) {
  for (const check of failed) {
    console.error(`FAIL: ${check.message}`);
  }
  process.exit(1);
}

console.log('auth channel verification validation passed');
