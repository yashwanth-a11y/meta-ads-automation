import { env } from '../config/env.js';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_SENDER_NAME = 'PhotonX GrowthOS';

// Shared Brevo email sender. When BREVO_API_KEY is missing the call is a no-op
// that just logs — keeps local dev working without credentials.
export async function sendEmail({ to, subject, html, text, senderName }) {
  if (!to || !subject || !html) {
    throw new Error('sendEmail requires { to, subject, html }');
  }
  if (!env.BREVO_API_KEY) {
    console.log(`[Email] No BREVO_API_KEY — would send to ${to}\n  Subject: ${subject}`);
    return { skipped: true };
  }
  const body = {
    sender: { name: senderName || DEFAULT_SENDER_NAME, email: env.FROM_EMAIL },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };
  if (text) body.textContent = text;

  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const responseBody = await res.text();
    throw new Error(`Brevo error ${res.status}: ${responseBody}`);
  }
  return { skipped: false };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPasswordResetEmail({ resetLink, expiresAt }) {
  const expiresIn = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000))
    : 60;
  const safeLink = escapeHtml(resetLink);
  const subject = 'Reset your GrowthOS password';
  const html = `<!doctype html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f7;margin:0;padding:24px;color:#1d1d1f">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
      <tr><td>
        <h2 style="margin:0 0 16px;font-size:20px">Reset your password</h2>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.5">
          We received a request to reset the password for your GrowthOS account.
          Click the button below to choose a new one. This link expires in
          about ${expiresIn} minute${expiresIn === 1 ? '' : 's'}.
        </p>
        <p style="margin:24px 0">
          <a href="${safeLink}"
             style="display:inline-block;background:#0a84ff;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px">
            Reset password
          </a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#6e6e73">
          Or copy and paste this URL into your browser:
        </p>
        <p style="margin:0 0 24px;font-size:13px;word-break:break-all">
          <a href="${safeLink}" style="color:#0a84ff">${safeLink}</a>
        </p>
        <p style="margin:0;font-size:12px;color:#86868b">
          If you didn't request this, you can safely ignore this email — your
          password won't be changed.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = `Reset your GrowthOS password

We received a request to reset the password for your GrowthOS account.
Open this link to choose a new password (expires in ~${expiresIn} minute${expiresIn === 1 ? '' : 's'}):

${resetLink}

If you didn't request this, you can safely ignore this email.`;
  return { subject, html, text };
}
