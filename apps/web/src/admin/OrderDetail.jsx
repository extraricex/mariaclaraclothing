import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminJson, adminSend } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';
import { loadBarangays, loadCities, loadProvinces } from '../lib/addressGuide.js';
import { adminProductDisplayParts, truncateAdminProductCode } from './adminProductDisplay.js';
import { customerFullName, customerNameParts } from '../lib/customerName.js';
import AdminActionMenu from './AdminActionMenu.jsx';
import AdminConfirmDialog from './AdminConfirmDialog.jsx';
import { checkoutDetailsErrors, formatCheckoutAddress } from '../lib/checkoutValidation.js';

const ENUMS = {
  status: ['received', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned', 'failed', 'unreachable'],
  fulfillmentStatus: ['unfulfilled', 'packed', 'shipped', 'delivered', 'cancelled'],
  paymentStatus: ['cod_pending', 'pending_payment', 'paid', 'failed', 'expired', 'cancelled', 'partially_refunded', 'refunded'],
  codConfirmationStatus: ['pending', 'confirmed', 'unreachable', 'cancelled'],
  deliveryStatus: ['pending', 'ready', 'out_for_delivery', 'delivered', 'returned', 'cancelled']
};

const ENUM_LABELS = {
  status: 'Order status',
  fulfillmentStatus: 'Fulfillment',
  paymentStatus: 'Payment',
  codConfirmationStatus: 'COD confirmation',
  deliveryStatus: 'Delivery'
};

const ORDER_ACTION_STATUSES = [
  ['received', 'New'],
  ['confirmed', 'Confirmed'],
  ['packed', 'Packing'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled'],
  ['returned', 'Returned'],
  ['failed', 'Failed'],
  ['unreachable', 'Unreachable']
];

const CANCELLATION_REASONS = [
  ['', 'Select a reason'],
  ['customer_requested', 'Customer requested cancellation'],
  ['unreachable_customer', 'Customer unreachable'],
  ['duplicate_order', 'Duplicate order'],
  ['payment_failed', 'Payment failed'],
  ['out_of_stock', 'Item became unavailable'],
  ['invalid_address', 'Invalid delivery address'],
  ['fraud_risk', 'Fraud risk'],
  ['other', 'Other']
];

function orderForm(order) {
  const customerName = customerNameParts(order.customer);
  return {
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    codConfirmationStatus: order.codConfirmationStatus,
    deliveryStatus: order.deliveryStatus,
    trackingNumber: order.trackingNumber || '',
    notes: order.notes || '',
    tags: Array.isArray(order.tags) ? order.tags : [],
    deliveryMethod: order.deliveryMethod || 'Standard shipping',
    parcelWeightOverrideGrams: order.parcelWeightOverrideGrams ?? '',
    cancellationReason: order.cancellationReason || '',
    isTestOrder: Boolean(order.isTestOrder),
    customer: {
      ...customerName,
      phone: order.customer?.phone || '',
      email: order.customer?.email || ''
    },
    items: (order.items || []).map((item) => ({
      productId: item.productId || '',
      variantId: item.variantId || '',
      sku: item.sku || '',
      slug: item.slug || '',
      productName: item.productName || '',
      size: item.size || '',
      imageUrl: item.imageUrl || '',
      quantity: Number(item.quantity || 1),
      unitPriceCents: Number(item.unitPriceCents || 0),
      discountCents: Number(item.discountCents || 0),
      stockQuantity: item.stockQuantity
    }))
  };
}

function pesoInputValue(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function titleCase(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayOrderStatus(value) {
  if (value === 'received') return 'New';
  if (value === 'packed') return 'Packing';
  return titleCase(value || 'new');
}

function fallback(value, emptyLabel) {
  const text = String(value || '').trim();
  return text || emptyLabel;
}

function promoTypeLabel(value) {
  return titleCase(value || 'promo');
}

function appliedRuleLabel(rule) {
  if (!rule || typeof rule !== 'object') return 'No tier rule saved';
  const parts = [];
  if (rule.minimumQuantity) parts.push(`${rule.minimumQuantity}+ items`);
  if (rule.discountType) parts.push(titleCase(rule.discountType));
  if (rule.discountValue) parts.push(`${rule.discountValue}%`);
  if (rule.discountValueCents) parts.push(formatMoney(rule.discountValueCents));
  if (rule.freeShipping) parts.push('Free shipping');
  return parts.join(' · ') || 'Tier rule saved';
}

function stockStatusForItem(item) {
  const stock = Number(item.stockQuantity ?? item.inventoryQuantity ?? item.availableQuantity ?? NaN);
  if (Number.isFinite(stock)) {
    if (stock <= 0) return 'Sold out';
    if (stock <= 3) return `Low stock (${stock})`;
    return `In stock (${stock})`;
  }
  return 'Stock not linked';
}

function orderStatusBadge(value, tone = 'neutral') {
  const tones = {
    warning: 'border-[var(--admin-yellow)]/50 bg-[var(--admin-yellow)]/12 text-[#ffd166]',
    success: 'border-[var(--admin-green)]/50 bg-[var(--admin-green)]/12 text-[#7ee787]',
    danger: 'border-[var(--admin-red)]/50 bg-[var(--admin-red)]/12 text-[#ff8b98]',
    neutral: 'border-[var(--admin-blue)]/45 bg-[var(--admin-blue)]/12 text-[#9ecbff]'
  };
  return `order-status-badge inline-flex rounded-[var(--radius-admin)] border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${tones[tone] || tones.neutral}`;
}

function DetailCard({ title, eyebrow, children, className = '' }) {
  return (
    <section className={`admin-order-panel rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel)] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.24)] ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{eyebrow}</p>}
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--admin-text)]">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function InfoRow({ label, value, strong = false }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--admin-line)]/70 py-2 last:border-b-0">
      <dt className="text-xs font-medium text-[var(--admin-muted)]">{label}</dt>
      <dd className={`max-w-[62%] break-words whitespace-normal text-right text-xs ${strong ? 'font-semibold text-[var(--admin-text)]' : 'text-[var(--admin-text)]/80'}`}>{value}</dd>
    </div>
  );
}

function MetricCard({ label, value, tone = 'info' }) {
  const tones = {
    info: 'border-[var(--admin-blue)]/45 bg-[var(--admin-blue)]/10 text-[#9ecbff]',
    success: 'border-[var(--admin-green)]/45 bg-[var(--admin-green)]/10 text-[#7ee787]',
    warning: 'border-[var(--admin-yellow)]/45 bg-[var(--admin-yellow)]/10 text-[#ffd166]',
    danger: 'border-[var(--admin-red)]/45 bg-[var(--admin-red)]/10 text-[#ff8b98]'
  };
  return (
    <article className={`admin-order-metric rounded-[var(--radius-admin)] border p-3 shadow-[0_12px_30px_rgba(0,0,0,0.18)] ${tones[tone] || tones.info}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">{label}</p>
      <p className="mt-2 truncate text-lg font-semibold text-[var(--admin-text)]">{value}</p>
    </article>
  );
}

export default function OrderDetail() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [editAddress, setEditAddress] = useState(false);
  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [addressDraft, setAddressDraft] = useState({ house: '', provinceCode: '', cityCode: '', barangayCode: '', postalCode: '' });
  const [history, setHistory] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [orderProductFilter, setOrderProductFilter] = useState('');
  const [jntPreview, setJntPreview] = useState(null);
  const [refundForm, setRefundForm] = useState({ amount: '', reason: 'others', notes: '' });
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [adminEmailSending, setAdminEmailSending] = useState(false);
  const [pancakeAddressBusy, setPancakeAddressBusy] = useState('');
  const [pancakeGeoOptions, setPancakeGeoOptions] = useState({ provinces: [], districts: [], communes: [] });
  const [pancakeGeoSelection, setPancakeGeoSelection] = useState({ provinceId: '', districtId: '', communeId: '' });

  async function refreshOrder() {
    const body = await adminJson(`/api/admin/orders/${encodeURIComponent(orderNumber)}`);
    setOrder(body.order);
    setForm(orderForm(body.order));
    const mapping = body.order?.pancakeSyncDetail?.addressMapping || {};
    setPancakeGeoSelection({
      provinceId: mapping.province?.id || '',
      districtId: mapping.district?.id || '',
      communeId: mapping.commune?.id || ''
    });
    return body.order;
  }

  useEffect(() => {
    refreshOrder()
      .catch((err) => setMessage(err.message));
  }, [orderNumber]);

  useEffect(() => {
    const query = new URLSearchParams();
    if (pancakeGeoSelection.provinceId) query.set('provinceId', pancakeGeoSelection.provinceId);
    if (pancakeGeoSelection.districtId) query.set('districtId', pancakeGeoSelection.districtId);
    adminJson(`/api/admin/integrations/pancake/geo/options?${query}`)
      .then((body) => setPancakeGeoOptions(body.options || { provinces: [], districts: [], communes: [] }))
      .catch(() => setPancakeGeoOptions({ provinces: [], districts: [], communes: [] }));
  }, [pancakeGeoSelection.provinceId, pancakeGeoSelection.districtId]);

  useEffect(() => {
    const phone = order?.customer?.phone;
    if (!phone) return;
    adminJson(`/api/admin/customers/${encodeURIComponent(phone)}`)
      .then((body) => setHistory(body.customer))
      .catch(() => setHistory(null));
  }, [order?.customer?.phone]);

  useEffect(() => {
    if (editAddress && !provinces.length) loadProvinces().then(setProvinces);
  }, [editAddress, provinces.length]);

  useEffect(() => {
    setCities([]);
    if (addressDraft.provinceCode) loadCities(addressDraft.provinceCode).then(setCities);
  }, [addressDraft.provinceCode]);

  useEffect(() => {
    setBarangays([]);
    if (addressDraft.cityCode) loadBarangays(addressDraft.cityCode).then(setBarangays);
  }, [addressDraft.cityCode]);

  if (!order || !form) {
    return <p className="text-sm text-clay">{message || 'Loading order...'}</p>;
  }

  function updateCustomer(field, value) {
    setIsEditing(true);
    setForm((previous) => {
      const customer = { ...previous.customer, [field]: value };
      if (field === 'firstName' || field === 'lastName') {
        customer.fullName = customerFullName(customer);
      }
      return { ...previous, customer };
    });
  }

  async function startAddressEdit() {
    setIsEditing(true);
    const loadedProvinces = provinces.length ? provinces : await loadProvinces();
    const province = loadedProvinces.find((item) => item.name === String(order.address?.province || '').toUpperCase());
    let loadedCities = [];
    let city = null;
    let loadedBarangays = [];
    let barangay = null;

    if (province) {
      loadedCities = await loadCities(province.code);
      city = loadedCities.find((item) => item.name === String(order.address?.city || '').toUpperCase());
    }
    if (city) {
      loadedBarangays = await loadBarangays(city.code);
      barangay = loadedBarangays.find((item) => item.name === String(order.address?.barangay || '').toUpperCase());
    }

    setProvinces(loadedProvinces);
    setCities(loadedCities);
    setBarangays(loadedBarangays);
    setAddressDraft({
      house: order.address?.houseAddress || '',
      provinceCode: province?.code || '',
      cityCode: city?.code || '',
      barangayCode: barangay?.code || '',
      postalCode: order.address?.postalCode || order.address?.zipCode || ''
    });
    setEditAddress(true);
  }

  async function save(confirmedCancellation = false) {
    setMessage('');
    if (!confirmedCancellation && order.status !== 'cancelled' && form.status === 'cancelled') {
      setCancelConfirmOpen(true);
      return;
    }
    if (confirmedCancellation && !form.cancellationReason) {
      setMessage('Select a cancellation reason before cancelling this order.');
      return;
    }
    const { items: _immutableItems, ...changes } = form;
    changes.customer = form.customer;
    if (editAddress) {
      const province = provinces.find((item) => item.code === addressDraft.provinceCode);
      const city = cities.find((item) => item.code === addressDraft.cityCode);
      const barangay = barangays.find((item) => item.code === addressDraft.barangayCode);
      if (!addressDraft.house.trim() || !province || !city || !barangay) {
        setMessage('Complete all address fields before saving.');
        return;
      }
      if (addressDraft.postalCode.trim() && !/^\d{4}$/.test(addressDraft.postalCode.trim())) {
        setMessage('ZIP code must contain 4 digits or be left blank.');
        return;
      }
      changes.address = {
        houseAddress: addressDraft.house.trim(),
        provinceCode: province.code,
        barangay: barangay.name,
        barangayCode: barangay.code,
        city: city.name,
        cityCode: city.code,
        province: province.name,
        country: 'Philippines',
        postalCode: addressDraft.postalCode.trim()
      };
    }
    setSaving(true);
    try {
      const body = await adminSend('PATCH', `/api/admin/orders/${encodeURIComponent(orderNumber)}`, changes);
      setOrder(body.order);
      setForm(orderForm(body.order));
      setEditAddress(false);
      setIsEditing(false);
      setMessage('Changes saved successfully.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
      setCancelConfirmOpen(false);
    }
  }

  function markAsFulfilled() {
    if (missingDeliveryInformation) {
      setMessage('Complete the customer’s delivery information before processing this order.');
      return;
    }
    setIsEditing(true);
    setForm((previous) => ({
      ...previous,
      status: 'shipped',
      fulfillmentStatus: 'shipped',
      deliveryStatus: previous.deliveryStatus === 'delivered' ? 'delivered' : 'out_for_delivery'
    }));
  }

  function markAsPaid() {
    setIsEditing(true);
    setForm((previous) => ({
      ...previous,
      paymentStatus: 'paid',
      codConfirmationStatus: previous.codConfirmationStatus === 'cancelled' ? 'confirmed' : previous.codConfirmationStatus
    }));
  }

  function setOrderStatusFromAction(nextStatus) {
    if (missingDeliveryInformation && ['confirmed', 'packed', 'shipped', 'delivered'].includes(nextStatus)) {
      setMessage('Complete the customer’s delivery information before processing this order.');
      return;
    }
    setIsEditing(true);
    setForm((previous) => {
      let fulfillmentStatus = previous.fulfillmentStatus;
      let deliveryStatus = previous.deliveryStatus;
      let codConfirmationStatus = previous.codConfirmationStatus;
      if (nextStatus === 'packed') fulfillmentStatus = 'packed';
      if (['shipped', 'delivered', 'cancelled'].includes(nextStatus)) fulfillmentStatus = nextStatus;
      if (nextStatus === 'returned') fulfillmentStatus = 'shipped';
      if (['failed', 'unreachable'].includes(nextStatus)) fulfillmentStatus = 'unfulfilled';
      if (nextStatus === 'delivered') deliveryStatus = 'delivered';
      if (nextStatus === 'cancelled') deliveryStatus = 'cancelled';
      if (nextStatus === 'returned') deliveryStatus = 'returned';
      if (['failed', 'unreachable'].includes(nextStatus)) deliveryStatus = 'pending';
      if (nextStatus === 'unreachable') codConfirmationStatus = 'unreachable';
      if (nextStatus === 'cancelled') codConfirmationStatus = 'cancelled';
      return { ...previous, status: nextStatus, fulfillmentStatus, deliveryStatus, codConfirmationStatus };
    });
  }

  function markAsReturned() {
    setIsEditing(true);
    setForm((previous) => ({
      ...previous,
      status: 'returned',
      deliveryStatus: 'returned',
      fulfillmentStatus: 'shipped'
    }));
  }

  function resetChanges() {
    setForm(orderForm(order));
    setEditAddress(false);
    setIsEditing(false);
    setMessage('Unsaved changes discarded.');
  }

  async function copyOrderNumber() {
    try {
      await navigator.clipboard.writeText(order.orderNumber);
      setMessage('Order number copied.');
    } catch (_error) {
      setMessage(`Order number: ${order.orderNumber}`);
    }
  }

  async function sendTrackingNotification() {
    setMessage('');
    try {
      const body = await adminSend('POST', `/api/admin/orders/${encodeURIComponent(orderNumber)}/tracking-notification`, {
        channel: 'sms'
      });
      setOrder(body.order);
      setForm(orderForm(body.order));
      setMessage('Tracking notification recorded.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function resendAdminEmail() {
    if (adminEmailSending) return;
    setAdminEmailSending(true);
    setMessage('Sending the admin order email...');
    try {
      const body = await adminSend(
        'POST',
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/admin-email/resend`,
        {}
      );
      setOrder(body.order);
      setMessage('Admin order email sent successfully.');
    } catch (error) {
      if (error.body?.details?.adminEmailStatus) {
        setOrder((previous) => ({
          ...previous,
          adminEmailStatus: error.body.details.adminEmailStatus,
          adminEmailError: error.body.details.adminEmailError || ''
        }));
      }
      setMessage(error.message || 'The admin order email could not be sent.');
    } finally {
      setAdminEmailSending(false);
    }
  }

  async function resolvePancakeAddress() {
    if (pancakeAddressBusy) return;
    setPancakeAddressBusy('resolve');
    setMessage('Resolving and verifying the structured Pancake address...');
    try {
      await adminSend('POST', `/api/admin/integrations/pancake/orders/${encodeURIComponent(orderNumber)}/address-mapping/resolve`, {});
      await refreshOrder();
      setMessage('Pancake Province, City / District, Barangay / Commune, phone, and full address were retrieved and verified.');
    } catch (error) {
      await refreshOrder().catch(() => {});
      setMessage(error.message);
    } finally {
      setPancakeAddressBusy('');
    }
  }

  async function savePancakeMapping() {
    if (!pancakeGeoSelection.provinceId || !pancakeGeoSelection.districtId || !pancakeGeoSelection.communeId) {
      setMessage('Select a Pancake Province, City / District, and Barangay / Commune first.');
      return;
    }
    if (!window.confirm('Save this exact Pancake geographic mapping and update the linked order?')) return;
    setPancakeAddressBusy('save');
    setMessage('Saving the verified Pancake location mapping...');
    try {
      await adminSend('PUT', `/api/admin/integrations/pancake/orders/${encodeURIComponent(orderNumber)}/address-mapping`, pancakeGeoSelection);
      setPancakeAddressBusy('resolve');
      await adminSend('POST', `/api/admin/integrations/pancake/orders/${encodeURIComponent(orderNumber)}/address-mapping/resolve`, {});
      await refreshOrder();
      setMessage('Verified Pancake mapping saved and the linked order was retrieved successfully.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setPancakeAddressBusy('');
    }
  }

  async function previewJnt() {
    setMessage('');
    try {
      const body = await adminSend('POST', `/api/admin/orders/${encodeURIComponent(orderNumber)}/jnt/preview`, {});
      setJntPreview(body.preview);
      setMessage(body.preview.ready ? 'J&T parcel data is ready for dry-run review.' : 'Complete the missing parcel fields.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function submitRefund() {
    const amountCents = Math.round(Number(refundForm.amount) * 100);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      setMessage('Enter a valid refund amount.');
      return;
    }
    if (amountCents > remainingRefundCents) {
      setMessage('Refund amount exceeds the remaining refundable payment.');
      return;
    }
    if (!window.confirm(`Submit a ${formatMoney(amountCents)} PayMongo refund? This sends a real provider request and cannot be undone here.`)) return;
    const requestKey = globalThis.crypto?.randomUUID?.() || `refund-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setRefundSubmitting(true);
    setMessage('Submitting refund to PayMongo...');
    try {
      const body = await adminJson(`/api/admin/orders/${encodeURIComponent(orderNumber)}/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey },
        body: JSON.stringify({ amountCents, reason: refundForm.reason, notes: refundForm.notes })
      });
      setOrder((previous) => ({ ...previous, ...body.order, refunds: body.refunds || [] }));
      setForm(orderForm({ ...order, ...body.order }));
      setRefundForm({ amount: '', reason: 'others', notes: '' });
      setMessage(body.warning || `Refund recorded with status: ${titleCase(body.status)}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setRefundSubmitting(false);
    }
  }

  async function retryRefund(refund) {
    if (!window.confirm(`Retry the failed ${formatMoney(refund.amountCents)} refund using its original idempotency key?`)) return;
    setRefundSubmitting(true);
    setMessage('Retrying refund...');
    try {
      const body = await adminSend('POST', `/api/admin/orders/${encodeURIComponent(orderNumber)}/refunds/${encodeURIComponent(refund.id)}/retry`, {});
      setOrder((previous) => ({ ...previous, ...body.order, refunds: body.refunds || [] }));
      setForm(orderForm({ ...order, ...body.order }));
      setMessage(body.warning || `Refund retry recorded with status: ${titleCase(body.status)}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setRefundSubmitting(false);
    }
  }

  const itemCount = form.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const variationCount = new Set(form.items.map((item) => item.variantId || item.sku || item.size || item.productName).filter(Boolean)).size;
  const subtotalCents = form.items.reduce((sum, item) => sum + Number(item.unitPriceCents || 0) * Number(item.quantity || 0), 0);
  const promoSnapshot = order.discountSnapshot || {};
  const discountTotalCents = Math.min(subtotalCents, Math.max(0, Number(order.discountTotalCents || promoSnapshot.discountAmountCents || 0)));
  const shippingFeeCents = Number(order.shippingFeeCents || 0);
  const surchargeCents = Number(order.surchargeCents || 0);
  const discountAwareOrderTotalCents = subtotalCents - discountTotalCents + Number(order.shippingFeeCents || 0);
  const calculatedTotalCents = Math.max(0, discountAwareOrderTotalCents + surchargeCents);
  const storedTotalCents = Number(order.totalCents);
  const totalCents = Number.isInteger(storedTotalCents) && storedTotalCents >= 0
    ? storedTotalCents
    : calculatedTotalCents;
  const paymentSettled = ['paid', 'partially_refunded', 'refunded'].includes(form.paymentStatus);
  const paidCents = paymentSettled ? Number(order.paidAmountCents ?? totalCents) : 0;
  const balanceCents = paymentSettled ? 0 : Math.max(totalCents - paidCents, 0);
  const paymentPending = !paymentSettled;
  const refunds = Array.isArray(order.refunds) ? order.refunds : [];
  const refundedCents = refunds.filter((refund) => refund.status === 'succeeded').reduce((sum, refund) => sum + Number(refund.amountCents || 0), 0);
  const pendingRefundCents = refunds.filter((refund) => ['requesting', 'pending', 'processing'].includes(refund.status)).reduce((sum, refund) => sum + Number(refund.amountCents || 0), 0);
  const remainingRefundCents = Math.max(0, paidCents - refundedCents - pendingRefundCents);
  const refundProvider = order.refundProvider || {};
  const refundMethodSupported = refundProvider.supported !== false;
  const canRefund = order.paymentMethod === 'paymongo' && refundProvider.enabled && refundMethodSupported
    && ['paid', 'partially_refunded'].includes(form.paymentStatus) && remainingRefundCents > 0;
  const unfulfilled = !['shipped', 'delivered', 'cancelled'].includes(form.fulfillmentStatus);
  const isCod = order.paymentMethod === 'cash_on_delivery' || !order.paymentMethod;
  const codAmountCents = isCod ? balanceCents : 0;
  const customerPurchaseValueCents = Number(history?.totalPurchaseValueCents || history?.totalCents || totalCents || 0);
  const previousOrders = Number(history?.ordersCount || 0);
  const lastPurchaseDate = history?.lastPurchaseAt || history?.lastOrderAt || order.placedAt;
  const statusEvents = Array.isArray(order.statusEvents) ? order.statusEvents : [];
  const trackingNotifications = Array.isArray(order.trackingNotifications) ? order.trackingNotifications : [];
  const orderNotifications = Array.isArray(order.notifications) ? order.notifications : [];
  const adminEmailNotifications = orderNotifications.filter((notification) => (
    notification.eventName === 'admin_new_order' || notification.eventName === 'admin_payment_confirmed'
  ));
  const newOrderEmailNotifications = adminEmailNotifications.filter((notification) => notification.eventName === 'admin_new_order');
  const deliveryNotifications = orderNotifications.filter((notification) => ![
    'admin_new_order', 'admin_payment_confirmed'
  ].includes(notification.eventName));
  const adminEmailStatus = order.adminEmailSentAt
    ? 'sent'
    : order.adminEmailStatus || newOrderEmailNotifications[0]?.status || 'not_queued';
  const adminEmailError = order.adminEmailError || newOrderEmailNotifications.find((notification) => notification.lastError)?.lastError || '';
  const canResendAdminEmail = newOrderEmailNotifications.some((notification) => notification.status === 'failed')
    && !order.adminEmailSentAt;
  const metaTrackingStatus = order.metaPurchaseStatus || 'legacy';
  const metaPurchaseValue = Number(order.metaPurchaseValue ?? (Number(order.totalCents || 0) / 100));
  const metaPurchaseCurrency = String(order.metaPurchaseCurrency || order.currency || 'PHP');
  const metaPurchaseValueLabel = Number.isFinite(metaPurchaseValue) && metaPurchaseValue > 0
    ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(metaPurchaseValue)
    : 'Invalid or unavailable';
  const metaDeduplicationStatus = order.metaBrowserPurchaseSentAt && order.metaCapiPurchaseSentAt
    ? 'Browser and server share one event ID'
    : order.metaPurchaseTrackingVersion >= 2
      ? 'Waiting for both eligible sources'
      : 'Legacy order browser replay locked';
  const searchNeedle = orderProductFilter.trim().toLowerCase();
  const visibleItems = searchNeedle
    ? form.items.filter((item) => [item.productName, item.sku, item.size, item.slug].join(' ').toLowerCase().includes(searchNeedle))
    : form.items;
  const canSendTrackingNotification = Boolean(order.exportedToJnt)
    || form.status === 'shipped'
    || form.fulfillmentStatus === 'shipped'
    || form.deliveryStatus === 'out_for_delivery';
  const deliveryErrors = checkoutDetailsErrors(form.customer, order.address || {});
  const missingDeliveryInformation = Object.keys(deliveryErrors).length > 0;
  const fullAddress = formatCheckoutAddress(order.address || {});
  const pancakeSyncDetail = order.pancakeSyncDetail || {};
  const pancakeSyncStatus = pancakeSyncDetail.syncStatus || order.pancakeSyncStatus || order.pancakeOrderSyncStatus || order.pancakeExportStatus || order.syncStatus || '';
  const pancakeSyncErrorCode = pancakeSyncDetail.safeErrorCode || order.pancakeSafeErrorCode || '';
  const pancakeSyncLabel = pancakeSyncErrorCode === 'pancake_order_delivery_incomplete'
    ? 'Blocked — incomplete delivery address'
    : pancakeSyncStatus ? titleCase(pancakeSyncStatus) : 'Not synced to Pancake POS';
  const pancakeProductMappingStatus = pancakeSyncDetail.productMappingStatus || (pancakeSyncDetail.pancakeOrderId ? 'Mapped by saved order link' : 'Not linked to Pancake POS');
  const pancakeInventorySyncStatus = pancakeSyncDetail.inventorySyncStatus || (pancakeSyncStatus === 'synced' ? 'Synced with order' : pancakeSyncLabel);
  const pancakePaymentSyncLabel = titleCase(pancakeSyncDetail.paymentSyncStatus || 'not_synced');
  const pancakeStatusSyncLabel = titleCase(pancakeSyncDetail.statusSyncStatus || 'not_synced');
  const pancakeAddressMapping = pancakeSyncDetail.addressMapping || {};
  const pancakeAddressVerification = pancakeSyncDetail.addressVerification || {};
  const pancakeAddressSnapshot = pancakeSyncDetail.pancakeAddressSnapshot || {};
  const pancakeAddressVerified = pancakeAddressVerification.valid === true;
  const orderMetricCards = [
    ['Order status', displayOrderStatus(form.status), form.status === 'cancelled' ? 'danger' : form.status === 'delivered' ? 'success' : 'info'],
    ['Amount due', formatMoney(balanceCents), balanceCents > 0 ? 'warning' : 'success'],
    ['Total quantity', itemCount, itemCount > 0 ? 'info' : 'warning'],
    ['Payment status', titleCase(form.paymentStatus || 'pending'), paymentPending ? 'danger' : 'success'],
    ['Shipping status', titleCase(form.deliveryStatus || 'pending'), ['delivered', 'out_for_delivery'].includes(form.deliveryStatus) ? 'success' : 'warning'],
    ['Pancake POS sync', pancakeSyncLabel, pancakeSyncStatus ? 'success' : 'warning']
  ];

  return (
    <div className="admin-order-dashboard order-detail-shell order-detail-workspace -m-4 min-h-[calc(100vh-5rem)] bg-[var(--admin-bg)] p-4 pb-36 text-[var(--admin-text)] sm:-m-6 sm:p-6 sm:pb-32">
      <div className="mx-auto w-full max-w-[1540px]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link to="/admin/orders" className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)] hover:text-[var(--admin-orange)]">Orders</Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--admin-text)] sm:text-3xl">{order.orderNumber}</h1>
              <span className={orderStatusBadge(form.status, form.status === 'cancelled' ? 'danger' : 'neutral')}>{displayOrderStatus(form.status)}</span>
              <span className={orderStatusBadge(form.paymentStatus, paymentPending ? 'warning' : 'success')}>{paymentPending ? 'Payment pending' : titleCase(form.paymentStatus)}</span>
              <span className={orderStatusBadge(form.fulfillmentStatus, unfulfilled ? 'warning' : 'success')}>{unfulfilled ? 'Unfulfilled' : titleCase(form.fulfillmentStatus)}</span>
              {form.isTestOrder && <span className={orderStatusBadge('test', 'warning')}>Test order</span>}
            </div>
            <p className="mt-1 text-sm text-[var(--admin-muted)]">
              {order.placedAt ? new Date(order.placedAt).toLocaleString('en-PH') : 'Date unavailable'} from {order.channel || 'Online Store'}
            </p>
          </div>
          <div className="relative flex flex-wrap gap-2">
            <button type="button" className="btn-secondary !border-[var(--admin-line)] !bg-[var(--admin-panel)] !py-2 !text-xs !text-[var(--admin-text)]" onClick={() => window.print()}>Print</button>
            <AdminActionMenu
              label="More actions"
              buttonClassName="btn-secondary !border-[var(--admin-line)] !bg-[var(--admin-panel)] !py-2 !text-xs !text-[var(--admin-text)]"
              disabled={saving}
              items={[
                { label: 'Copy order number', onSelect: copyOrderNumber },
                { label: 'Discard unsaved changes', disabled: !isEditing, onSelect: resetChanges },
                { label: 'View all orders', onSelect: () => navigate('/admin/orders') }
              ]}
            />
            <button type="button" className="btn-secondary !border-[var(--admin-line)] !bg-[var(--admin-panel)] !py-2 !text-xs !text-[var(--admin-text)]" onClick={() => setIsEditing(true)}>{isEditing ? 'Editing' : 'Edit'}</button>
            <button type="button" className="btn-ink !px-5 !py-2 text-xs" disabled={saving} onClick={() => save(false)}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>

        {message && <p className="mt-3 rounded-[var(--radius-admin)] border border-[var(--admin-yellow)]/40 bg-[var(--admin-yellow)]/10 px-3 py-2 text-sm text-[#ffd166]" role="status">{message}</p>}
        {missingDeliveryInformation && (
          <section className="mt-3 rounded-[var(--radius-admin)] border border-[var(--admin-red)]/55 bg-[var(--admin-red)]/12 px-4 py-3 text-sm text-[#ffb0b8]" role="alert">
            <strong className="block">Incomplete delivery address — contact the customer before processing this order.</strong>
            <p className="mt-1 text-xs">Complete the missing information before confirming, packing, shipping, delivering, or syncing this order to Pancake POS.</p>
            <ul className="mt-2 list-disc pl-5 text-xs">
              {Object.values(deliveryErrors).map((error) => <li key={error}>{error}</li>)}
            </ul>
          </section>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {orderMetricCards.map(([label, value, tone]) => (
            <MetricCard key={label} label={label} value={value} tone={tone} />
          ))}
        </div>

        <div className="order-detail-grid order-detail-main-grid mt-5 grid grid-flow-row-dense gap-4 lg:grid-cols-2 xl:grid-cols-12">
          <main className="space-y-4 xl:col-span-7">
            <DetailCard title="Products" className="overflow-hidden">
              <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <input
                  className="field !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]"
                  placeholder="Search products in this order"
                  value={orderProductFilter}
                  onChange={(event) => setOrderProductFilter(event.target.value)}
                />
                <span className="rounded-full border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--admin-muted)]">Number of variations: {variationCount}</span>
                <span className="rounded-full border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--admin-muted)]">Total quantity: {itemCount}</span>
              </div>

              <div className="hidden md:grid rounded-t-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--admin-muted)] md:grid-cols-[64px_minmax(0,1.6fr)_112px_72px_96px_96px_84px] md:gap-3">
                <span>Photo</span>
                <span>Product name</span>
                <span className="text-center">Variant</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Unit price</span>
                <span className="text-right">Total</span>
                <span className="text-right">Action</span>
              </div>
              <div className="space-y-2 md:space-y-0">
                {visibleItems.map((item, index) => (
                  <article key={`${item.sku}-${index}`} className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3 md:rounded-none md:border-t-0">
                    {(() => {
                      const { cleanName, color, size, sku, productCode } = adminProductDisplayParts(item);
                      const fallbackProductCode = truncateAdminProductCode(item.productId || item.slug || '');
                      const stockLabel = stockStatusForItem(item);
                      return (
                    <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 md:grid-cols-[64px_minmax(0,1.6fr)_112px_72px_96px_96px_84px] md:items-center">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="product-photo-blend h-14 w-14 rounded-[var(--radius-admin)] border border-[var(--admin-line)] object-cover" />
                      ) : (
                        <span className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] text-[10px] uppercase text-[var(--admin-muted)]">No image</span>
                      )}
                      <div className="min-w-0">
                        <p title={item.productName} className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--admin-text)]">{cleanName}</p>
                        <div className="mt-1 grid min-w-0 gap-1 text-[11px] text-[var(--admin-muted)] sm:grid-cols-2">
                          <span className="min-w-0 truncate" title={sku || 'No SKU'}>SKU {fallback(sku, 'No SKU')}</span>
                          <span className="hidden min-w-0 truncate sm:block" title={item.productId || item.slug || ''}>Product code {fallback(productCode || fallbackProductCode, 'No code')}</span>
                          <span className={`min-w-0 truncate sm:col-span-2 ${stockLabel.includes('Low') || stockLabel.includes('Sold') ? 'text-[#ffd166]' : ''}`} title={stockLabel}>{stockLabel}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--admin-muted)] md:hidden">
                          <span>Color: {fallback(color, 'No color')}</span>
                          <span>Size: {fallback(size, 'No size')}</span>
                        </div>
                        {(item.discountCents || discountTotalCents) ? <p className="mt-1 text-[11px] font-medium text-[#7ee787]">Promotion applied</p> : null}
                      </div>
                      <div className="hidden min-w-0 text-center md:block">
                        <p className="truncate text-xs font-semibold text-[var(--admin-text)]" title={size || color}>{fallback(size, 'No size')}</p>
                        <p className="mt-1 truncate text-[11px] text-[var(--admin-muted)]" title={color}>Color: {fallback(color, 'No color')}</p>
                      </div>
                      <label className="block text-left md:text-center">
                        <span className="eyebrow md:hidden">Quantity</span>
                        <input className="field !border-[var(--admin-line)] !bg-[var(--admin-panel)] !text-center !text-xs !text-[var(--admin-text)]" type="number" min="1" value={item.quantity} disabled />
                      </label>
                      <label className="block text-right">
                        <span className="eyebrow md:hidden">Unit price</span>
                        <input className="field !border-[var(--admin-line)] !bg-[var(--admin-panel)] !text-right !text-xs !text-[var(--admin-text)]" type="number" min="0" step="0.01" value={pesoInputValue(item.unitPriceCents)} disabled />
                      </label>
                      <div className="flex items-center justify-between gap-3 text-right text-sm font-semibold text-[var(--admin-text)] md:block">
                        <span className="eyebrow md:hidden">Total</span>
                        <span className="block">{formatMoney(Number(item.unitPriceCents || 0) * Number(item.quantity || 0))}</span>
                      </div>
                      <div />
                    </div>
                      );
                    })()}
                  </article>
                ))}
                {!visibleItems.length && <p className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-4 text-sm text-[var(--admin-muted)]">No products match this filter.</p>}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span />
                <button type="button" className="btn-ink !py-2 !text-xs" disabled={missingDeliveryInformation} onClick={markAsFulfilled}>Mark as fulfilled</button>
              </div>
            </DetailCard>

            <DetailCard title="Order value">
              <dl className="space-y-1 text-sm">
                <InfoRow label="Subtotal" value={`${itemCount} item${itemCount === 1 ? '' : 's'} · ${formatMoney(subtotalCents)}`} />
                <InfoRow label="Discount" value={discountTotalCents ? `-${formatMoney(discountTotalCents)}` : formatMoney(0)} />
                <InfoRow label="Shipping fee" value={shippingFeeCents ? formatMoney(shippingFeeCents) : 'Free'} />
                <InfoRow label="Surcharge" value={surchargeCents ? formatMoney(surchargeCents) : formatMoney(0)} />
                <InfoRow label="Free shipping" value={order.freeShippingUnlocked || shippingFeeCents === 0 ? 'Applied' : 'Not applied'} />
                <InfoRow label="COD amount" value={formatMoney(codAmountCents)} />
                <div className="mt-3 rounded-[var(--radius-admin)] border border-[var(--admin-orange)]/35 bg-[var(--admin-orange)]/12 px-4 py-3 text-[var(--admin-text)]">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">Total amount due</span>
                    <strong className="text-xl">{formatMoney(totalCents)}</strong>
                  </div>
                </div>
              </dl>
            </DetailCard>
          </main>

          <aside className="space-y-4 xl:col-span-5 xl:grid xl:grid-cols-5 xl:content-start xl:gap-4 xl:space-y-0">
            <DetailCard title="Payments" className="xl:col-span-2">
              <div className={`rounded-[var(--radius-admin)] border p-3 ${paymentPending ? 'border-[var(--admin-red)]/45 bg-[var(--admin-red)]/10' : 'border-[var(--admin-green)]/45 bg-[var(--admin-green)]/10'}`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${paymentPending ? 'text-[#ff8b98]' : 'text-[#7ee787]'}`}>
                  {paymentPending ? 'Payment incomplete' : 'Payment received'}
                </p>
                <p className="mt-1 text-sm text-[var(--admin-text)]/85">{titleCase(order.paymentMethod || 'cash_on_delivery')}</p>
              </div>
              <dl className="mt-3">
                <InfoRow label="Payment method" value={titleCase(order.paymentMethod || 'cash_on_delivery')} />
                <InfoRow label="Payment status" value={titleCase(form.paymentStatus)} />
                <InfoRow label="PayMongo checkout session" value={order.providerCheckoutSessionId || 'Not applicable'} />
                <InfoRow label="PayMongo payment ID" value={order.providerPaymentId || 'Not available'} />
                <InfoRow label="Payment timestamp" value={order.paidAt ? new Date(order.paidAt).toLocaleString('en-PH') : 'Not paid'} />
                <InfoRow label="Paid amount" value={formatMoney(paidCents)} />
                <InfoRow label="Missing balance" value={formatMoney(balanceCents)} strong={paymentPending} />
                <InfoRow label="Amount due" value={formatMoney(balanceCents)} strong />
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                {order.paymentMethod !== 'paymongo' && <button type="button" className="btn-secondary !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !py-2 !text-xs !text-[var(--admin-text)]" onClick={markAsPaid}>Mark as paid</button>}
                <select disabled={order.paymentMethod === 'paymongo'} className="field !w-auto !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !py-2 !text-xs !text-[var(--admin-text)]" value={form.paymentStatus} onChange={(e) => { setIsEditing(true); setForm((previous) => ({ ...previous, paymentStatus: e.target.value })); }}>
                  {ENUMS.paymentStatus.map((option) => <option key={option} value={option}>{titleCase(option)}</option>)}
                </select>
              </div>
            </DetailCard>

            <DetailCard title="Internal admin notes" eyebrow="Admin only" className="xl:col-span-3">
              <label className="mt-3 block">
                <span className="eyebrow !text-[var(--admin-muted)]">Internal note</span>
                <textarea className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" rows="5" placeholder="Add an internal admin note" value={form.notes} disabled={!isEditing} onChange={(e) => { setIsEditing(true); setForm((previous) => ({ ...previous, notes: e.target.value })); }} />
              </label>
              <p className="mt-2 text-xs text-[var(--admin-muted)]">Visible only to admins. This is not a customer delivery-notes field and is not sent to Pancake POS.</p>
            </DetailCard>

            {order.paymentMethod === 'paymongo' && (
              <DetailCard title="PayMongo refunds" eyebrow={`${titleCase(refundProvider.mode || 'unknown')} mode`} className="xl:col-span-5">
                {refundProvider.paymentMethodType && (
                  <p className="mb-3 text-xs text-[var(--admin-muted)]">
                    Payment channel: <span className="font-semibold text-[var(--admin-text)]">{titleCase(refundProvider.paymentMethodType)}</span>
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--admin-muted)]">Paid</p>
                    <p className="mt-1 font-semibold">{formatMoney(paidCents)}</p>
                  </div>
                  <div className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--admin-muted)]">Refunded</p>
                    <p className="mt-1 font-semibold">{formatMoney(refundedCents)}</p>
                  </div>
                  <div className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--admin-muted)]">Available</p>
                    <p className="mt-1 font-semibold">{refundMethodSupported ? formatMoney(remainingRefundCents) : 'External refund only'}</p>
                  </div>
                </div>

                {!refundProvider.enabled && (
                  <p className="mt-3 rounded-[var(--radius-admin)] border border-[var(--admin-yellow)]/45 bg-[var(--admin-yellow)]/10 p-3 text-xs text-[#ffd166]">
                    Refund submission is disabled in {titleCase(refundProvider.mode || 'unconfigured')} mode. Enable verified PayMongo live credentials before issuing real refunds.
                  </p>
                )}

                {refundProvider.enabled && !refundMethodSupported && (
                  <p className="mt-3 rounded-[var(--radius-admin)] border border-[var(--admin-yellow)]/45 bg-[var(--admin-yellow)]/10 p-3 text-xs text-[#ffd166]">
                    {refundProvider.unavailableReason || 'This payment channel cannot be refunded through PayMongo.'}
                  </p>
                )}

                {canRefund && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="eyebrow !text-[var(--admin-muted)]">Amount (PHP)</span>
                      <input className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" type="number" min="0.01" max={(remainingRefundCents / 100).toFixed(2)} step="0.01" value={refundForm.amount} onChange={(event) => setRefundForm((current) => ({ ...current, amount: event.target.value }))} placeholder={(remainingRefundCents / 100).toFixed(2)} />
                    </label>
                    <label className="block">
                      <span className="eyebrow !text-[var(--admin-muted)]">Reason</span>
                      <select className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" value={refundForm.reason} onChange={(event) => setRefundForm((current) => ({ ...current, reason: event.target.value }))}>
                        <option value="others">Other</option>
                        <option value="duplicate">Duplicate payment</option>
                        <option value="fraudulent">Fraudulent payment</option>
                      </select>
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="eyebrow !text-[var(--admin-muted)]">Provider note</span>
                      <textarea className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" rows="2" maxLength="255" value={refundForm.notes} onChange={(event) => setRefundForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Reason for the refund" />
                    </label>
                    <button type="button" className="btn-ink !py-2 !text-xs sm:col-span-2" disabled={refundSubmitting} onClick={submitRefund}>{refundSubmitting ? 'Submitting...' : 'Submit PayMongo refund'}</button>
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  {refunds.map((refund) => (
                    <article key={refund.id} className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{formatMoney(refund.amountCents)} · {titleCase(refund.reason)}</p>
                        <span className={orderStatusBadge(refund.status, refund.status === 'succeeded' ? 'success' : refund.status === 'failed' ? 'danger' : 'warning')}>{titleCase(refund.status)}</span>
                      </div>
                      <p className="mt-2 break-all text-[var(--admin-muted)]">{refund.paymongoRefundId || 'Provider refund ID pending'}</p>
                      <p className="mt-1 text-[var(--admin-muted)]">{refund.updatedAt ? new Date(refund.updatedAt).toLocaleString('en-PH') : 'Timestamp pending'}{refund.lastErrorCode ? ` · ${titleCase(refund.lastErrorCode)}` : ''}</p>
                      {refund.status === 'failed' && refundProvider.enabled && refundMethodSupported && <button type="button" className="mt-2 text-xs font-semibold text-[var(--admin-orange)] underline" disabled={refundSubmitting} onClick={() => retryRefund(refund)}>Retry safely</button>}
                    </article>
                  ))}
                  {!refunds.length && <p className="text-xs text-[var(--admin-muted)]">No refund requests recorded for this order.</p>}
                </div>
                <p className="mt-3 text-xs text-[var(--admin-muted)]">Refunds do not restock items automatically. Review the return before changing inventory.</p>
              </DetailCard>
            )}

            <DetailCard title="Status history" className="xl:col-span-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">Timeline</p>
              <div className="mt-3 space-y-2">
                {statusEvents.slice(0, 4).map((event) => (
                  <article key={event.id || `${event.source}-${event.createdAt}`} className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3 text-xs">
                    <div className="flex justify-between gap-3">
                      <strong>{titleCase(event.source || 'admin')}</strong>
                      <time className="text-[var(--admin-muted)]">{event.createdAt ? new Date(event.createdAt).toLocaleString('en-PH') : 'Date unavailable'}</time>
                    </div>
                    {Object.entries(event.changes || {}).map(([field, change]) => (
                      <p key={field} className="mt-1 text-[var(--admin-muted)]">{ENUM_LABELS[field] || titleCase(field)}: {titleCase(change.from || 'blank')} to {titleCase(change.to || 'blank')}</p>
                    ))}
                  </article>
                ))}
                {!statusEvents.length && <p className="text-sm text-[var(--admin-muted)]">No status changes recorded yet.</p>}
              </div>
            </DetailCard>
          </aside>

          <aside className="space-y-4 lg:col-span-2 xl:col-span-12 xl:grid xl:grid-cols-12 xl:content-start xl:gap-4 xl:space-y-0">
            <DetailCard title="Information" className="xl:col-span-4">
              <dl>
                <InfoRow label="Order number" value={order.orderNumber} strong />
                <InfoRow label="Created date" value={order.placedAt ? new Date(order.placedAt).toLocaleString('en-PH') : 'Date unavailable'} />
                <InfoRow label="Customer care staff" value="Unassigned" />
                <InfoRow label="Marketer" value="Unassigned" />
                <InfoRow label="Order status" value={displayOrderStatus(form.status)} strong />
                <InfoRow label="Cancellation reason" value={form.cancellationReason ? titleCase(form.cancellationReason) : 'Not cancelled'} />
              </dl>
              <label className="mt-3 flex items-start gap-3 rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3 text-xs text-[var(--admin-text)]">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={form.isTestOrder}
                  disabled={!isEditing}
                  onChange={(event) => { setIsEditing(true); setForm((previous) => ({ ...previous, isTestOrder: event.target.checked })); }}
                />
                <span><strong className="block">Exclude as a test order</strong><span className="mt-1 block text-[var(--admin-muted)]">Test orders stay in operations history but are excluded from revenue, conversion, and best-seller reporting.</span></span>
              </label>
              <label className="mt-3 block">
                <span className="eyebrow !text-[var(--admin-muted)]">Tags</span>
                <input
                  className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]"
                  placeholder="vip, repeat, urgent"
                  value={form.tags.join(', ')}
                  onChange={(e) => {
                    setIsEditing(true);
                    setForm((previous) => ({ ...previous, tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) }));
                  }}
                />
              </label>
            </DetailCard>

            <DetailCard title="Pancake POS sync details" className="xl:col-span-4">
              <dl>
                <InfoRow label="Pancake POS order ID" value={fallback(pancakeSyncDetail.pancakeOrderId, 'Not linked to Pancake POS')} strong={Boolean(pancakeSyncDetail.pancakeOrderId)} />
                <InfoRow label="Sync status" value={pancakeSyncLabel} strong />
                <InfoRow label="Payment sync status" value={pancakePaymentSyncLabel} strong={pancakeSyncDetail.paymentSyncStatus === 'synced'} />
                <InfoRow label="Order status sync" value={pancakeStatusSyncLabel} strong={pancakeSyncDetail.statusSyncStatus === 'synced'} />
                <InfoRow label="Last sync time" value={pancakeSyncDetail.lastSyncedAt ? new Date(pancakeSyncDetail.lastSyncedAt).toLocaleString('en-PH') : 'Never synced'} />
                <InfoRow label="Payment last synced" value={pancakeSyncDetail.paymentLastSyncedAt ? new Date(pancakeSyncDetail.paymentLastSyncedAt).toLocaleString('en-PH') : 'Never synced'} />
                <InfoRow label="Status last synced" value={pancakeSyncDetail.statusLastSyncedAt ? new Date(pancakeSyncDetail.statusLastSyncedAt).toLocaleString('en-PH') : 'Never synced'} />
                <InfoRow label="Last Pancake update time" value={pancakeSyncDetail.lastPancakeUpdatedAt ? new Date(pancakeSyncDetail.lastPancakeUpdatedAt).toLocaleString('en-PH') : 'No Pancake update recorded'} />
                <InfoRow label="Last sync error" value={fallback(pancakeSyncDetail.safeErrorCode, 'No sync error')} />
                <InfoRow label="Payment sync error" value={fallback(pancakeSyncDetail.paymentSyncError, 'No payment sync error')} />
                <InfoRow label="Status sync error" value={fallback(pancakeSyncDetail.statusSyncError, 'No status sync error')} />
                <InfoRow label="Product mapping status" value={pancakeProductMappingStatus} />
                <InfoRow label="Inventory sync status" value={pancakeInventorySyncStatus} />
                <InfoRow label="Address export status" value={titleCase(pancakeSyncDetail.exportStatus || 'not_queued')} />
                <InfoRow label="Address mapping status" value={pancakeAddressMapping.mappingStatus === 'resolved' ? 'Resolved' : 'Needs review'} strong={pancakeAddressMapping.mappingStatus === 'resolved'} />
                <InfoRow label="Pancake Province ID" value={fallback(pancakeAddressMapping.province?.id || pancakeAddressSnapshot.provinceId, 'Not resolved')} />
                <InfoRow label="Pancake Province" value={fallback(pancakeAddressSnapshot.provinceName || pancakeAddressMapping.province?.name, 'Not persisted')} />
                <InfoRow label="Pancake District ID" value={fallback(pancakeAddressMapping.district?.id || pancakeAddressSnapshot.districtId, 'Not resolved')} />
                <InfoRow label="Pancake City / District" value={fallback(pancakeAddressSnapshot.districtName || pancakeAddressMapping.district?.name, 'Not persisted')} />
                <InfoRow label="Pancake Commune ID" value={fallback(pancakeAddressMapping.commune?.id || pancakeAddressSnapshot.communeId, 'Not resolved')} />
                <InfoRow label="Pancake Barangay / Commune" value={fallback(pancakeAddressSnapshot.communeName || pancakeAddressMapping.commune?.name, 'Not persisted')} />
                <InfoRow label="Pancake phone" value={fallback(pancakeAddressSnapshot.phoneNumber, 'Not verified')} />
                <InfoRow label="Pancake full address" value={fallback(pancakeAddressSnapshot.fullAddress, 'Not verified')} />
                <InfoRow label="Persisted structured address" value={pancakeAddressVerified ? 'Verified after Pancake retrieval' : 'Not verified'} strong={pancakeAddressVerified} />
                <InfoRow label="Address verification issues" value={pancakeAddressVerification.issues?.length ? pancakeAddressVerification.issues.join(', ') : 'None'} />
                <InfoRow label="Last address verification" value={pancakeSyncDetail.addressVerifiedAt ? new Date(pancakeSyncDetail.addressVerifiedAt).toLocaleString('en-PH') : 'Never verified'} />
                <InfoRow label="Address mapping error" value={fallback(pancakeSyncDetail.addressMappingError, 'No mapping error')} />
              </dl>
              <div className="mt-4 border-t border-[var(--admin-line)] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--admin-muted)]">Select Pancake location mapping</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <select
                    className="field !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-xs !text-[var(--admin-text)]"
                    value={pancakeGeoSelection.provinceId}
                    onChange={(event) => setPancakeGeoSelection({ provinceId: event.target.value, districtId: '', communeId: '' })}
                  >
                    <option value="">Province</option>
                    {pancakeGeoOptions.provinces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <select
                    className="field !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-xs !text-[var(--admin-text)]"
                    value={pancakeGeoSelection.districtId}
                    disabled={!pancakeGeoSelection.provinceId}
                    onChange={(event) => setPancakeGeoSelection((value) => ({ ...value, districtId: event.target.value, communeId: '' }))}
                  >
                    <option value="">City / District</option>
                    {pancakeGeoOptions.districts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <select
                    className="field !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-xs !text-[var(--admin-text)]"
                    value={pancakeGeoSelection.communeId}
                    disabled={!pancakeGeoSelection.districtId}
                    onChange={(event) => setPancakeGeoSelection((value) => ({ ...value, communeId: event.target.value }))}
                  >
                    <option value="">Barangay / Commune</option>
                    {pancakeGeoOptions.communes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-outline !py-2 !text-xs" disabled={Boolean(pancakeAddressBusy)} onClick={resolvePancakeAddress}>
                    {pancakeAddressBusy === 'resolve' ? 'Resolving...' : 'Resolve Address Again'}
                  </button>
                  <button type="button" className="btn-outline !py-2 !text-xs" disabled={Boolean(pancakeAddressBusy)} onClick={savePancakeMapping}>
                    {pancakeAddressBusy === 'save' ? 'Saving...' : 'Save Verified Mapping'}
                  </button>
                  <button type="button" className="btn-outline !py-2 !text-xs" disabled={Boolean(pancakeAddressBusy)} onClick={startAddressEdit}>Edit Website Address</button>
                  <button type="button" className="btn-ink !py-2 !text-xs" disabled={Boolean(pancakeAddressBusy)} onClick={resolvePancakeAddress}>Retry Pancake Sync</button>
                </div>
              </div>
              {Array.isArray(pancakeSyncDetail.recentLogs) && pancakeSyncDetail.recentLogs.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-[var(--admin-line)] pt-3">
                  {pancakeSyncDetail.recentLogs.slice(0, 2).map((log) => (
                    <article key={log.id || `${log.code}-${log.createdAt}`} className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-2 text-xs">
                      <p className="font-semibold text-[var(--admin-text)]">{titleCase(log.level || 'info')} · {fallback(log.code, 'sync_log')}</p>
                      <p className="mt-1 text-[var(--admin-muted)]">{fallback(log.message, 'Pancake sync event recorded.')}</p>
                    </article>
                  ))}
                </div>
              )}
            </DetailCard>

            <DetailCard title="Customer" className="xl:col-span-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="eyebrow !text-[var(--admin-muted)]">First name</span>
                  <input className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" value={form.customer.firstName} disabled={!isEditing} onChange={(e) => updateCustomer('firstName', e.target.value)} />
                </label>
                <label className="block">
                  <span className="eyebrow !text-[var(--admin-muted)]">Last name</span>
                  <input className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" value={form.customer.lastName} disabled={!isEditing} onChange={(e) => updateCustomer('lastName', e.target.value)} />
                </label>
                <label className="block">
                  <span className="eyebrow !text-[var(--admin-muted)]">Phone number</span>
                  <input className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" value={form.customer.phone} disabled={!isEditing} onChange={(e) => updateCustomer('phone', e.target.value)} />
                </label>
                <label className="block">
                  <span className="eyebrow !text-[var(--admin-muted)]">Email</span>
                  <input className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" type="email" value={form.customer.email} disabled={!isEditing} placeholder="No email provided" onChange={(e) => updateCustomer('email', e.target.value)} />
                </label>
              </div>
              <dl className="mt-3 border-t border-[var(--admin-line)] pt-2">
                <InfoRow label="Gender" value="Not provided" />
                <InfoRow label="Date of birth" value="Not provided" />
                <InfoRow label="Total purchase value" value={formatMoney(customerPurchaseValueCents)} />
                <InfoRow label="Previous orders" value={previousOrders || 'First known order'} />
                <InfoRow label="Last purchase date" value={lastPurchaseDate ? new Date(lastPurchaseDate).toLocaleDateString('en-PH') : 'No previous purchase'} />
              </dl>
            </DetailCard>

            <DetailCard title="Delivery" className="xl:col-span-4">
              <div className="flex items-center justify-between gap-3">
                <span className={orderStatusBadge(form.deliveryStatus)}>{titleCase(form.deliveryStatus || 'pending')}</span>
                <button type="button" className="text-xs font-semibold text-[var(--admin-orange)] underline" onClick={() => editAddress ? setEditAddress(false) : startAddressEdit()}>{editAddress ? 'Cancel edit' : 'Edit address'}</button>
              </div>
              {!editAddress ? (
                <dl className="mt-3">
                  <InfoRow label="Customer name" value={fallback(customerFullName(form.customer), 'No name provided')} />
                  <InfoRow label="Phone number" value={fallback(form.customer.phone, 'No phone provided')} />
                  <InfoRow label="Complete address" value={fallback(fullAddress, 'No address provided')} />
                  <InfoRow label="House / Street" value={fallback(order.address?.houseAddress, 'No house / street')} />
                  <InfoRow label="Barangay" value={fallback(order.address?.barangay, 'No barangay')} />
                  <InfoRow label="City / Municipality" value={fallback(order.address?.city, 'No city')} />
                  <InfoRow label="Province" value={fallback(order.address?.province, 'No province')} />
                  <InfoRow label="ZIP code" value={fallback(order.address?.postalCode || order.address?.zipCode, 'No ZIP code')} />
                  <InfoRow label="Estimated delivery" value={order.estimatedDeliveryAt ? new Date(order.estimatedDeliveryAt).toLocaleDateString('en-PH') : 'Not scheduled'} />
                </dl>
              ) : (
                <div className="mt-3 space-y-3">
                  <label className="block">
                    <span className="eyebrow !text-[var(--admin-muted)]">House / Street</span>
                    <input className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" placeholder="House / street / unit" value={addressDraft.house} disabled={!isEditing} onChange={(e) => setAddressDraft((d) => ({ ...d, house: e.target.value }))} />
                  </label>
                  <select className="field !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" value={addressDraft.provinceCode} disabled={!isEditing} onChange={(e) => setAddressDraft((d) => ({ ...d, provinceCode: e.target.value, cityCode: '', barangayCode: '' }))}>
                    <option value="">Province</option>
                    {provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                  <select className="field !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" value={addressDraft.cityCode} disabled={!isEditing || !cities.length} onChange={(e) => setAddressDraft((d) => ({ ...d, cityCode: e.target.value, barangayCode: '' }))}>
                    <option value="">City / Municipality</option>
                    {cities.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                  <select className="field !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" value={addressDraft.barangayCode} disabled={!isEditing || !barangays.length} onChange={(e) => setAddressDraft((d) => ({ ...d, barangayCode: e.target.value }))}>
                    <option value="">Barangay</option>
                    {barangays.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                  <label className="block">
                    <span className="eyebrow !text-[var(--admin-muted)]">ZIP code (optional)</span>
                    <input className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" inputMode="numeric" maxLength="4" placeholder="Optional 4-digit ZIP code" value={addressDraft.postalCode} disabled={!isEditing} onChange={(e) => setAddressDraft((d) => ({ ...d, postalCode: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
                  </label>
                </div>
              )}
              <div className="mt-3 border-t border-[var(--admin-line)] pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">Billing address</h3>
                <p className="mt-1 text-sm text-[var(--admin-text)]/85">Same as shipping address</p>
              </div>
            </DetailCard>

            <DetailCard title="Shipping" className="xl:col-span-4">
              <label className="block">
                <span className="eyebrow !text-[var(--admin-muted)]">Courier</span>
                <input className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" value={form.deliveryMethod} onChange={(e) => { setIsEditing(true); setForm((previous) => ({ ...previous, deliveryMethod: e.target.value })); }} />
              </label>
              <label className="mt-3 block">
                <span className="eyebrow !text-[var(--admin-muted)]">Tracking number</span>
                <input className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" placeholder="No tracking number yet" value={form.trackingNumber} onChange={(e) => { setIsEditing(true); setForm((previous) => ({ ...previous, trackingNumber: e.target.value })); }} />
              </label>
              <dl className="mt-3">
                <InfoRow label="Package size" value={`${order.parcelWeightGrams || 0} g`} />
                <InfoRow label="Calculated parcel weight" value={`${order.parcelWeightGrams || 0} g`} />
                <InfoRow label="Shipping fee" value={shippingFeeCents ? formatMoney(shippingFeeCents) : 'Free'} />
                <InfoRow label="Shipping status" value={titleCase(form.deliveryStatus || 'pending')} />
              </dl>
              <label className="mt-3 block">
                <span className="eyebrow !text-[var(--admin-muted)]">Parcel weight override (grams)</span>
                <input className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]" type="number" min="1" value={form.parcelWeightOverrideGrams} onChange={(e) => { setIsEditing(true); setForm((previous) => ({ ...previous, parcelWeightOverrideGrams: e.target.value })); }} placeholder="Use calculated weight" />
              </label>
              <div className="mt-3 grid gap-2">
                <button type="button" className="btn-secondary !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !py-2 !text-xs !text-[var(--admin-text)]" onClick={previewJnt}>Preview J&T parcel</button>
                {canSendTrackingNotification && (
                  <button type="button" className="btn-ink !py-2 !text-xs" onClick={sendTrackingNotification}>
                    {trackingNotifications.length ? 'Resend tracking notification' : 'Send tracking notification'}
                  </button>
                )}
              </div>
              {jntPreview && (
                <div className="mt-3 rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3 text-xs">
                  <p className="font-semibold uppercase tracking-[0.1em]">Dry run · J&T readiness · {jntPreview.ready ? 'Ready' : 'Needs information'}</p>
                  {jntPreview.missingFields?.length > 0 && <p className="mt-2 text-[#ff8b98]">Missing: {jntPreview.missingFields.join(', ')}</p>}
                  <p className="mt-2 text-[var(--admin-muted)]">COD {formatMoney(jntPreview.parcel.codAmountCents)} · {jntPreview.parcel.weightKg} kg</p>
                </div>
              )}
            </DetailCard>

            <DetailCard title="Conversion summary" className="xl:col-span-4">
              <p className="text-sm text-[var(--admin-text)]/85">This is their {previousOrders ? `${previousOrders} total order${previousOrders === 1 ? '' : 's'}` : 'first known order'}.</p>
              <p className="mt-1 text-sm text-[var(--admin-muted)]">{history?.deliveredCount || 0} delivered · {history?.cancelledCount || 0} cancelled · {history?.unreachableCount || 0} unreachable</p>
            </DetailCard>

            <DetailCard title="Order risk" className="xl:col-span-4">
              <p className={`inline-flex rounded-[var(--radius-admin)] px-2 py-1 text-xs font-semibold ${history?.cancelledCount > 0 || history?.unreachableCount > 0 ? 'bg-[var(--admin-yellow)]/12 text-[#ffd166]' : 'bg-[var(--admin-green)]/12 text-[#7ee787]'}`}>
                {history?.cancelledCount > 0 || history?.unreachableCount > 0 ? 'Review COD history' : 'No risk flags'}
              </p>
            </DetailCard>

            <DetailCard title="Delivery confirmations" className="xl:col-span-6">
              {deliveryNotifications.length ? deliveryNotifications.map((notification) => (
                <article key={notification.id} className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3 text-sm">
                  <p className="font-semibold">{titleCase(notification.channel)} · {titleCase(notification.status)}</p>
                  <p className="mt-1 text-xs text-[var(--admin-muted)]">{notification.recipient}</p>
                  {notification.lastError && <p className="mt-2 text-xs text-[#ff8b98]">{notification.lastError}</p>}
                </article>
              )) : <p className="text-sm text-[var(--admin-muted)]">Created automatically when the order is first marked delivered.</p>}
            </DetailCard>

            <DetailCard title="Order notifications" className="xl:col-span-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className={orderStatusBadge(
                    adminEmailStatus,
                    adminEmailStatus === 'sent' ? 'success' : adminEmailStatus === 'failed' ? 'danger' : 'warning'
                  )}>{titleCase(adminEmailStatus)}</span>
                  {order.adminEmailSentAt && (
                    <p className="mt-2 text-xs text-[var(--admin-muted)]">
                      Sent {new Date(order.adminEmailSentAt).toLocaleString('en-PH')}
                    </p>
                  )}
                  {adminEmailError && <p className="mt-2 text-xs text-[#ff8b98]">{adminEmailError}</p>}
                  {adminEmailStatus === 'pending' && <p className="mt-2 text-xs text-[var(--admin-muted)]">Queued for automatic delivery.</p>}
                  {adminEmailStatus === 'sending' && <p className="mt-2 text-xs text-[var(--admin-muted)]">Email delivery is in progress.</p>}
                  {adminEmailStatus === 'not_queued' && <p className="mt-2 text-xs text-[var(--admin-muted)]">No admin order email was queued for this order.</p>}
                </div>
                {canResendAdminEmail && (
                  <button
                    type="button"
                    className="btn-ink !py-2 !text-xs"
                    disabled={adminEmailSending}
                    onClick={resendAdminEmail}
                  >
                    {adminEmailSending ? 'Sending...' : 'Resend Order Email'}
                  </button>
                )}
              </div>
              {adminEmailNotifications.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {adminEmailNotifications.map((notification) => (
                    <article key={notification.id} className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[var(--admin-text)]">
                          {notification.eventName === 'admin_payment_confirmed' ? 'Payment Confirmation' : 'New Order'}
                        </p>
                        <span className={orderStatusBadge(
                          notification.status,
                          notification.status === 'sent' ? 'success' : notification.status === 'failed' ? 'danger' : 'warning'
                        )}>{titleCase(notification.status)}</span>
                      </div>
                      <p className="mt-2 break-all text-xs text-[var(--admin-muted)]">{notification.recipient || 'Recipient not configured'}</p>
                      <p className="mt-1 text-xs text-[var(--admin-muted)]">Attempts: {Number(notification.attemptCount || 0)}</p>
                      {notification.sentAt && <p className="mt-1 text-xs text-[var(--admin-muted)]">Sent {new Date(notification.sentAt).toLocaleString('en-PH')}</p>}
                      {notification.lastError && <p className="mt-2 text-xs text-[#ff8b98]">{notification.lastError}</p>}
                    </article>
                  ))}
                </div>
              )}
            </DetailCard>

            <DetailCard title="Meta Purchase tracking" className="xl:col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={orderStatusBadge(
                  metaTrackingStatus,
                  metaTrackingStatus === 'complete' ? 'success' : metaTrackingStatus.includes('failed') ? 'danger' : 'warning'
                )}>{titleCase(metaTrackingStatus)}</span>
                <span className="text-xs text-[var(--admin-muted)]">Admin only</span>
              </div>
              <dl className="mt-3">
                <InfoRow label="Purchase event ID" value={fallback(order.metaPurchaseEventId, 'Not created')} />
                <InfoRow label="Purchase value" value={metaPurchaseValueLabel} />
                <InfoRow label="Currency" value={metaPurchaseCurrency} />
                <InfoRow label="Browser Purchase sent" value={order.metaBrowserPurchaseSentAt ? 'Yes' : 'No'} />
                <InfoRow label="Server Purchase sent" value={order.metaCapiPurchaseSentAt ? 'Yes' : 'No'} />
                <InfoRow label="Browser sent time" value={order.metaBrowserPurchaseSentAt ? new Date(order.metaBrowserPurchaseSentAt).toLocaleString('en-PH') : 'Not sent'} />
                <InfoRow label="Server sent time" value={order.metaCapiPurchaseSentAt ? new Date(order.metaCapiPurchaseSentAt).toLocaleString('en-PH') : 'Not sent'} />
                <InfoRow label="Deduplication" value={metaDeduplicationStatus} />
              </dl>
              {order.metaPurchaseLastError && <p className="mt-3 break-words text-xs text-[#ff8b98]">Last Meta error: {order.metaPurchaseLastError}</p>}
            </DetailCard>

            <DetailCard title="Tracking notifications" className="xl:col-span-6">
              {trackingNotifications.length ? (
                <div className="space-y-2">
                  {trackingNotifications.map((notification) => (
                    <article key={notification.id || notification.createdAt} className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-[var(--admin-text)]">{titleCase(notification.channel || 'sms')} · {titleCase(notification.status || 'recorded')}</p>
                        <time className="text-xs text-[var(--admin-muted)]" dateTime={notification.createdAt || ''}>
                          {notification.createdAt ? new Date(notification.createdAt).toLocaleString('en-PH') : 'Date unavailable'}
                        </time>
                      </div>
                      <p className="mt-2 text-[var(--admin-muted)]">{notification.message || 'Tracking notification recorded.'}</p>
                      {notification.trackingNumber && <p className="mt-2 text-xs uppercase tracking-[0.1em] text-[var(--admin-muted)]">Tracking {notification.trackingNumber}</p>}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--admin-muted)]">No tracking notifications recorded yet.</p>
              )}
            </DetailCard>

            <DetailCard title="Promo snapshot" className="xl:col-span-12">
              {promoSnapshot.promoId || order.discountCode || discountTotalCents ? (
                <dl>
                  <InfoRow label="Name" value={promoSnapshot.name || promoSnapshot.promoId || order.discountCode} />
                  <InfoRow label="Type" value={promoTypeLabel(promoSnapshot.type)} />
                  <InfoRow label="Discount" value={`-${formatMoney(discountTotalCents)}`} strong />
                  <InfoRow label="Free shipping" value={promoSnapshot.freeShippingApplied ? 'Applied' : 'Not applied'} />
                  <InfoRow label="Applied rule" value={appliedRuleLabel(promoSnapshot.appliedRule)} />
                </dl>
              ) : <p className="text-sm text-[var(--admin-muted)]">No promo was applied to this order.</p>}
            </DetailCard>
          </aside>
        </div>
      </div>

      <div className="order-detail-sticky-actions fixed inset-x-0 bottom-0 z-30 border-t border-[var(--admin-line)] bg-[var(--admin-panel)]/95 px-4 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="mx-auto flex max-w-[1540px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-2 gap-3 text-sm sm:flex sm:items-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">Amount due</p>
              <p className="font-semibold text-[var(--admin-text)]">{formatMoney(balanceCents)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">COD amount</p>
              <p className="font-semibold text-[var(--admin-text)]">{formatMoney(codAmountCents)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/orders" className="btn-secondary !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !py-2 !text-xs !text-[var(--admin-text)]">Back to Orders</Link>
            <select className="field !w-auto !min-w-36 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !py-2 !text-xs !text-[var(--admin-text)]" value={form.status || 'received'} onChange={(e) => setOrderStatusFromAction(e.target.value)}>
              {ORDER_ACTION_STATUSES.map(([value, label]) => <option key={value} value={value} disabled={missingDeliveryInformation && ['confirmed', 'packed', 'shipped', 'delivered'].includes(value)}>{label}</option>)}
            </select>
            <button type="button" className="btn-secondary !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !py-2 !text-xs !text-[var(--admin-text)]" onClick={markAsReturned}>Returned</button>
            <button type="button" className="btn-secondary !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !py-2 !text-xs !text-[var(--admin-text)]" onClick={() => window.print()}>Print</button>
            <button type="button" className="btn-ink !px-5 !py-2 !text-xs" disabled={saving} onClick={() => save(false)}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </div>
      <AdminConfirmDialog
        open={cancelConfirmOpen}
        title={`Cancel ${order.orderNumber}?`}
        description="This saves the order as Cancelled, restores committed stock once, and queues cancellation for the linked Pancake POS order."
        warning="Cancelled orders cannot be reopened. The local change is retained if Pancake is temporarily unavailable, and its sync remains queued for retry."
        confirmLabel="Cancel order"
        danger
        busy={saving}
        onCancel={() => setCancelConfirmOpen(false)}
        onConfirm={() => save(true)}
      >
        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--admin-muted)]">Cancellation reason</span>
          <select
            className="field mt-1 !border-[var(--admin-line)] !bg-[var(--admin-panel-soft)] !text-[var(--admin-text)]"
            value={form.cancellationReason}
            onChange={(event) => setForm((previous) => ({ ...previous, cancellationReason: event.target.value }))}
          >
            {CANCELLATION_REASONS.map(([value, label]) => <option key={value || 'blank'} value={value}>{label}</option>)}
          </select>
        </label>
      </AdminConfirmDialog>
    </div>
  );
}
