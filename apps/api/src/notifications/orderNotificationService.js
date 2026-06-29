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

async function enqueueDeliveredOrderNotifications(previousOrder, nextOrder, { repository, config = env.notifications } = {}) {
  if (!isFirstDeliveredTransition(previousOrder, nextOrder)) return [];
  const notificationRepository = repository || require('./orderNotificationOutboxRepository');
  return notificationRepository.enqueueMany(nextOrder.orderNumber, 'order_delivered', buildDeliveryNotifications(nextOrder, config));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

module.exports = { buildDeliveryNotifications, enqueueDeliveredOrderNotifications, isFirstDeliveredTransition };
