import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminJson, adminSend } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';
import { loadBarangays, loadCities, loadProvinces } from '../lib/addressGuide.js';

const ENUMS = {
  status: ['received', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'],
  fulfillmentStatus: ['unfulfilled', 'packed', 'shipped', 'delivered', 'cancelled'],
  paymentStatus: ['cod_pending', 'paid', 'cancelled', 'refunded'],
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

function orderForm(order) {
  return {
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    codConfirmationStatus: order.codConfirmationStatus,
    deliveryStatus: order.deliveryStatus,
    trackingNumber: order.trackingNumber || '',
    notes: order.notes || '',
    parcelWeightOverrideGrams: order.parcelWeightOverrideGrams ?? '',
    customer: {
      fullName: order.customer?.fullName || '',
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
      unitPriceCents: Number(item.unitPriceCents || 0)
    }))
  };
}

function emptyItem() {
  return {
    productId: '',
    variantId: '',
    sku: '',
    slug: '',
    productName: '',
    size: '',
    imageUrl: '',
    quantity: 1,
    unitPriceCents: 0
  };
}

function pesoInputValue(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function titleCase(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function orderStatusBadge(value, tone = 'neutral') {
  const tones = {
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    danger: 'border-red-200 bg-red-50 text-red-800',
    neutral: 'border-line bg-cream text-ink-soft'
  };
  return `order-status-badge inline-flex rounded-[var(--radius-admin)] border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.08em] ${tones[tone] || tones.neutral}`;
}

export default function OrderDetail() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [editAddress, setEditAddress] = useState(false);
  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [addressDraft, setAddressDraft] = useState({ house: '', provinceCode: '', cityCode: '', barangayCode: '' });
  const [history, setHistory] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [jntPreview, setJntPreview] = useState(null);

  useEffect(() => {
    adminJson(`/api/admin/orders/${encodeURIComponent(orderNumber)}`)
      .then((body) => {
        setOrder(body.order);
        setForm(orderForm(body.order));
      })
      .catch((err) => setMessage(err.message));
  }, [orderNumber]);

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

  useEffect(() => {
    if (!showProductPicker) return;
    const params = new URLSearchParams();
    if (productSearchQuery.trim()) params.set('q', productSearchQuery.trim());
    params.set('sort', 'name_asc');
    let ignore = false;
    setProductSearchLoading(true);
    adminJson(`/api/admin/products?${params}`)
      .then((body) => {
        if (!ignore) setProductSearchResults(body.products || []);
      })
      .catch((err) => {
        if (!ignore) {
          setProductSearchResults([]);
          setMessage(err.message);
        }
      })
      .finally(() => {
        if (!ignore) setProductSearchLoading(false);
      });
    return () => { ignore = true; };
  }, [showProductPicker, productSearchQuery]);

  if (!order || !form) {
    return <p className="text-sm text-clay">{message || 'Loading order…'}</p>;
  }

  function updateCustomer(field, value) {
    setForm((previous) => ({
      ...previous,
      customer: { ...previous.customer, [field]: value }
    }));
  }

  function updateItem(index, field, value) {
    setForm((previous) => ({
      ...previous,
      items: previous.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item)
    }));
  }

  function removeItem(index) {
    setForm((previous) => ({
      ...previous,
      items: previous.items.filter((_item, itemIndex) => itemIndex !== index)
    }));
  }

  function addItem() {
    setIsEditing(true);
    setShowProductPicker(true);
    setProductSearchQuery('');
  }

  function selectCatalogVariant(product, variant) {
    setIsEditing(true);
    setForm((previous) => ({
      ...previous,
      items: [
        ...previous.items,
        {
          productId: product.id || product.slug || '',
          variantId: variant.id || '',
          sku: variant.sku || '',
          slug: product.slug || '',
          productName: product.name || '',
          size: variant.size || '',
          imageUrl: product.image || '',
          quantity: 1,
          unitPriceCents: Number(variant.priceCents || product.priceCents || 0)
        }
      ]
    }));
    setShowProductPicker(false);
    setProductSearchQuery('');
    setProductSearchResults([]);
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
      barangayCode: barangay?.code || ''
    });
    setEditAddress(true);
  }

  async function save() {
    setMessage('');
    const changes = { ...form };
    changes.customer = form.customer;
    changes.items = form.items.map((item) => ({
      ...item,
      quantity: Number(item.quantity || 0),
      unitPriceCents: Number(item.unitPriceCents || 0)
    }));
    if (editAddress) {
      const province = provinces.find((item) => item.code === addressDraft.provinceCode);
      const city = cities.find((item) => item.code === addressDraft.cityCode);
      const barangay = barangays.find((item) => item.code === addressDraft.barangayCode);
      if (!addressDraft.house.trim() || !province || !city || !barangay) {
        setMessage('Complete all address fields before saving.');
        return;
      }
      changes.address = {
        addressLine: `${addressDraft.house.trim()}, ${barangay.name}, ${city.name}, ${province.name}, Philippines`,
        houseAddress: addressDraft.house.trim(),
        barangay: barangay.name,
        city: city.name,
        province: province.name,
        country: 'Philippines',
        postalCode: order.address?.postalCode || ''
      };
    }
    try {
      const body = await adminSend('PATCH', `/api/admin/orders/${encodeURIComponent(orderNumber)}`, changes);
      setOrder(body.order);
      setForm(orderForm(body.order));
      setEditAddress(false);
      setIsEditing(false);
      setMessage('Changes saved successfully.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  function markAsFulfilled() {
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

  function resetChanges() {
    setForm(orderForm(order));
    setEditAddress(false);
    setIsEditing(false);
    setShowActions(false);
    setMessage('Unsaved changes discarded.');
  }

  async function copyOrderNumber() {
    setShowActions(false);
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

  const itemCount = form.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const subtotalCents = form.items.reduce((sum, item) => sum + Number(item.unitPriceCents || 0) * Number(item.quantity || 0), 0);
  const promoSnapshot = order.discountSnapshot || {};
  const discountTotalCents = Math.min(subtotalCents, Math.max(0, Number(order.discountTotalCents || promoSnapshot.discountAmountCents || 0)));
  const totalCents = Math.max(0, subtotalCents - discountTotalCents + Number(order.shippingFeeCents || 0));
  const paidCents = form.paymentStatus === 'paid' ? totalCents : 0;
  const balanceCents = Math.max(totalCents - paidCents, 0);
  const paymentPending = form.paymentStatus !== 'paid';
  const unfulfilled = !['shipped', 'delivered', 'cancelled'].includes(form.fulfillmentStatus);
  const addressLines = [
    form.customer.fullName,
    order.address?.houseAddress,
    order.address?.barangay,
    order.address?.city,
    order.address?.province,
    order.address?.country || 'Philippines',
    form.customer.phone
  ].filter(Boolean);
  const statusEvents = Array.isArray(order.statusEvents) ? order.statusEvents : [];
  const trackingNotifications = Array.isArray(order.trackingNotifications) ? order.trackingNotifications : [];
  const deliveryNotifications = Array.isArray(order.notifications) ? order.notifications : [];
  const canSendTrackingNotification = Boolean(order.exportedToJnt)
    || form.status === 'shipped'
    || form.fulfillmentStatus === 'shipped'
    || form.deliveryStatus === 'out_for_delivery';

  return (
    <div className="order-detail-shell mx-auto w-full max-w-[1380px]">
      <Link to="/admin/orders" className="text-xs font-semibold uppercase tracking-[0.12em] text-clay hover:text-accent">Orders</Link>
      <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="display text-2xl sm:text-3xl">{order.orderNumber}</h1>
            {paymentPending && <span className={orderStatusBadge(form.paymentStatus, 'warning')}>Payment pending</span>}
            {!paymentPending && <span className={orderStatusBadge(form.paymentStatus, 'success')}>Paid</span>}
            {unfulfilled && <span className={orderStatusBadge(form.fulfillmentStatus, 'warning')}>Unfulfilled</span>}
            {!unfulfilled && <span className={orderStatusBadge(form.fulfillmentStatus, 'success')}>{titleCase(form.fulfillmentStatus)}</span>}
          </div>
          <p className="mt-2 text-sm text-clay">
            {order.placedAt ? new Date(order.placedAt).toLocaleString('en-PH') : 'Date unavailable'} from {order.channel || 'Online Store'}
          </p>
        </div>
        <div className="relative flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => window.print()}>Print</button>
          <button type="button" className="btn-secondary" onClick={() => setShowActions((value) => !value)}>More actions</button>
          {showActions && (
            <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-[var(--radius-admin)] border border-line bg-paper p-2 text-sm shadow-lg">
              <button type="button" className="block w-full rounded-[var(--radius-admin)] px-3 py-2 text-left hover:bg-cream" onClick={copyOrderNumber}>Copy order number</button>
              <button type="button" className="block w-full rounded-[var(--radius-admin)] px-3 py-2 text-left hover:bg-cream" onClick={resetChanges}>Discard unsaved changes</button>
              <Link className="block rounded-[var(--radius-admin)] px-3 py-2 text-left hover:bg-cream" to="/admin/orders" onClick={() => setShowActions(false)}>View all orders</Link>
            </div>
          )}
          <button type="button" className="btn-secondary" onClick={() => setIsEditing(true)}>{isEditing ? 'Editing' : 'Edit'}</button>
          <button type="button" className="btn-ink !px-5 !py-2.5 text-xs" onClick={save}>Save changes</button>
        </div>
      </div>
      {message && <p className="mt-3 text-sm text-accent-deep" role="status">{message}</p>}

      <div className="order-detail-grid mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="space-y-5">
          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={orderStatusBadge(form.fulfillmentStatus, unfulfilled ? 'warning' : 'success')}>
                {unfulfilled ? 'Unfulfilled' : titleCase(form.fulfillmentStatus)}
              </span>
              <span className={orderStatusBadge(form.deliveryStatus)}>{titleCase(form.deliveryStatus || 'pending')}</span>
              <span className="text-sm text-clay">{order.shippingRegionLabel || order.deliveryMethod || 'Standard shipping'}</span>
            </div>
            <div className="mt-4 rounded-[var(--radius-admin)] border border-line bg-white p-4 text-sm font-semibold text-ink">
              {order.shippingRegionLabel || order.deliveryMethod || 'Shipping'}
            </div>
            <div className="mt-4 space-y-3">
              {form.items.map((item, index) => (
                <div key={index} className="rounded-[var(--radius-admin)] border border-line bg-white p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="product-photo-blend h-14 w-14 rounded-[var(--radius-admin)] border border-line object-cover" />
                    ) : (
                      <span className="h-14 w-14 rounded-[var(--radius-admin)] border border-line bg-cream" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <label className="block">
                        <span className="eyebrow">Product name</span>
                        <input className="field mt-1" value={item.productName} disabled={!isEditing} onChange={(e) => updateItem(index, 'productName', e.target.value)} />
                      </label>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="block">
                          <span className="eyebrow">Size</span>
                          <input className="field mt-1" value={item.size} disabled={!isEditing} onChange={(e) => updateItem(index, 'size', e.target.value)} />
                        </label>
                        <label className="block">
                          <span className="eyebrow">Quantity</span>
                          <input className="field mt-1" type="number" min="1" value={item.quantity} disabled={!isEditing} onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))} />
                        </label>
                        <label className="block">
                          <span className="eyebrow">Unit price</span>
                          <input className="field mt-1" type="number" min="0" step="0.01" value={pesoInputValue(item.unitPriceCents)} disabled={!isEditing} onChange={(e) => updateItem(index, 'unitPriceCents', Math.round(Number(e.target.value || 0) * 100))} />
                        </label>
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold">
                      <p>{formatMoney(Number(item.unitPriceCents || 0) * Number(item.quantity || 0))}</p>
                      <button type="button" className="mt-2 text-xs text-accent underline disabled:text-clay disabled:no-underline" onClick={() => removeItem(index)} disabled={!isEditing || form.items.length <= 1}>Remove item</button>
                    </div>
                  </div>
                </div>
              ))}
              {showProductPicker && (
                <div className="rounded-[var(--radius-admin)] border border-line bg-cream p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="min-w-0 flex-1">
                      <span className="eyebrow">Search products to add</span>
                      <input
                        className="field mt-1"
                        value={productSearchQuery}
                        autoFocus
                        placeholder="Type product name, SKU, collection, or category"
                        onChange={(e) => setProductSearchQuery(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-secondary self-start sm:self-end"
                      onClick={() => {
                        setShowProductPicker(false);
                        setProductSearchQuery('');
                        setProductSearchResults([]);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                    {productSearchLoading && <p className="text-sm text-clay">Searching products...</p>}
                    {!productSearchLoading && productSearchResults.map((product) => (
                      <article key={product.slug} className="rounded-[var(--radius-admin)] border border-line bg-white p-3">
                        <div className="flex gap-3">
                          {product.image ? (
                            <img src={product.image} alt="" className="product-photo-blend h-14 w-12 rounded-[var(--radius-admin)] border border-line object-cover" />
                          ) : (
                            <span className="h-14 w-12 rounded-[var(--radius-admin)] border border-line bg-cream" aria-hidden="true" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-ink">{product.name}</h3>
                              <span className={orderStatusBadge(product.status)}>{product.status}</span>
                            </div>
                            <p className="mt-1 text-xs text-clay">{product.category || 'Uncategorized'} · {product.inventoryQuantity || 0} in stock</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {(product.variants || []).map((variant) => (
                                <button
                                  type="button"
                                  key={variant.id}
                                  className="rounded-[var(--radius-admin)] border border-line bg-paper p-2 text-left text-xs hover:border-accent hover:bg-cream"
                                  onClick={() => selectCatalogVariant(product, variant)}
                                >
                                  <span className="block font-semibold text-ink">{variant.size || 'Default'} · {formatMoney(variant.priceCents || product.priceCents || 0)}</span>
                                  <span className="block text-clay">SKU {variant.sku || '-'} · Stock {variant.stockQuantity || 0}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                    {!productSearchLoading && showProductPicker && productSearchResults.length === 0 && (
                      <p className="rounded-[var(--radius-admin)] border border-line bg-white p-3 text-sm text-clay">No products match.</p>
                    )}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" className="btn-ghost !py-2" onClick={addItem}>Add item</button>
                <button type="button" className="btn-ink !py-2" onClick={markAsFulfilled}>Mark as fulfilled</button>
              </div>
            </div>
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={orderStatusBadge(form.paymentStatus, paymentPending ? 'warning' : 'success')}>
                {paymentPending ? 'Payment pending' : 'Paid'}
              </span>
              <button type="button" className="btn-ink !py-2" onClick={markAsPaid}>Mark as paid</button>
            </div>
            <dl className="mt-4 space-y-2 rounded-[var(--radius-admin)] border border-line bg-white p-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-clay">Subtotal</dt><dd>{itemCount} item{itemCount === 1 ? '' : 's'} · {formatMoney(subtotalCents)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-clay">Discount</dt><dd>{discountTotalCents ? `-${formatMoney(discountTotalCents)}` : formatMoney(0)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-clay">Shipping</dt><dd>{order.shippingFeeCents ? formatMoney(order.shippingFeeCents) : 'Free'}</dd></div>
              <div className="flex justify-between gap-4 text-base font-semibold"><dt>Total</dt><dd>{formatMoney(totalCents)}</dd></div>
              <div className="border-t border-line pt-2">
                <div className="flex justify-between gap-4"><dt className="text-clay">Paid</dt><dd>{formatMoney(paidCents)}</dd></div>
                <div className="flex justify-between gap-4 font-semibold"><dt>Balance</dt><dd>{formatMoney(balanceCents)}</dd></div>
              </div>
            </dl>
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Timeline</h2>
            <label className="mt-4 block">
              <span className="eyebrow">Leave a comment</span>
              <textarea className="field mt-1" rows="3" placeholder="Leave a comment..." value={form.notes} disabled={!isEditing} onChange={(e) => setForm((previous) => ({ ...previous, notes: e.target.value }))} />
            </label>
            <p className="mt-3 text-xs text-clay">Only admin users can see timeline comments. Notes are saved to the order record.</p>
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Status history</h2>
            {statusEvents.length ? (
              <div className="mt-4 space-y-3">
                {statusEvents.map((event) => (
                  <article key={event.id || `${event.source}-${event.createdAt}`} className="rounded-[var(--radius-admin)] border border-line bg-white p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-ink">{titleCase(event.source || 'admin')}</p>
                      <time className="text-xs text-clay" dateTime={event.createdAt || ''}>
                        {event.createdAt ? new Date(event.createdAt).toLocaleString('en-PH') : 'Date unavailable'}
                      </time>
                    </div>
                    <dl className="mt-3 space-y-2">
                      {Object.entries(event.changes || {}).map(([field, change]) => (
                        <div key={field} className="grid gap-1 sm:grid-cols-[140px_1fr]">
                          <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-clay">{ENUM_LABELS[field] || titleCase(field)}</dt>
                          <dd className="text-ink-soft">
                            {titleCase(change.from || 'blank')} <span className="text-clay">to</span> {titleCase(change.to || 'blank')}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {event.note && <p className="mt-3 text-xs text-clay">{event.note}</p>}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-clay">No status changes recorded yet.</p>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Notes</h2>
            <label className="mt-4 block">
              <span className="eyebrow">Internal notes</span>
              <textarea className="field mt-1" rows="4" value={form.notes} disabled={!isEditing} onChange={(e) => setForm((previous) => ({ ...previous, notes: e.target.value }))} />
            </label>
          </section>

          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Customer</h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="eyebrow">Full name</span>
                <input className="field mt-1" value={form.customer.fullName} disabled={!isEditing} onChange={(e) => updateCustomer('fullName', e.target.value)} />
              </label>
              <label className="block">
                <span className="eyebrow">Contact number</span>
                <input className="field mt-1" value={form.customer.phone} disabled={!isEditing} onChange={(e) => updateCustomer('phone', e.target.value)} />
              </label>
              <label className="block">
                <span className="eyebrow">Email</span>
                <input className="field mt-1" type="email" value={form.customer.email} disabled={!isEditing} onChange={(e) => updateCustomer('email', e.target.value)} />
              </label>
            </div>
            {history && (
              <p className={`mt-2 inline-block px-2 py-1 text-xs font-semibold ${
                history.cancelledCount === 0 && history.unreachableCount === 0 && history.deliveredCount > 0
                  ? 'bg-[#2f7d32]/10 text-[#2f7d32]'
                  : history.cancelledCount > 0 || history.unreachableCount > 0
                    ? 'bg-[#b8860b]/10 text-[#8a6508]'
                    : 'bg-cream text-ink-soft'
              }`}>
                COD history: {history.ordersCount} order{history.ordersCount === 1 ? '' : 's'} ·{' '}
                {history.deliveredCount} delivered · {history.cancelledCount} cancelled · {history.unreachableCount} unreachable
              </p>
            )}
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Shipping address</h3>
                <button type="button" className="text-xs text-accent underline" onClick={() => editAddress ? setEditAddress(false) : startAddressEdit()}>
                  {editAddress ? 'Cancel edit' : 'Edit'}
                </button>
              </div>
              {!editAddress ? (
                <dl className="mt-3 grid gap-2 text-sm">
                  <div><dt className="eyebrow">House / Street</dt><dd className="text-ink-soft">{order.address?.houseAddress || '-'}</dd></div>
                  <div><dt className="eyebrow">Barangay</dt><dd className="text-ink-soft">{order.address?.barangay || '-'}</dd></div>
                  <div><dt className="eyebrow">City / Municipality</dt><dd className="text-ink-soft">{order.address?.city || '-'}</dd></div>
                  <div><dt className="eyebrow">Province</dt><dd className="text-ink-soft">{order.address?.province || '-'}</dd></div>
                </dl>
              ) : (
                <div className="mt-3 space-y-3">
                  <label className="block">
                    <span className="eyebrow">House / Street</span>
                    <input className="field mt-1" placeholder="House / street / unit" value={addressDraft.house} disabled={!isEditing} onChange={(e) => setAddressDraft((d) => ({ ...d, house: e.target.value }))} />
                  </label>
                  <select className="field" value={addressDraft.provinceCode} disabled={!isEditing} onChange={(e) => setAddressDraft((d) => ({ ...d, provinceCode: e.target.value, cityCode: '', barangayCode: '' }))}>
                    <option value="">Select province</option>
                    {provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                  <select className="field" value={addressDraft.cityCode} disabled={!isEditing || !cities.length} onChange={(e) => setAddressDraft((d) => ({ ...d, cityCode: e.target.value, barangayCode: '' }))}>
                    <option value="">Select city / municipality</option>
                    {cities.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                  <select className="field" value={addressDraft.barangayCode} disabled={!isEditing || !barangays.length} onChange={(e) => setAddressDraft((d) => ({ ...d, barangayCode: e.target.value }))}>
                    <option value="">Select barangay</option>
                    {barangays.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Billing address</h3>
              <p className="mt-2 text-sm text-ink-soft">Same as shipping address</p>
              <p className="mt-1 text-sm text-clay">{addressLines.join(', ') || '-'}</p>
            </div>
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Promo snapshot</h2>
            {promoSnapshot.promoId || order.discountCode || discountTotalCents ? (
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-clay">Name</dt><dd className="text-right font-semibold">{promoSnapshot.name || promoSnapshot.promoId || order.discountCode}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-clay">Code</dt><dd className="text-right">{promoSnapshot.promoId || order.discountCode || '-'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-clay">Type</dt><dd className="text-right">{promoTypeLabel(promoSnapshot.type)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-clay">Discount</dt><dd className="text-right">-{formatMoney(discountTotalCents)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-clay">Free shipping</dt><dd className="text-right">{promoSnapshot.freeShippingApplied ? 'Applied' : 'Not applied'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-clay">Savings</dt><dd className="text-right">{formatMoney(promoSnapshot.savingsCents || discountTotalCents)}</dd></div>
                <div><dt className="text-clay">Applied rule</dt><dd className="mt-1 text-ink-soft">{appliedRuleLabel(promoSnapshot.appliedRule)}</dd></div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-clay">No promo was applied to this order.</p>
            )}
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Conversion summary</h2>
            <div className="mt-3 space-y-2 text-sm text-ink-soft">
              <p>This is their {history?.ordersCount ? `${history.ordersCount}${history.ordersCount === 1 ? 'st' : ' total'} order` : 'first known order'}.</p>
              <p>{history?.deliveredCount || 0} delivered · {history?.cancelledCount || 0} cancelled · {history?.unreachableCount || 0} unreachable</p>
            </div>
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Order risk</h2>
            <p className={`mt-3 inline-flex rounded-[var(--radius-admin)] px-2 py-1 text-xs font-semibold ${
              history?.cancelledCount > 0 || history?.unreachableCount > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
            }`}>
              {history?.cancelledCount > 0 || history?.unreachableCount > 0 ? 'Review COD history' : 'No risk flags'}
            </p>
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">J&T readiness</h2>
            <p className="mt-3 text-sm text-ink-soft">Calculated parcel weight: <strong>{order.parcelWeightGrams || 0} g</strong></p>
            <label className="mt-3 block">
              <span className="eyebrow">Parcel weight override (grams)</span>
              <input className="field mt-1" type="number" min="1" value={form.parcelWeightOverrideGrams} onChange={(e) => { setIsEditing(true); setForm((previous) => ({ ...previous, parcelWeightOverrideGrams: e.target.value })); }} placeholder="Use calculated weight" />
            </label>
            <p className="mt-3 text-sm text-ink-soft">{order.jntExportStatus === 'ready' ? 'Ready for J&T export.' : order.jntExportStatus === 'exported' ? 'Exported to J&T.' : 'Missing export fields.'}</p>
            {Array.isArray(order.jntMissingFields) && order.jntMissingFields.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-accent-deep">
                {order.jntMissingFields.map((field) => <li key={field}>{field}</li>)}
              </ul>
            )}
            {order.exportedToJnt && (
              <p className="mt-3 text-xs uppercase tracking-[0.1em] text-clay">
                Exported to J&T {order.jntExportedAt ? new Date(order.jntExportedAt).toLocaleString('en-PH') : ''}
              </p>
            )}
            <button type="button" className="btn-secondary mt-4 w-full !py-2" onClick={previewJnt}>Preview J&T parcel</button>
            {jntPreview && (
              <div className="mt-4 rounded-[var(--radius-admin)] border border-line bg-white p-3 text-xs">
                <p className="font-semibold uppercase tracking-[0.1em]">Dry run · {jntPreview.ready ? 'Ready' : 'Needs information'}</p>
                {jntPreview.missingFields?.length > 0 && <p className="mt-2 text-red-700">Missing: {jntPreview.missingFields.join(', ')}</p>}
                <dl className="mt-3 space-y-1 text-ink-soft">
                  <div className="flex justify-between"><dt>Weight</dt><dd>{jntPreview.parcel.weightKg} kg</dd></div>
                  <div className="flex justify-between"><dt>Parcels</dt><dd>{jntPreview.parcel.parcelCount}</dd></div>
                  <div className="flex justify-between"><dt>COD</dt><dd>{formatMoney(jntPreview.parcel.codAmountCents)}</dd></div>
                </dl>
              </div>
            )}
            {canSendTrackingNotification && (
              <button type="button" className="btn-ink mt-4 w-full !py-2" onClick={sendTrackingNotification}>
                {trackingNotifications.length ? 'Resend tracking notification' : 'Send tracking notification'}
              </button>
            )}
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Delivery confirmations</h2>
            {deliveryNotifications.length ? (
              <div className="mt-4 space-y-3">
                {deliveryNotifications.map((notification) => (
                  <article key={notification.id} className="rounded-[var(--radius-admin)] border border-line bg-white p-3 text-sm">
                    <p className="font-semibold">{titleCase(notification.channel)} · {titleCase(notification.status)}</p>
                    <p className="mt-1 text-xs text-clay">{notification.recipient}</p>
                    {notification.lastError && <p className="mt-2 text-xs text-red-700">{notification.lastError}</p>}
                  </article>
                ))}
              </div>
            ) : <p className="mt-3 text-sm text-clay">Created automatically when the order is first marked delivered.</p>}
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Tracking notifications</h2>
            {trackingNotifications.length ? (
              <div className="mt-4 space-y-3">
                {trackingNotifications.map((notification) => (
                  <article key={notification.id || notification.createdAt} className="rounded-[var(--radius-admin)] border border-line bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-ink">{titleCase(notification.channel || 'sms')} · {titleCase(notification.status || 'recorded')}</p>
                      <time className="text-xs text-clay" dateTime={notification.createdAt || ''}>
                        {notification.createdAt ? new Date(notification.createdAt).toLocaleString('en-PH') : 'Date unavailable'}
                      </time>
                    </div>
                    <p className="mt-2 text-ink-soft">{notification.message || 'Tracking notification recorded.'}</p>
                    {notification.trackingNumber && <p className="mt-2 text-xs uppercase tracking-[0.1em] text-clay">Tracking {notification.trackingNumber}</p>}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-clay">No tracking notifications recorded yet.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
