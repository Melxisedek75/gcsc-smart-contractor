/**
 * Email Templates for GCSC
 * Professional HTML emails for OTP and notifications
 */

const EMAIL_STYLES = `
<style>
body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 0; }
.container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
.header { background: linear-gradient(135deg, #7C3AED, #3B82F6); padding: 40px 30px; text-align: center; }
.header h1 { color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; }
.header p { color: rgba(255,255,255,0.8); font-size: 14px; margin: 8px 0 0; }
.content { padding: 40px 30px; }
.otp-box { background: #f0f7ff; border: 2px solid #3B82F6; border-radius: 12px; padding: 30px; text-align: center; margin: 24px 0; }
.otp-code { font-size: 42px; font-weight: 800; color: #7C3AED; letter-spacing: 8px; font-family: 'Courier New', monospace; }
.otp-label { font-size: 14px; color: #64748b; margin-top: 12px; }
.footer { background: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0; }
.footer p { font-size: 12px; color: #94a3b8; margin: 0; }
.logo { font-size: 20px; font-weight: 800; color: #ffffff; }
.button { display: inline-block; background: linear-gradient(135deg, #7C3AED, #3B82F6); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 16px 0; }
.warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0; }
</style>
`;

function otpEmail({ otp, purpose, expiresMinutes = 10 }) {
  const purposeText = {
    'registration': 'Complete Your Registration',
    'login': 'Login Verification',
    'password_reset': 'Password Reset'
  }[purpose] || 'Verification';

  return `<!DOCTYPE html>
<html>
<head>${EMAIL_STYLES}</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">GCSC</div>
    <h1>${purposeText}</h1>
    <p>Smart Contractor Platform</p>
  </div>
  <div class="content">
    <p style="font-size: 16px; color: #334155; line-height: 1.6;">
      Hello,<br><br>
      Your verification code for <strong>GCSC Smart Contractor</strong> is:
    </p>
    <div class="otp-box">
      <div class="otp-code">${otp}</div>
      <div class="otp-label">Valid for ${expiresMinutes} minutes</div>
    </div>
    <div class="warning">
      <strong>Security Notice:</strong> Never share this code with anyone. GCSC team will never ask for your OTP.
    </div>
    <p style="font-size: 14px; color: #64748b;">
      If you didn't request this code, please ignore this email or contact support.
    </p>
  </div>
  <div class="footer">
    <p>GCSC Smart Contractor &copy; 2026</p>
    <p style="margin-top: 4px;">gcsc.store | Secure Construction Payments</p>
  </div>
</div>
</body>
</html>`;
}

function welcomeEmail({ name, role }) {
  return `<!DOCTYPE html>
<html>
<head>${EMAIL_STYLES}</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">GCSC</div>
    <h1>Welcome to GCSC!</h1>
    <p>Build with Trust. Pay with Confidence.</p>
  </div>
  <div class="content">
    <p style="font-size: 16px; color: #334155; line-height: 1.6;">
      Hello <strong>${name}</strong>,<br><br>
      Your account as a <strong>${role}</strong> has been successfully created on GCSC Smart Contractor.
    </p>
    <p style="font-size: 16px; color: #334155; line-height: 1.6;">
      You can now:<br>
      ${role === 'homeowner' 
        ? '&#10003; Post construction projects<br>&#10003; Receive bids from contractors<br>&#10003; Secure payments with smart contract escrow'
        : '&#10003; Browse available projects<br>&#10003; Place bids on projects<br>&#10003; Get paid securely through escrow'
      }
    </p>
    <div style="text-align: center;">
      <a href="https://gcsc.store" class="button">Go to Dashboard</a>
    </div>
  </div>
  <div class="footer">
    <p>GCSC Smart Contractor &copy; 2026</p>
    <p style="margin-top: 4px;">Programmable escrow for the construction industry</p>
  </div>
</div>
</body>
</html>`;
}

function escrowFundedEmail({ projectTitle, amount, milestoneCount }) {
  return `<!DOCTYPE html>
<html>
<head>${EMAIL_STYLES}</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">GCSC</div>
    <h1>Escrow Funded!</h1>
  </div>
  <div class="content">
    <p style="font-size: 16px; color: #334155; line-height: 1.6;">
      Great news! The escrow for <strong>${projectTitle}</strong> has been funded.
    </p>
    <div class="otp-box" style="background: #ecfdf5; border-color: #10b981;">
      <div style="font-size: 32px; font-weight: 700; color: #059669;">$${amount.toLocaleString()}</div>
      <div class="otp-label">Escrow Amount</div>
    </div>
    <p style="font-size: 16px; color: #334155;">
      <strong>${milestoneCount} milestones</strong> have been set up. Payments will be released as each milestone is completed and approved.
    </p>
  </div>
  <div class="footer">
    <p>GCSC Smart Contractor &copy; 2026</p>
  </div>
</div>
</body>
</html>`;
}

module.exports = {
  otpEmail,
  welcomeEmail,
  escrowFundedEmail
};
