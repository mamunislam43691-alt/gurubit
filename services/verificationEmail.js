/**
 * Branded GURUBIT emails — button only in UI (no visible raw URLs)
 */

const appUrl = () => process.env.APP_URL || 'http://localhost:3000';

function emailShell({ title, bodyHtml, buttonLabel, actionUrl }) {
  const logoUrl = `${appUrl()}/assets/logo.svg`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#020b18;font-family:Segoe UI,Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:linear-gradient(165deg,#0a1e3b 0%,#020b18 100%);padding:32px 12px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:#05162d;border:1px solid rgba(0,210,255,0.25);border-radius:20px;overflow:hidden;">
        <tr><td style="height:4px;background:linear-gradient(90deg,#00d2ff,#3a7bd5,#7c3aed);font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:36px 28px 28px;text-align:center;">
          <img src="${logoUrl}" alt="GURUBIT" width="72" height="72" style="display:block;margin:0 auto 20px;border-radius:16px;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#00d2ff;font-weight:800;">GURUBIT</p>
          <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:800;">${title}</h1>
          ${bodyHtml}
          <table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px auto 0;">
            <tr><td style="border-radius:12px;background:linear-gradient(135deg,#00d2ff,#3a7bd5);">
              <a href="${actionUrl}" target="_blank" style="display:inline-block;padding:16px 36px;color:#020b18;font-size:14px;font-weight:800;text-decoration:none;letter-spacing:0.1em;text-transform:uppercase;">${buttonLabel}</a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#6b7280;">Tap the button above. Do not share this email with anyone.</p>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
          <p style="margin:0;font-size:11px;color:#4b5563;">Powered by Riyad Al Mamun · © ${new Date().getFullYear()} GURUBIT</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildVerificationEmail({ name, verifyUrl }) {
  const displayName = name || 'there';
  const bodyHtml = `
    <p style="margin:0;font-size:15px;line-height:1.65;color:#9ca3af;text-align:center;">
      Hi <strong style="color:#e5e7eb;">${displayName}</strong>, welcome to GURUBIT!<br>
      Confirm your email to start using free SMS verification numbers.
    </p>`;
  return emailShell({
    title: 'Verify your email',
    bodyHtml,
    buttonLabel: 'Activate Now',
    actionUrl: verifyUrl
  });
}

function buildPasswordResetEmail({ name, resetUrl }) {
  const displayName = name || 'there';
  const bodyHtml = `
    <p style="margin:0;font-size:15px;line-height:1.65;color:#9ca3af;text-align:center;">
      Hi <strong style="color:#e5e7eb;">${displayName}</strong>,<br>
      We received a request to reset your GURUBIT password.
    </p>`;
  return emailShell({
    title: 'Reset your password',
    bodyHtml,
    buttonLabel: 'Reset Password',
    actionUrl: resetUrl
  });
}

module.exports = { buildVerificationEmail, buildPasswordResetEmail };
