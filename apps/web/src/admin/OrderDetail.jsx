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
    setForm((previous) => ({
      ...previous,
      items: [...previous.items, emptyItem()]
    }));
  }

  async function startAddressEdit() {
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
      setMessage('Changes saved successfully.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div className="max-w-4xl">
      <Link to="/admin/orders" className="text-xs uppercase tracking-[0.12em] text-clay hover:text-accent">← Orders</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-3xl">{order.orderNumber}</h1>
        <button type="button" className="btn-ink" onClick={save}>Save changes</button>
      </div>
      {message && <p className="mt-3 text-sm text-accent-deep" role="status">{message}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="border border-line bg-paper p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Statuses</h2>
          <div className="mt-4 space-y-4">
            {Object.keys(ENUMS).map((key) => (
              <label key={key} className="block">
                <span className="eyebrow">{ENUM_LABELS[key]}</span>
                <select
                  className="field mt-1"
                  value={form[key]}
                  onChange={(e) => setForm((previous) => ({ ...previous, [key]: e.target.value }))}
                >
                  {ENUMS[key].map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}
                </select>
              </label>
            ))}
            <label className="block">
              <span className="eyebrow">Tracking number</span>
              <input className="field mt-1" value={form.trackingNumber} onChange={(e) => setForm((previous) => ({ ...previous, trackingNumber: e.target.value }))} />
            </label>
            <label className="block">
              <span className="eyebrow">Notes</span>
              <textarea className="field mt-1" rows="3" value={form.notes} onChange={(e) => setForm((previous) => ({ ...previous, notes: e.target.value }))} />
            </label>
          </div>
        </section>

        <div className="space-y-6">
          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Customer</h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="eyebrow">Full name</span>
                <input className="field mt-1" value={form.customer.fullName} onChange={(e) => updateCustomer('fullName', e.target.value)} />
              </label>
              <label className="block">
                <span className="eyebrow">Contact number</span>
                <input className="field mt-1" value={form.customer.phone} onChange={(e) => updateCustomer('phone', e.target.value)} />
              </label>
              <label className="block">
                <span className="eyebrow">Email</span>
                <input className="field mt-1" type="email" value={form.customer.email} onChange={(e) => updateCustomer('email', e.target.value)} />
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
                    <input className="field mt-1" placeholder="House / street / unit" value={addressDraft.house} onChange={(e) => setAddressDraft((d) => ({ ...d, house: e.target.value }))} />
                  </label>
                  <select className="field" value={addressDraft.provinceCode} onChange={(e) => setAddressDraft((d) => ({ ...d, provinceCode: e.target.value, cityCode: '', barangayCode: '' }))}>
                    <option value="">Select province</option>
                    {provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                  <select className="field" value={addressDraft.cityCode} disabled={!cities.length} onChange={(e) => setAddressDraft((d) => ({ ...d, cityCode: e.target.value, barangayCode: '' }))}>
                    <option value="">Select city / municipality</option>
                    {cities.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                  <select className="field" value={addressDraft.barangayCode} disabled={!barangays.length} onChange={(e) => setAddressDraft((d) => ({ ...d, barangayCode: e.target.value }))}>
                    <option value="">Select barangay</option>
                    {barangays.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          </section>

          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Items</h2>
            <div className="mt-3 space-y-4">
              {form.items.map((item, index) => (
                <div key={index} className="border border-line/70 p-3">
                  <label className="block">
                    <span className="eyebrow">Product name</span>
                    <input className="field mt-1" value={item.productName} onChange={(e) => updateItem(index, 'productName', e.target.value)} />
                  </label>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="eyebrow">Size</span>
                      <input className="field mt-1" value={item.size} onChange={(e) => updateItem(index, 'size', e.target.value)} />
                    </label>
                    <label className="block">
                      <span className="eyebrow">Quantity</span>
                      <input className="field mt-1" type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))} />
                    </label>
                    <label className="block">
                      <span className="eyebrow">Unit price</span>
                      <input className="field mt-1" type="number" min="0" step="0.01" value={pesoInputValue(item.unitPriceCents)} onChange={(e) => updateItem(index, 'unitPriceCents', Math.round(Number(e.target.value || 0) * 100))} />
                    </label>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-clay">Line total {formatMoney(Number(item.unitPriceCents || 0) * Number(item.quantity || 0))}</span>
                    <button type="button" className="text-xs text-accent underline" onClick={() => removeItem(index)} disabled={form.items.length <= 1}>Remove item</button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn-ghost !py-2" onClick={addItem}>Add item</button>
            </div>
            <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-clay">Subtotal</dt><dd>{formatMoney(order.subtotalCents)}</dd></div>
              <div className="flex justify-between"><dt className="text-clay">Shipping</dt><dd>{order.shippingFeeCents ? formatMoney(order.shippingFeeCents) : 'Free'}</dd></div>
              <div className="flex justify-between text-base font-semibold"><dt>Total (COD)</dt><dd>{formatMoney(order.totalCents)}</dd></div>
            </dl>
            {order.exportedToJnt && (
              <p className="mt-3 text-xs uppercase tracking-[0.1em] text-clay">
                Exported to J&T {order.jntExportedAt ? new Date(order.jntExportedAt).toLocaleString('en-PH') : ''}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
