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
        setForm({
          status: body.order.status,
          fulfillmentStatus: body.order.fulfillmentStatus,
          paymentStatus: body.order.paymentStatus,
          codConfirmationStatus: body.order.codConfirmationStatus,
          deliveryStatus: body.order.deliveryStatus,
          trackingNumber: body.order.trackingNumber || '',
          notes: body.order.notes || ''
        });
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

  async function save() {
    setMessage('');
    const changes = { ...form };
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
            <p className="mt-3 text-sm font-semibold">{order.customer?.fullName}</p>
            <p className="text-sm text-ink-soft">{order.customer?.phone}</p>
            {order.customer?.email && <p className="text-sm text-ink-soft">{order.customer.email}</p>}
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
                <button type="button" className="text-xs text-accent underline" onClick={() => setEditAddress((value) => !value)}>
                  {editAddress ? 'Cancel edit' : 'Edit'}
                </button>
              </div>
              {!editAddress ? (
                <p className="mt-2 text-sm text-ink-soft">{order.address?.addressLine}</p>
              ) : (
                <div className="mt-3 space-y-3">
                  <input className="field" placeholder="House / street / unit" value={addressDraft.house} onChange={(e) => setAddressDraft((d) => ({ ...d, house: e.target.value }))} />
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
            <ul className="mt-3 divide-y divide-line/60">
              {(order.items || []).map((item, index) => (
                <li key={index} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span>{item.productName} <span className="text-clay">· {item.size} × {item.quantity}</span></span>
                  <strong>{formatMoney(Number(item.unitPriceCents) * Number(item.quantity))}</strong>
                </li>
              ))}
            </ul>
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
