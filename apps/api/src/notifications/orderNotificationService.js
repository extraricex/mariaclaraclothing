const { env } = require('../config/env');

function isDelivered(order) {
  return ['status', 'fulfillmentStatus', 'deliveryStatus'].some((field) => order?.[field] === 'delivered');
}

function isFirstDeliveredTransition(previousOrder, nextOrder) {
  return !isDelivered(previousOrder) && isDelivered(nextOrder);
}

function buildDeliveryNotifications(order, config = env.notifications) {
  const orderNumber = String(order.orderNumber || 'your order');
  const name = String(order.customer?.fullName || 'Customer').trim();
  const message = `Hi ${name}, your Maria Clara Clothing order ${orderNumber} has been delivered. Thank you for shopping with us.`;
  const subject = `Order ${orderNumber} delivered`;
  const result = [];
  if (String(order.customer?.phone || '').trim()) {
    result.push({ channel: 'sms', recipient: order.customer.phone.trim(), status: config.sms?.configured ? 'pending' : 'skipped', payload: { message } });
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(order.customer?.email || '').trim())) {
    result.push({
      channel: 'email', recipient: order.customer.email.trim(), status: config.email?.configured ? 'pending' : 'skipped',
      payload: { subject, text: message, html: `<p>${escapeHtml(message)}</p>` }
    });
  }
  return result;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function orderConfirmationMessage(order) {
  const name = String(order.customer?.firstName || order.customer?.fullName || 'Customer').trim().split(/\s+/)[0];
  const orderNumber = String(order.orderNumber || '').trim();
  const total = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(order.totalCents || 0) / 100);
  const paid = order.paymentMethod === 'paymongo';
  return {
    subject: paid ? `Payment confirmed — ${orderNumber}` : `Order received — ${orderNumber}`,
    text: paid
      ? `Hi ${name}, your payment for Maria Clara Clothing order ${orderNumber} was confirmed. Total: ${total}. We will prepare it for packing and shipping.`
      : `Hi ${name}, Maria Clara Clothing received your Cash on Delivery order ${orderNumber}. Total: ${total}. We will review it and prepare it for packing and shipping. Please keep your phone reachable.`,
    paid,
    total
  };
}

function buildOrderConfirmationNotifications(order, config = env.notifications) {
  if (!order?.orderNumber || Number(order.totalCents || 0) <= 0) return [];
  if (order.paymentMethod === 'paymongo' && order.paymentStatus !== 'paid') return [];
  if (['cancelled', 'failed', 'expired'].includes(String(order.status || ''))) return [];
  const message = orderConfirmationMessage(order);
  const result = [];
  if (String(order.customer?.phone || '').trim()) {
    result.push({
      channel: 'sms', recipient: order.customer.phone.trim(),
      status: config.sms?.configured ? 'pending' : 'skipped', payload: { message: message.text }
    });
  }
  if (validEmail(order.customer?.email)) {
    result.push({
      channel: 'email', recipient: order.customer.email.trim(),
      status: config.email?.configured ? 'pending' : 'skipped',
      payload: {
        subject: message.subject,
        text: message.text,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#2b211d"><p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase">Maria Clara Clothing</p><h1 style="font-size:24px">${escapeHtml(message.paid ? 'Payment confirmed' : 'Order received')}</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(message.text)}</p><div style="margin-top:20px;padding:16px;background:#f5f0ed"><strong>${escapeHtml(order.orderNumber)}</strong><br>${escapeHtml(message.total)}</div><p style="margin-top:20px;font-size:13px;color:#76665e">Keep this order number for delivery questions. Reply to this email or use the official contact links on our website if you need help.</p></div>`
      }
    });
  }
  return result;
}

async function enqueueOrderConfirmationNotifications(order, { repository, config = env.notifications, client } = {}) {
  const notificationRepository = repository || require('./orderNotificationOutboxRepository');
  const eventName = order.paymentMethod === 'paymongo' ? 'payment_confirmed' : 'order_received';
  return notificationRepository.enqueueMany(
    order.orderNumber,
    eventName,
    buildOrderConfirmationNotifications(order, config),
    { client }
  );
}

async function enqueueDeliveredOrderNotifications(previousOrder, nextOrder, { repository, config = env.notifications } = {}) {
  if (!isFirstDeliveredTransition(previousOrder, nextOrder)) return [];
  const notificationRepository = repository || require('./orderNotificationOutboxRepository');
  return notificationRepository.enqueueMany(nextOrder.orderNumber, 'order_delivered', buildDeliveryNotifications(nextOrder, config));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

module.exports = {
  buildDeliveryNotifications,
  buildOrderConfirmationNotifications,
  enqueueDeliveredOrderNotifications,
  enqueueOrderConfirmationNotifications,
  isFirstDeliveredTransition,
  orderConfirmationMessage
};
