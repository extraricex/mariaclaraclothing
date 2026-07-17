const { listCatalogProducts } = require('../products/catalogPresenter');
const { escapeHtml, sendTransactionalSmtpEmail } = require('../notifications/adminOrderEmail');
const { createCartRecoveryToken, verifyCartRecoveryToken } = require('./cartRecoveryToken');
const {
  claimCartRecoveryEmail,
  completeCartRecoveryEmail,
  findCartSession
} = require('./cartSessionRepository');

const RECOVERY_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function recoveryError(message, status = 400, code = 'CART_RECOVERY_INVALID') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function safeDeliveryError(error) {
  const code = String(error?.code || '').toUpperCase();
  if (code === 'SMTP_NOT_CONFIGURED') return 'Email delivery is not configured.';
  if (code === 'EAUTH') return 'Email provider authentication failed.';
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNRESET'].includes(code)) return 'Email provider connection failed.';
  return 'The reminder email could not be delivered.';
}

function currentCartItems(session, products) {
  const byVariant = new Map();
  const byProductAndSize = new Map();
  for (const product of products || []) {
    for (const variant of product.variants || []) {
      const record = { product, variant };
      byVariant.set(String(variant.id), record);
      byProductAndSize.set(`${product.id}:${String(variant.size || '').toLowerCase()}`, record);
    }
  }

  return (session.items || []).map((savedItem) => {
    const match = byVariant.get(String(savedItem.variantId || ''))
      || byProductAndSize.get(`${savedItem.productId}:${String(savedItem.size || '').toLowerCase()}`);
    if (!match) return null;
    const { product, variant } = match;
    const available = Math.max(0, Math.trunc(Number(variant.stockQuantity || 0)));
    const requested = Math.max(1, Math.trunc(Number(savedItem.quantity || 1)));
    if (!available) return null;
    return {
      productId: product.id,
      slug: product.slug,
      publicHandle: product.publicHandle,
      variantId: variant.id,
      productName: product.name,
      size: variant.size,
      quantity: Math.min(requested, available),
      maxStock: available,
      unitPriceCents: Number(variant.priceCents ?? product.priceCents),
      imageUrl: product.images?.[0]?.url || ''
    };
  }).filter(Boolean);
}

async function recoveredCart(token, { now = Date.now(), products } = {}) {
  const sessionId = verifyCartRecoveryToken(token);
  if (!sessionId) throw recoveryError('This cart recovery link is invalid.', 404);
  const session = await findCartSession(sessionId);
  if (!session || session.status !== 'abandoned_checkout' || session.convertedOrderNumber || !session.recoveryConsent) {
    throw recoveryError('This saved cart is no longer available.', 410, 'CART_RECOVERY_UNAVAILABLE');
  }
  const activityAt = new Date(session.lastActivityAt || session.updatedAt || 0).getTime();
  if (!Number.isFinite(activityAt) || now - activityAt > RECOVERY_TTL_MS) {
    throw recoveryError('This saved cart link has expired.', 410, 'CART_RECOVERY_EXPIRED');
  }
  const currentItems = currentCartItems(session, products || await listCatalogProducts());
  if (!currentItems.length) {
    throw recoveryError('The items in this saved cart are no longer available.', 410, 'CART_RECOVERY_SOLD_OUT');
  }
  return {
    items: currentItems,
    adjusted: currentItems.length !== (session.items || []).length
      || currentItems.some((item, index) => item.quantity !== Number(session.items[index]?.quantity || 0))
  };
}

function recoveryEmail(session, siteUrl) {
  const baseUrl = String(siteUrl || '').replace(/\/$/, '');
  const token = createCartRecoveryToken(session.sessionId);
  const recoveryUrl = `${baseUrl}/cart?restore=${encodeURIComponent(token)}`;
  const subject = 'Your Maria Clara Clothing cart is saved';
  const firstName = String(session.customer?.fullName || '').trim().split(/\s+/)[0] || 'there';
  const text = [
    `Hi ${firstName},`, '',
    'You asked us to save your Maria Clara Clothing cart. You can return to it using the secure link below:',
    recoveryUrl, '',
    'Current price and availability will be confirmed when you check out. This reminder is sent only once.',
    'If you did not request this reminder, you can ignore this email.'
  ].join('\n');
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#f5f0ed;font-family:Arial,Helvetica,sans-serif;color:#2b211d">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="padding:24px;background:#2b211d;color:#fff"><div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#e8cec0">Maria Clara Clothing</div><h1 style="margin:8px 0 0;font-size:24px">Your cart is saved</h1></td></tr>
        <tr><td style="padding:26px"><p style="margin:0 0 14px">Hi ${escapeHtml(firstName)},</p><p style="margin:0 0 20px;line-height:1.6">You asked us to save your cart. Continue where you left off using the secure link below.</p>
          <p style="margin:0 0 22px"><a href="${escapeHtml(recoveryUrl)}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#ad5f43;color:#fff;text-decoration:none;font-weight:bold">Return to my cart</a></p>
          <p style="margin:0;color:#76665e;font-size:13px;line-height:1.6">Current price and availability will be confirmed at checkout. This reminder is sent only once. If you did not request it, simply ignore this email.</p>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
  return { recoveryUrl, subject, text, html };
}

async function sendCartRecoveryEmail(sessionId, { config, send = sendTransactionalSmtpEmail } = {}) {
  const session = await claimCartRecoveryEmail(sessionId);
  if (!session) {
    throw recoveryError('This cart is not eligible for a reminder, or a reminder was already sent.', 409, 'CART_RECOVERY_NOT_ELIGIBLE');
  }
  try {
    const message = recoveryEmail(session, config?.siteUrl);
    const result = await send({
      id: `cart-recovery:${session.sessionId}`,
      recipient: session.customer?.email,
      payload: message
    }, { config });
    const completed = await completeCartRecoveryEmail(session.sessionId, { sent: true });
    if (!completed) throw recoveryError('The email was accepted but its status could not be recorded.', 500, 'CART_RECOVERY_STATUS_FAILED');
    return { status: 'sent', sentAt: completed.recoveryEmailSentAt, providerMessageId: result?.providerMessageId || '' };
  } catch (error) {
    const safeError = safeDeliveryError(error);
    await completeCartRecoveryEmail(session.sessionId, { sent: false, error: safeError }).catch(() => {});
    console.warn(JSON.stringify({
      level: 'warn', event: 'cart_recovery_email_failed', sessionId: session.sessionId,
      code: String(error.code || ''), message: safeError
    }));
    throw recoveryError(safeError, error.status || 502, error.code || 'CART_RECOVERY_DELIVERY_FAILED');
  }
}

module.exports = {
  RECOVERY_TTL_MS,
  currentCartItems,
  recoveredCart,
  recoveryEmail,
  safeDeliveryError,
  sendCartRecoveryEmail
};
