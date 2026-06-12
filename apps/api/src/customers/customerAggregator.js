const { normalizePhilippinePhone } = require('../jnt/jntExport');

function customerKey(order) {
  const phone = String(order.customer?.phone || '').trim();
  return normalizePhilippinePhone(phone) || phone;
}

function aggregateCustomers(orders) {
  const byKey = new Map();

  const sorted = [...orders].sort((a, b) => new Date(a.placedAt || 0) - new Date(b.placedAt || 0));

  sorted.forEach((order) => {
    const key = customerKey(order);
    if (!key) return;

    const entry = byKey.get(key) || {
      phone: key,
      fullName: '',
      email: '',
      city: '',
      province: '',
      ordersCount: 0,
      totalSpentCents: 0,
      deliveredCount: 0,
      cancelledCount: 0,
      unreachableCount: 0,
      firstOrderAt: order.placedAt || null,
      lastOrderAt: null
    };

    entry.ordersCount += 1;
    entry.fullName = order.customer?.fullName || entry.fullName;
    entry.email = order.customer?.email || entry.email;
    entry.city = order.address?.city || entry.city;
    entry.province = order.address?.province || entry.province;
    entry.lastOrderAt = order.placedAt || entry.lastOrderAt;

    const cancelled = order.status === 'cancelled';
    const delivered = order.status === 'delivered' ||
      order.fulfillmentStatus === 'delivered' ||
      order.deliveryStatus === 'delivered';

    if (cancelled) entry.cancelledCount += 1;
    if (delivered) entry.deliveredCount += 1;
    if (order.codConfirmationStatus === 'unreachable') entry.unreachableCount += 1;
    if (!cancelled) entry.totalSpentCents += Number(order.totalCents || 0);

    byKey.set(key, entry);
  });

  return [...byKey.values()].sort((a, b) => new Date(b.lastOrderAt || 0) - new Date(a.lastOrderAt || 0));
}

function findCustomerOrders(orders, phone) {
  const target = normalizePhilippinePhone(phone) || String(phone || '').trim();
  if (!target) return [];
  return orders.filter((order) => customerKey(order) === target);
}

module.exports = { aggregateCustomers, customerKey, findCustomerOrders };
