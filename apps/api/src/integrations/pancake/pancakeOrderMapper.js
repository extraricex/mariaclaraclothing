const STATUS_MAP = new Map([
  ['new', { status: 'received', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  ['received', { status: 'received', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  ['confirmed', { status: 'confirmed', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  ['packing', { status: 'packed', fulfillmentStatus: 'packed', deliveryStatus: 'ready' }],
  ['packed', { status: 'packed', fulfillmentStatus: 'packed', deliveryStatus: 'ready' }],
  ['shipped', { status: 'shipped', fulfillmentStatus: 'shipped', deliveryStatus: 'out_for_delivery' }],
  ['delivered', { status: 'delivered', fulfillmentStatus: 'delivered', deliveryStatus: 'delivered' }],
  ['cancelled', { status: 'cancelled', fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' }],
  ['canceled', { status: 'cancelled', fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' }],
  ['returned', { status: 'returned', fulfillmentStatus: 'shipped', deliveryStatus: 'returned' }],
  ['failed', { status: 'failed', fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' }],
  ['unreachable', { status: 'unreachable', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }]
]);

const LOCAL_TO_PANCAKE = {
  received: 'New',
  confirmed: 'Confirmed',
  packed: 'Packing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
  failed: 'Failed',
  unreachable: 'Unreachable',
  other: 'Other'
};

function normalizedKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function mapPancakeStatus(value) {
  const raw = typeof value === 'object' && value !== null ? value.name ?? value.status ?? value.id : value;
  const mapped = STATUS_MAP.get(normalizedKey(raw));
  return mapped || { status: 'other', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' };
}

function centsFromPesos(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function normalizePancakeItem(item = {}) {
  const variation = item.variation_info || item.variation || {};
  return {
    productId: String(variation.product_id || item.product_id || ''),
    variantId: String(variation.id || item.variation_id || ''),
    sku: String(variation.sku || item.sku || ''),
    productName: String(variation.name || item.product_name || item.name || 'Pancake item').trim(),
    size: String(variation.size || item.size || ''),
    quantity: Math.max(1, Math.trunc(Number(item.quantity || 1))),
    unitPriceCents: centsFromPesos(item.price || item.retail_price || variation.retail_price),
    pancakeVariationId: String(variation.id || item.variation_id || '')
  };
}

function normalizePancakeOrder(payload = {}) {
  const pancakeOrderId = String(payload.id ?? payload.order_id ?? '').trim();
  const shipping = payload.shipping_address || {};
  const statusFields = mapPancakeStatus(payload.status_name || payload.status);
  const noteMatch = typeof payload.note === 'string' ? payload.note.match(/Website order ([^\s]+)/) : null;
  const orderNumber = String(payload.custom_id || payload.order_number || noteMatch?.[1] || '').trim();
  const updatedAt = payload.updated_at || payload.modified_at || payload.last_updated_at || '';
  const items = (Array.isArray(payload.items) ? payload.items : []).map(normalizePancakeItem);
  const subtotalCents = items.reduce((sum, item) => sum + Number(item.unitPriceCents || 0) * Number(item.quantity || 0), 0);
  const discountTotalCents = centsFromPesos(payload.total_discount || payload.discount || 0);
  const shippingFeeCents = centsFromPesos(payload.shipping_fee || 0);
  const totalCents = centsFromPesos(payload.total_price || payload.total || 0) || Math.max(0, subtotalCents - discountTotalCents + shippingFeeCents);

  return {
    pancakeOrderId,
    orderNumber,
    pancakeUpdatedAt: updatedAt,
    customer: {
      fullName: String(payload.bill_full_name || payload.customer?.name || '').trim(),
      phone: String(payload.bill_phone_number || payload.customer?.phone || '').trim(),
      email: String(payload.bill_email || payload.customer?.email || '').trim().toLowerCase()
    },
    address: {
      addressLine: String(shipping.full_address || shipping.address || '').trim(),
      houseAddress: String(shipping.address || '').trim(),
      barangay: String(shipping.ward || shipping.barangay || '').trim(),
      city: String(shipping.district || shipping.city || '').trim(),
      province: String(shipping.province || shipping.region || '').trim(),
      country: String(shipping.country || 'Philippines').trim(),
      postalCode: String(shipping.post_code || shipping.postal_code || '').trim()
    },
    items,
    subtotalCents,
    discountTotalCents,
    shippingFeeCents,
    totalCents,
    paymentMethod: 'cash_on_delivery',
    paymentStatus: payload.is_paid || payload.payment_status === 'paid' ? 'paid' : 'cod_pending',
    codConfirmationStatus: 'pending',
    deliveryMethod: String(payload.shipping_partner || payload.delivery_method || 'Standard shipping').trim(),
    trackingNumber: String(payload.tracking_number || payload.shipping_code || '').trim(),
    notes: String(payload.note_print || payload.note || '').trim(),
    channel: 'Pancake POS',
    ...statusFields
  };
}

function buildPancakeOrderUpdatePayload({ order = {}, changedFields = [] } = {}) {
  const fields = new Set(changedFields);
  const payload = {};
  if (fields.has('status') || fields.has('fulfillmentStatus') || fields.has('deliveryStatus')) {
    payload.status = LOCAL_TO_PANCAKE[order.status] || 'Other';
  }
  if (fields.has('trackingNumber')) payload.tracking_number = String(order.trackingNumber || '').trim();
  if (fields.has('customer')) {
    payload.bill_full_name = String(order.customer?.fullName || '').trim();
    payload.bill_phone_number = String(order.customer?.phone || '').trim();
    payload.bill_email = String(order.customer?.email || '').trim().toLowerCase();
  }
  if (fields.has('address')) {
    payload.shipping_address = {
      address: String(order.address?.houseAddress || order.address?.addressLine || '').trim(),
      full_address: String(order.address?.addressLine || '').trim(),
      post_code: String(order.address?.postalCode || '').trim()
    };
  }
  if (fields.has('notes')) payload.note_print = String(order.notes || '').trim();
  if (fields.has('paymentStatus')) payload.payment_status = order.paymentStatus === 'paid' ? 'paid' : 'cod_pending';
  return payload;
}

module.exports = {
  buildPancakeOrderUpdatePayload,
  mapPancakeStatus,
  normalizePancakeOrder
};
