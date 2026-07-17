const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { customerFullName } = require('../customers/customerName');
const { formatDeliveryAddress } = require('../checkout/deliveryDetails');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function cleanHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function formatMoney(cents) {
  const amount = Number(cents) / 100;
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value) {
  const parsed = new Date(value || Date.now());
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila'
  }).format(safeDate);
}

function readablePaymentMethod(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'cash_on_delivery') return 'Cash on Delivery';
  if (normalized === 'paymongo') return 'PayMongo';
  return normalized ? normalized.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') : 'Not specified';
}

function completeAddress(address = {}) {
  return formatDeliveryAddress(address) || String(address.formattedFullAddress || address.addressLine || '').trim();
}

function safeImageUrl(value, siteUrl) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, `${String(siteUrl || '').replace(/\/$/, '')}/`);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch (_error) {
    return '';
  }
}

function itemVariant(item = {}) {
  return String(item.variantName || item.variant || item.size || '').trim();
}

function readableStatus(value, fallback = 'Pending') {
  const normalized = String(value || '').trim();
  return normalized ? normalized.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}

function buildAdminNewOrderEmail(order, config = {}, options = {}) {
  const orderNumber = cleanHeader(order?.orderNumber);
  const totalCents = Number(order?.totalCents);
  if (!orderNumber) throw new Error('Order number is required for the admin email.');
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error('Order total is invalid for the admin email.');

  const items = Array.isArray(order.items) ? order.items : [];
  const name = customerFullName(order.customer) || 'Not provided';
  const email = String(order.customer?.email || '').trim() || 'Not provided';
  const phone = String(order.customer?.phone || '').trim() || 'Not provided';
  const address = completeAddress(order.address) || 'Not provided';
  const placedAt = formatDate(order.placedAt);
  const paymentMethod = readablePaymentMethod(order.paymentMethod);
  const paymentStatus = readableStatus(order.paymentStatus);
  const orderStatus = readableStatus(order.status);
  const eventName = String(options.eventName || options.event?.eventName || 'admin_new_order');
  const delayed = Boolean(options.delayed ?? options.event?.payload?.delayed);
  const paymentConfirmation = eventName === 'admin_payment_confirmed';
  const subject = paymentConfirmation
    ? `Maria Clara Clothing Payment Confirmed — ${orderNumber}`
    : `${delayed ? 'Delayed Notification — ' : ''}New Maria Clara Clothing Order — ${orderNumber}`;
  const siteUrl = String(config.siteUrl || '').replace(/\/$/, '');
  const adminUrl = `${siteUrl}/admin/orders/${encodeURIComponent(orderNumber)}`;

  const itemRows = items.map((item) => {
    const productName = String(item.productName || item.name || 'Product').trim();
    const variant = itemVariant(item);
    const quantity = Math.max(0, Number(item.quantity || 0));
    const unitPriceCents = Number(item.unitPriceCents || 0);
    const lineTotalCents = Number.isFinite(unitPriceCents) ? unitPriceCents * quantity : 0;
    const imageUrl = safeImageUrl(item.imageUrl || item.image, siteUrl);
    return `<tr>
      <td style="padding:14px 8px;border-bottom:1px solid #eadfd8;vertical-align:top;width:64px">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(productName)}" width="56" height="70" style="display:block;width:56px;height:70px;object-fit:cover;border-radius:8px" />` : ''}</td>
      <td style="padding:14px 8px;border-bottom:1px solid #eadfd8;vertical-align:top">
        <strong style="color:#2b211d">${escapeHtml(productName)}</strong>
        ${item.sku ? `<div style="margin-top:4px;color:#76665e;font-size:13px">SKU: ${escapeHtml(item.sku)}</div>` : ''}
        ${variant ? `<div style="margin-top:4px;color:#76665e;font-size:13px">Size / variant: ${escapeHtml(variant)}</div>` : ''}
        <div style="margin-top:4px;color:#76665e;font-size:13px">Quantity: ${escapeHtml(quantity)}</div>
      </td>
      <td style="padding:14px 8px;border-bottom:1px solid #eadfd8;text-align:right;vertical-align:top;white-space:nowrap">
        <div>₱${formatMoney(unitPriceCents)}</div>
        <div style="margin-top:4px;color:#76665e;font-size:12px">₱${formatMoney(lineTotalCents)} line total</div>
      </td>
    </tr>`;
  }).join('');

  const surchargeCents = Number(order.surchargeCents || order.feeCents || 0);
  const surchargeRow = surchargeCents > 0
    ? `<tr><td style="padding:5px 0;color:#76665e">Additional fee</td><td style="padding:5px 0;text-align:right">₱${formatMoney(surchargeCents)}</td></tr>`
    : '';

  const html = `<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;background:#f5f0ed;font-family:Arial,Helvetica,sans-serif;color:#2b211d">
  <div style="display:none;max-height:0;overflow:hidden">${paymentConfirmation ? 'Payment was confirmed for a Maria Clara Clothing order.' : 'A new Maria Clara Clothing order has been placed.'}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f0ed"><tr><td align="center" style="padding:20px 10px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:14px;overflow:hidden">
      <tr><td style="padding:24px;background:#2b211d;color:#ffffff">
        <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#e8cec0">Maria Clara Clothing</div>
        <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25">${paymentConfirmation ? 'Payment confirmed' : 'New order received'}</h1>
        <p style="margin:8px 0 0;color:#eadfd8">${escapeHtml(orderNumber)} · ${escapeHtml(placedAt)}</p>
      </td></tr>
      <tr><td style="padding:22px">
        ${delayed ? '<p style="margin:0 0 18px;padding:10px 12px;border-radius:8px;background:#fff3cd;color:#5f4b00;font-size:13px"><strong>Delayed notification:</strong> this order was created earlier and is being sent through the audited backfill tool.</p>' : ''}
        <h2 style="margin:0 0 12px;font-size:17px">Customer and delivery</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.55">
          <tr><td style="width:125px;padding:3px 0;color:#76665e">Customer</td><td style="padding:3px 0">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:3px 0;color:#76665e">Email</td><td style="padding:3px 0;overflow-wrap:anywhere">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:3px 0;color:#76665e">Mobile</td><td style="padding:3px 0">${escapeHtml(phone)}</td></tr>
          <tr><td style="padding:3px 0;color:#76665e;vertical-align:top">Delivery address</td><td style="padding:3px 0">${escapeHtml(address)}</td></tr>
          <tr><td style="padding:3px 0;color:#76665e">Barangay</td><td style="padding:3px 0">${escapeHtml(order.address?.barangay || 'Not provided')}</td></tr>
          <tr><td style="padding:3px 0;color:#76665e">City / Municipality</td><td style="padding:3px 0">${escapeHtml(order.address?.city || order.address?.municipality || 'Not provided')}</td></tr>
          <tr><td style="padding:3px 0;color:#76665e">Province</td><td style="padding:3px 0">${escapeHtml(order.address?.province || 'Not provided')}</td></tr>
          <tr><td style="padding:3px 0;color:#76665e">ZIP code</td><td style="padding:3px 0">${escapeHtml(order.address?.postalCode || order.address?.zipCode || 'Not provided')}</td></tr>
        </table>

        <h2 style="margin:24px 0 6px;font-size:17px">Products</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px">${itemRows || '<tr><td style="padding:14px 0;color:#76665e">No product lines were available.</td></tr>'}</table>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;font-size:14px">
          <tr><td style="padding:5px 0;color:#76665e">Subtotal</td><td style="padding:5px 0;text-align:right">₱${formatMoney(order.subtotalCents)}</td></tr>
          <tr><td style="padding:5px 0;color:#76665e">Discount</td><td style="padding:5px 0;text-align:right">−₱${formatMoney(order.discountTotalCents)}</td></tr>
          <tr><td style="padding:5px 0;color:#76665e">Shipping fee</td><td style="padding:5px 0;text-align:right">₱${formatMoney(order.shippingFeeCents)}</td></tr>
          ${surchargeRow}
          <tr><td style="padding:12px 0 5px;border-top:2px solid #2b211d;font-size:17px;font-weight:bold">Total</td><td style="padding:12px 0 5px;border-top:2px solid #2b211d;text-align:right;font-size:17px;font-weight:bold">₱${formatMoney(totalCents)}</td></tr>
        </table>

        <h2 style="margin:24px 0 10px;font-size:17px">Order information</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.55">
          <tr><td style="width:125px;padding:3px 0;color:#76665e">Payment method</td><td style="padding:3px 0">${escapeHtml(paymentMethod)}</td></tr>
          <tr><td style="padding:3px 0;color:#76665e">Payment status</td><td style="padding:3px 0">${escapeHtml(paymentStatus)}</td></tr>
          <tr><td style="padding:3px 0;color:#76665e">Order status</td><td style="padding:3px 0">${escapeHtml(orderStatus)}</td></tr>
          <tr><td style="padding:3px 0;color:#76665e">Pancake sync</td><td style="padding:3px 0">${escapeHtml(readableStatus(order.pancakeSyncStatus || order.pancakeSyncDetail?.syncStatus, 'Pending / not linked'))}</td></tr>
        </table>

        <p style="margin:24px 0 0"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#ad5f43;color:#ffffff;text-decoration:none;font-weight:bold">View order details</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const textItems = items.map((item) => {
    const variant = itemVariant(item);
    return `- ${item.productName || item.name || 'Product'}${variant ? ` (${variant})` : ''} × ${Number(item.quantity || 0)} @ ₱${formatMoney(item.unitPriceCents)}`;
  }).join('\n');
  const text = [
    `${paymentConfirmation ? 'Maria Clara Clothing Payment Confirmed' : 'New Maria Clara Clothing Order'} — ${orderNumber}`,
    ...(delayed ? ['DELAYED NOTIFICATION: This order was created earlier and is being sent through the audited backfill tool.'] : []),
    `Date: ${placedAt}`,
    `Customer: ${name}`,
    `Email: ${email}`,
    `Mobile: ${phone}`,
    `Delivery address: ${address}`,
    `Barangay: ${order.address?.barangay || 'Not provided'}`,
    `City / Municipality: ${order.address?.city || order.address?.municipality || 'Not provided'}`,
    `Province: ${order.address?.province || 'Not provided'}`,
    `ZIP code: ${order.address?.postalCode || order.address?.zipCode || 'Not provided'}`,
    '', 'Products:', textItems || '- No product lines were available.', '',
    `Subtotal: ₱${formatMoney(order.subtotalCents)}`,
    `Discount: -₱${formatMoney(order.discountTotalCents)}`,
    `Shipping fee: ₱${formatMoney(order.shippingFeeCents)}`,
    ...(surchargeCents > 0 ? [`Additional fee: ₱${formatMoney(surchargeCents)}`] : []),
    `Total: ₱${formatMoney(totalCents)}`,
    `Payment method: ${paymentMethod}`,
    `Payment status: ${paymentStatus}`,
    `Order status: ${orderStatus}`,
    `Pancake sync: ${readableStatus(order.pancakeSyncStatus || order.pancakeSyncDetail?.syncStatus, 'Pending / not linked')}`,
    `Admin order details: ${adminUrl}`
  ].join('\n');

  return { subject, html, text };
}

function smtpRetryable(error) {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  if (code === 'EAUTH' || code === 'EENVELOPE' || responseCode >= 500) return false;
  return [
    'ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'EDNS', 'EHOSTUNREACH',
    'ENETUNREACH', 'ESOCKET', 'ETIMEDOUT', 'ETLS'
  ].includes(code)
    || (responseCode >= 400 && responseCode < 500);
}

async function sendAdminNewOrderEmail(order, { config, transport, event } = {}) {
  if (!config?.configured) {
    const error = new Error('Admin order email is not configured.');
    error.code = 'SMTP_NOT_CONFIGURED';
    error.retryable = false;
    throw error;
  }
  const message = buildAdminNewOrderEmail(order, config, {
    event,
    eventName: event?.eventName,
    delayed: event?.payload?.delayed
  });
  const mailer = transport || nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: { user: config.user, pass: config.pass }
  });
  try {
    const result = await mailer.sendMail({
      from: cleanHeader(config.from),
      to: cleanHeader(config.recipient),
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: `<admin-order-${crypto.createHash('sha256').update(`${order.orderNumber}:${event?.eventName || 'admin_new_order'}:${config.recipient || ''}`).digest('hex').slice(0, 32)}@mariaclaraclothing.com>`
    });
    return { providerMessageId: String(result?.messageId || '') };
  } catch (error) {
    error.retryable = smtpRetryable(error);
    throw error;
  }
}

async function sendTransactionalSmtpEmail(event, { config, transport } = {}) {
  if (!config?.configured) {
    const error = new Error('Transactional SMTP email is not configured.');
    error.code = 'SMTP_NOT_CONFIGURED';
    error.retryable = false;
    throw error;
  }
  const recipient = cleanHeader(event?.recipient);
  const subject = cleanHeader(event?.payload?.subject);
  if (!recipient || !subject) {
    const error = new Error('Transactional email recipient or subject is missing.');
    error.retryable = false;
    throw error;
  }
  const mailer = transport || nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: { user: config.user, pass: config.pass }
  });
  try {
    const result = await mailer.sendMail({
      from: cleanHeader(config.from),
      to: recipient,
      subject,
      text: String(event.payload?.text || ''),
      html: String(event.payload?.html || ''),
      messageId: `<customer-${crypto.createHash('sha256').update(String(event.id || `${recipient}:${subject}`)).digest('hex').slice(0, 32)}@mariaclaraclothing.com>`
    });
    return { providerMessageId: String(result?.messageId || '') };
  } catch (error) {
    error.retryable = smtpRetryable(error);
    throw error;
  }
}

module.exports = {
  buildAdminNewOrderEmail,
  completeAddress,
  escapeHtml,
  formatMoney,
  safeImageUrl,
  sendAdminNewOrderEmail,
  sendTransactionalSmtpEmail,
  smtpRetryable
};
