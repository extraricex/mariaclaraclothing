const { escapeHtml, sendTransactionalSmtpEmail } = require('../notifications/adminOrderEmail');
const { findAccountByEmail, normalizeEmail } = require('./customerAccountRepository');
const { consumePasswordReset, createPasswordReset } = require('./customerPasswordResetRepository');

function resetEmail(account, reset, siteUrl) {
  const url = `${String(siteUrl || '').replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(reset.token)}`;
  const subject = 'Reset your Maria Clara Clothing password';
  const text = `Use this secure link to reset your Maria Clara Clothing password:\n\n${url}\n\nThis link expires in 30 minutes and works once. If you did not request it, ignore this email.`;
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5f0ed;font-family:Arial,Helvetica,sans-serif;color:#2b211d"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:12px"><tr><td style="padding:24px;background:#2b211d;color:#fff"><h1 style="margin:0;font-size:23px">Reset your password</h1></td></tr><tr><td style="padding:26px"><p style="line-height:1.6">A password reset was requested for your Maria Clara Clothing account.</p><p style="margin:22px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#ad5f43;color:#fff;text-decoration:none;font-weight:bold">Reset password</a></p><p style="color:#76665e;font-size:13px;line-height:1.6">This link expires in 30 minutes and works once. If you did not request it, ignore this email.</p></td></tr></table></td></tr></table></body></html>`;
  return { url, subject, text, html, recipient: account.email };
}

async function requestCustomerPasswordReset(email, { config, send = sendTransactionalSmtpEmail } = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return { accepted: true };
  const account = await findAccountByEmail(normalizedEmail);
  if (!account) return { accepted: true };
  const reset = await createPasswordReset(account.id);
  const message = resetEmail(account, reset, config?.siteUrl);
  try {
    await send({ id: `password-reset:${reset.id}`, recipient: message.recipient, payload: message }, { config });
  } catch (error) {
    console.warn(JSON.stringify({
      level: 'warn', event: 'customer_password_reset_email_failed', resetId: reset.id,
      code: String(error.code || ''), message: 'Password reset email could not be delivered.'
    }));
  }
  return { accepted: true };
}

async function completeCustomerPasswordReset(token, password) {
  const value = String(password || '');
  if (value.length < 8 || value.length > 200) {
    const error = new Error('Password must be 8 to 200 characters.');
    error.status = 400;
    throw error;
  }
  const result = await consumePasswordReset(token, value);
  if (!result) {
    const error = new Error('This password reset link is invalid or has expired.');
    error.status = 400;
    error.code = 'PASSWORD_RESET_INVALID';
    throw error;
  }
  return result;
}

module.exports = { completeCustomerPasswordReset, requestCustomerPasswordReset, resetEmail };
