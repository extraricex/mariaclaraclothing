const { env } = require('../src/config/env');
const { verifySmtpConnection } = require('../src/notifications/adminOrderEmail');

async function main() {
  const config = env.notifications.adminOrderEmail;
  if (!config.transportConfigured) {
    console.log('SMTP preflight skipped: transactional SMTP is not configured.');
    return;
  }
  await verifySmtpConnection(config);
  console.log('SMTP preflight passed.');
}

main().catch((error) => {
  const code = String(error?.code || 'SMTP_VERIFY_FAILED').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  console.error(`SMTP preflight failed (${code}${responseCode ? `/${responseCode}` : ''}).`);
  process.exitCode = 1;
});
