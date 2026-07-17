const { customerFullName, normalizeCustomerName } = require('../../customers/customerName');
const {
  canonicalDeliveryAddress,
  formatDeliveryAddress,
  hasCompleteDeliveryInformation
} = require('../../checkout/deliveryDetails');

const STATUS_MAP = new Map([
  ['new', { status: 'received', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  ['waiting for confirmation', { status: 'received', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  ['received', { status: 'received', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  ['purchased', { status: 'confirmed', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  ['confirmed', { status: 'confirmed', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  ['wait for printing', { status: 'confirmed', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  ['printed', { status: 'confirmed', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  ['packaging', { status: 'packed', fulfillmentStatus: 'packed', deliveryStatus: 'ready' }],
  ['packing', { status: 'packed', fulfillmentStatus: 'packed', deliveryStatus: 'ready' }],
  ['packed', { status: 'packed', fulfillmentStatus: 'packed', deliveryStatus: 'ready' }],
  ['waiting for pick up', { status: 'packed', fulfillmentStatus: 'packed', deliveryStatus: 'ready' }],
  ['shipping', { status: 'shipped', fulfillmentStatus: 'shipped', deliveryStatus: 'out_for_delivery' }],
  ['to ship', { status: 'shipped', fulfillmentStatus: 'shipped', deliveryStatus: 'out_for_delivery' }],
  ['in transit', { status: 'shipped', fulfillmentStatus: 'shipped', deliveryStatus: 'out_for_delivery' }],
  ['shipped', { status: 'shipped', fulfillmentStatus: 'shipped', deliveryStatus: 'out_for_delivery' }],
  ['delivered', { status: 'delivered', fulfillmentStatus: 'delivered', deliveryStatus: 'delivered' }],
  ['collected money', { status: 'delivered', fulfillmentStatus: 'delivered', deliveryStatus: 'delivered' }],
  ['cancelled', { status: 'cancelled', fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' }],
  ['canceled', { status: 'cancelled', fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' }],
  ['returning', { status: 'returned', fulfillmentStatus: 'shipped', deliveryStatus: 'returned' }],
  ['partial return', { status: 'returned', fulfillmentStatus: 'shipped', deliveryStatus: 'returned' }],
  ['returned', { status: 'returned', fulfillmentStatus: 'shipped', deliveryStatus: 'returned' }],
  ['deleted recently', { status: 'cancelled', fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' }],
  ['failed', { status: 'failed', fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' }],
  ['unreachable', { status: 'unreachable', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }]
]);

const PANCAKE_STATUS_BY_ID = new Map([
  [0, STATUS_MAP.get('new')],
  [17, STATUS_MAP.get('waiting for confirmation')],
  [11, { status: 'other', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' }],
  [12, STATUS_MAP.get('wait for printing')],
  [13, STATUS_MAP.get('printed')],
  [20, STATUS_MAP.get('purchased')],
  [1, STATUS_MAP.get('confirmed')],
  [8, STATUS_MAP.get('packaging')],
  [9, STATUS_MAP.get('waiting for pick up')],
  [2, STATUS_MAP.get('shipped')],
  [3, STATUS_MAP.get('delivered')],
  [16, STATUS_MAP.get('collected money')],
  [4, STATUS_MAP.get('returning')],
  [15, STATUS_MAP.get('partial return')],
  [5, STATUS_MAP.get('returned')],
  [6, STATUS_MAP.get('cancelled')],
  [7, STATUS_MAP.get('deleted recently')]
]);

const LOCAL_TO_PANCAKE_STATUS = {
  received: 0,
  confirmed: 1,
  packed: 8,
  shipped: 2,
  delivered: 3,
  cancelled: 6,
  returned: 5,
  failed: 17,
  unreachable: 17
};

function normalizedKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function mapPancakeStatus(value) {
  const raw = typeof value === 'object' && value !== null ? value.id ?? value.status ?? value.name : value;
  const numeric = Number(raw);
  if (Number.isInteger(numeric) && PANCAKE_STATUS_BY_ID.has(numeric)) return PANCAKE_STATUS_BY_ID.get(numeric);
  const mapped = STATUS_MAP.get(normalizedKey(raw));
  return mapped || { status: 'other', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' };
}

function centsFromPesos(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function pesosFromCents(value) {
  const cents = Number(value || 0);
  if (!Number.isFinite(cents)) return 0;
  return Math.max(0, Math.round(cents / 100));
}

function noteMarker(notes, name) {
  const match = String(notes || '').match(new RegExp(`(?:^|\\n)${name}=([^\\n]*)`, 'i'));
  return String(match?.[1] || '').trim();
}

function isPayMongo(order = {}) {
  return String(order.paymentMethod || order.paymentProvider || '').trim().toLowerCase() === 'paymongo';
}

function orderTotalCents(order = {}) {
  const explicit = Number(order.totalCents);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const subtotal = (Array.isArray(order.items) ? order.items : []).reduce(
    (sum, item) => sum + Number(item.unitPriceCents || 0) * Number(item.quantity || 0),
    0
  );
  return Math.max(0, subtotal - Number(order.discountTotalCents || 0) + Number(order.shippingFeeCents || 0));
}

function buildPancakePaymentPayload(order = {}) {
  const totalCents = orderTotalCents(order);
  const total = pesosFromCents(totalCents);
  const paid = order.paymentStatus === 'paid';
  const paymongo = isPayMongo(order);
  const paidAmount = paid ? pesosFromCents(order.paidAmountCents ?? totalCents) : 0;
  return {
    cod: paymongo || paid ? 0 : total,
    transfer_money: paymongo ? paidAmount : 0
  };
}

function buildPancakeOrderNote(order = {}) {
  const payment = buildPancakePaymentPayload(order);
  const lines = [
    order.orderNumber ? `Website order ${order.orderNumber}` : '',
    `checkout_channel=${order.checkoutChannel || 'storefront_checkout'}`,
    `payment_method=${order.paymentMethod || 'cash_on_delivery'}`,
    `payment_status=${order.paymentStatus || 'pending'}`,
    `paid_amount=${payment.transfer_money}`,
    `cod_amount=${payment.cod}`,
    isPayMongo(order) && order.providerPaymentId ? `paymongo_payment_id=${order.providerPaymentId}` : '',
    isPayMongo(order) && order.providerCheckoutSessionId ? `paymongo_checkout_session_id=${order.providerCheckoutSessionId}` : '',
    `website_status=${order.status || 'received'}`
  ];
  return lines.filter(Boolean).join('\n');
}

function buildPancakeOrderFinancialPayload(order = {}) {
  const payment = buildPancakePaymentPayload(order);
  const paymentNote = buildPancakeOrderNote(order);
  return {
    shipping_fee: pesosFromCents(order.shippingFeeCents),
    total_discount: pesosFromCents(order.discountTotalCents),
    is_free_shipping: Boolean(order.freeShippingUnlocked),
    cod: payment.cod,
    transfer_money: payment.transfer_money,
    note: paymentNote,
    note_print: paymentNote
  };
}

function buildPancakeShippingAddress(order = {}) {
  const address = canonicalDeliveryAddress(order.address || {});
  const customer = order.customer || {};
  return {
    full_name: customerFullName(customer),
    phone_number: String(customer.phone || '').trim(),
    address: String(address.houseAddress || '').trim(),
    full_address: formatDeliveryAddress(address),
    commune_name: String(address.barangay || '').trim(),
    district_name: String(address.city || '').trim(),
    province_name: String(address.province || '').trim(),
    post_code: String(address.postalCode || '').trim() || null
  };
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function firstObject(...values) {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  }
  return {};
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
  const partner = firstObject(payload.partner);
  const shippingInfo = {
    ...firstObject(
      payload.shipping_info,
      payload.shipping,
      payload.shipment,
      payload.shipment_info,
      payload.delivery_info,
      payload.delivery,
      payload.logistics,
      payload.logistics_info
    ),
    ...partner
  };
  const shippingStatus = firstText(
    payload.shipping_status,
    payload.delivery_status,
    payload.shipment_status,
    payload.partner_status,
    shippingInfo.shipping_status,
    shippingInfo.delivery_status,
    shippingInfo.shipment_status,
    shippingInfo.partner_status,
    shippingInfo.extend_update?.at?.(-1)?.status,
    shippingInfo.status
  );
  const notes = [payload.note_print, payload.note].filter(Boolean).join('\n');
  const statusFields = { ...mapPancakeStatus(payload.status ?? payload.status_name) };
  const websiteStatus = normalizedKey(noteMarker(notes, 'website_status'));
  if (websiteStatus === 'failed') {
    Object.assign(statusFields, { status: 'failed', fulfillmentStatus: 'cancelled', deliveryStatus: 'cancelled' });
  } else if (websiteStatus === 'unreachable') {
    Object.assign(statusFields, { status: 'unreachable', fulfillmentStatus: 'unfulfilled', deliveryStatus: 'pending' });
  }
  const shippingStatusFields = shippingStatus
    ? mapPancakeStatus(shippingStatus)
    : null;
  const noteMatch = typeof payload.note === 'string' ? payload.note.match(/Website order ([^\s]+)/) : null;
  const orderNumber = String(payload.custom_id || payload.order_number || noteMatch?.[1] || '').trim();
  const updatedAt = payload.updated_at || payload.modified_at || payload.last_updated_at || '';
  const items = (Array.isArray(payload.items) ? payload.items : []).map(normalizePancakeItem);
  const subtotalCents = items.reduce((sum, item) => sum + Number(item.unitPriceCents || 0) * Number(item.quantity || 0), 0);
  const discountTotalCents = centsFromPesos(payload.total_discount || payload.discount || 0);
  const shippingFeeCents = centsFromPesos(payload.shipping_fee || 0);
  const totalCents = centsFromPesos(payload.total_price || payload.total || 0) || Math.max(0, subtotalCents - discountTotalCents + shippingFeeCents);

  const codAmountCents = centsFromPesos(payload.cod_amount ?? payload.cod ?? payload.cash_on_delivery_amount ?? 0);
  const prepaidAmountCents = centsFromPesos(
    Number(payload.transfer_money || 0)
      + Number(payload.charged_by_card || 0)
      + Number(payload.charged_by_qrpay || 0)
      + Number(payload.charged_by_vnpay || 0)
      + Number(payload.charged_by_momo || 0)
  );
  const markedPaymentMethod = noteMarker(notes, 'payment_method');
  const markedPaymentStatus = normalizedKey(noteMarker(notes, 'payment_status'));
  const explicitPaymentStatus = normalizedKey(payload.payment_status || payload.payment?.status);
  const paymentMethod = firstText(
    markedPaymentMethod,
    payload.payment_method,
    payload.payment?.method,
    prepaidAmountCents > 0 && codAmountCents === 0 ? 'online_payment' : 'cash_on_delivery'
  );
  const paymentStatus = payload.is_paid
    || explicitPaymentStatus === 'paid'
    || markedPaymentStatus === 'paid'
    || (prepaidAmountCents > 0 && codAmountCents === 0)
    ? 'paid'
    : paymentMethod === 'cash_on_delivery' ? 'cod_pending' : 'pending_payment';

  const normalizedAddress = canonicalDeliveryAddress({
    houseAddress: firstText(shipping.address, shipping.address_line_1),
    barangay: firstText(
      shipping.commune_name,
      shipping.commnue_name,
      shipping.ward,
      shipping.barangay
    ),
    city: firstText(shipping.district_name, shipping.district, shipping.city),
    province: firstText(shipping.province_name, shipping.province, shipping.region),
    postalCode: firstText(shipping.post_code, shipping.postal_code, shipping.zip_code),
    formattedFullAddress: firstText(shipping.full_address, shipping.new_full_address),
    country: firstText(shipping.country_name, shipping.country) || 'Philippines',
    pancakeProvinceId: firstText(shipping.province_id, shipping.new_province_id),
    pancakeDistrictId: firstText(shipping.district_id),
    pancakeCommuneId: firstText(shipping.commune_id, shipping.new_commune_id)
  });

  return {
    pancakeOrderId,
    orderNumber,
    pancakeUpdatedAt: updatedAt,
    customer: {
      ...normalizeCustomerName({
        fullName: firstText(payload.bill_full_name, shipping.full_name, payload.customer?.name)
      }),
      phone: firstText(payload.bill_phone_number, shipping.phone_number, payload.customer?.phone),
      email: String(payload.bill_email || payload.customer?.email || '').trim().toLowerCase()
    },
    address: normalizedAddress,
    items,
    subtotalCents,
    discountTotalCents,
    shippingFeeCents,
    totalCents,
    codAmountCents,
    prepaidAmountCents,
    paymentMethod,
    paymentStatus,
    codConfirmationStatus: 'pending',
    deliveryMethod: firstText(
      payload.shipping_partner,
      payload.delivery_method,
      payload.courier,
      payload.courier_name,
      payload.carrier,
      payload.carrier_name,
      shippingInfo.shipping_partner,
      shippingInfo.delivery_method,
      shippingInfo.courier,
      shippingInfo.courier_name,
      shippingInfo.carrier,
      shippingInfo.carrier_name,
      shippingInfo.partner_name,
      shippingInfo.delivery_name,
      'Standard shipping'
    ),
    trackingNumber: firstText(
      payload.tracking_number,
      payload.trackingNumber,
      payload.shipping_code,
      payload.shippingCode,
      payload.tracking_code,
      payload.trackingCode,
      payload.tracking_id,
      payload.trackingId,
      payload.waybill,
      payload.waybill_number,
      payload.waybillNumber,
      payload.bill_lading_id,
      payload.billLadingId,
      payload.bill_of_lading,
      payload.billOfLading,
      shippingInfo.tracking_number,
      shippingInfo.trackingNumber,
      shippingInfo.shipping_code,
      shippingInfo.shippingCode,
      shippingInfo.tracking_code,
      shippingInfo.trackingCode,
      shippingInfo.tracking_id,
      shippingInfo.trackingId,
      shippingInfo.waybill,
      shippingInfo.waybill_number,
      shippingInfo.waybillNumber,
      shippingInfo.bill_lading_id,
      shippingInfo.billLadingId,
      shippingInfo.bill_of_lading,
      shippingInfo.billOfLading,
      shippingInfo.extend_code,
      shippingInfo.order_number_vtp,
      shippingInfo.extend_update?.at?.(-1)?.tracking_id
    ),
    estimatedDeliveryAt: firstText(
      payload.estimated_delivery_at,
      payload.estimated_delivery_date,
      shippingInfo.estimated_delivery_at,
      shippingInfo.estimated_delivery_date
    ),
    deliveryNotes: firstText(
      payload.delivery_note,
      payload.delivery_notes,
      shippingInfo.delivery_note,
      shippingInfo.delivery_notes
    ),
    notes: String(payload.note_print || payload.note || '').trim(),
    channel: 'Pancake POS',
    status: statusFields.status,
    fulfillmentStatus: statusFields.fulfillmentStatus,
    deliveryStatus: shippingStatusFields?.deliveryStatus || statusFields.deliveryStatus
  };
}

function buildPancakeOrderUpdatePayload({ order = {}, changedFields = [] } = {}) {
  if (!hasCompleteDeliveryInformation(order)) {
    const error = new Error('Order cannot sync because the delivery address is incomplete.');
    error.code = 'pancake_order_delivery_incomplete';
    throw error;
  }
  const fields = new Set(changedFields);
  const payload = {};
  if (fields.has('status') || fields.has('fulfillmentStatus') || fields.has('deliveryStatus')) {
    const status = LOCAL_TO_PANCAKE_STATUS[order.status];
    if (status !== undefined) payload.status = status;
  }
  if (fields.has('trackingNumber')) {
    payload.partner = { extend_code: String(order.trackingNumber || '').trim() };
  }
  if (fields.has('deliveryMethod')) {
    payload.shipping_partner = String(order.deliveryMethod || '').trim();
  }
  if (fields.has('customer')) {
    payload.bill_full_name = customerFullName(order.customer);
    payload.bill_phone_number = String(order.customer?.phone || '').trim();
    payload.bill_email = String(order.customer?.email || '').trim().toLowerCase();
  }
  if (fields.has('address')) {
    payload.shipping_address = buildPancakeShippingAddress(order);
    // Pancake can recalculate shipping when an address is changed. Always
    // resend the website-owned financial snapshot with an address update so
    // a provider default cannot replace the committed order totals.
    Object.assign(payload, buildPancakeOrderFinancialPayload(order));
  }
  if (!fields.has('address') && (fields.has('paymentStatus') || fields.has('paymentMethod') || fields.has('status'))) {
    payload.note_print = buildPancakeOrderNote(order);
  }
  if (!fields.has('address') && (fields.has('paymentStatus') || fields.has('paymentMethod'))) {
    Object.assign(payload, buildPancakeOrderFinancialPayload(order));
  }
  return payload;
}

module.exports = {
  buildPancakeOrderFinancialPayload,
  buildPancakeOrderNote,
  buildPancakeShippingAddress,
  buildPancakeOrderUpdatePayload,
  buildPancakePaymentPayload,
  mapPancakeStatus,
  normalizePancakeOrder
};
