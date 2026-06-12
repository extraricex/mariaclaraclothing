import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearCustomerToken, customerJson, useCustomerLoggedIn } from '../lib/customerAuth.js';
import { fetchProduct } from '../lib/api.js';
import { addToCart } from '../lib/cart.js';
import { formatMoney } from '../lib/money.js';
import { loadBarangays, loadCities, loadProvinces } from '../lib/addressGuide.js';

const STATUS_STEPS = ['received', 'confirmed', 'packed', 'shipped', 'delivered'];

function statusLabel(order) {
  if (order.status === 'cancelled') return 'Cancelled';
  const index = STATUS_STEPS.indexOf(order.status);
  return index >= 0 ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : order.status;
}

export default function Account() {
  const navigate = useNavigate();
  const loggedIn = useCustomerLoggedIn();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState('');
  const [buyAgainNote, setBuyAgainNote] = useState('');
  const [profile, setProfile] = useState({ fullName: '', phone: '' });
  const [editAddress, setEditAddress] = useState(false);
  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [draft, setDraft] = useState({ house: '', provinceCode: '', cityCode: '', barangayCode: '' });

  useEffect(() => {
    if (!loggedIn) {
      navigate('/login');
      return;
    }
    customerJson('/api/customer/me')
      .then((body) => {
        setCustomer(body.customer);
        setProfile({ fullName: body.customer.fullName, phone: body.customer.phone });
      })
      .catch((err) => setMessage(err.message));
    customerJson('/api/customer/orders')
      .then((body) => setOrders(body.orders))
      .catch(() => {});
  }, [loggedIn, navigate]);

  useEffect(() => {
    if (editAddress && !provinces.length) loadProvinces().then(setProvinces);
  }, [editAddress, provinces.length]);
  useEffect(() => {
    setCities([]);
    if (draft.provinceCode) loadCities(draft.provinceCode).then(setCities);
  }, [draft.provinceCode]);
  useEffect(() => {
    setBarangays([]);
    if (draft.cityCode) loadBarangays(draft.cityCode).then(setBarangays);
  }, [draft.cityCode]);

  if (!customer) {
    return <div className="mx-auto max-w-4xl px-5 py-16 text-sm text-clay">{message || 'Loading account…'}</div>;
  }

  async function saveProfile() {
    setMessage('');
    try {
      const changes = { fullName: profile.fullName, phone: profile.phone };
      if (editAddress) {
        const province = provinces.find((item) => item.code === draft.provinceCode);
        const city = cities.find((item) => item.code === draft.cityCode);
        const barangay = barangays.find((item) => item.code === draft.barangayCode);
        if (!draft.house.trim() || !province || !city || !barangay) {
          setMessage('Complete all address fields before saving.');
          return;
        }
        changes.savedAddress = {
          houseAddress: draft.house.trim(),
          barangay: barangay.name,
          city: city.name,
          province: province.name,
          postalCode: ''
        };
      }
      const body = await customerJson('/api/customer/me', { method: 'PUT', body: JSON.stringify(changes) });
      setCustomer(body.customer);
      setEditAddress(false);
      setMessage('Account updated.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function buyAgain(order) {
    setBuyAgainNote('Checking stock…');
    const added = [];
    const unavailable = [];
    for (const item of order.items) {
      try {
        const { product } = await fetchProduct(String(item.productId).replace(/^catalog-/, ''));
        const variant = product.variants.find((candidate) =>
          candidate.size === item.size && Number(candidate.stockQuantity) >= Number(item.quantity));
        if (!variant || product.merchandisingStatus === 'sold_out') {
          unavailable.push(`${item.productName} (${item.size})`);
          continue;
        }
        addToCart({
          productId: product.id,
          slug: product.slug,
          variantId: variant.id,
          productName: product.name,
          size: variant.size,
          quantity: Number(item.quantity),
          unitPriceCents: product.priceCents,
          imageUrl: product.images[0]?.url || '',
          externalPosProductId: product.externalPosProductId || '',
          externalPosVariantId: variant.externalPosVariantId || ''
        });
        added.push(item.productName);
      } catch (_error) {
        unavailable.push(`${item.productName} (${item.size})`);
      }
    }
    setBuyAgainNote(
      [added.length ? `Added ${added.length} item${added.length === 1 ? '' : 's'} to cart.` : '',
        unavailable.length ? `Unavailable: ${unavailable.join(', ')}.` : ''].filter(Boolean).join(' ')
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="display mt-1 text-4xl">Hi, {customer.fullName.split(' ')[0]}</h1>
        </div>
        <button
          type="button"
          className="text-xs uppercase tracking-[0.12em] text-clay underline hover:text-accent"
          onClick={() => { clearCustomerToken(); navigate('/'); }}
        >
          Log out
        </button>
      </div>
      {message && <p className="mt-4 text-sm text-accent-deep" role="status">{message}</p>}

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Profile & address</h2>
          <div className="mt-4 space-y-4 border border-line bg-white p-5">
            <label className="block">
              <span className="eyebrow">Full name</span>
              <input className="field mt-1" value={profile.fullName} onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))} />
            </label>
            <label className="block">
              <span className="eyebrow">Mobile number</span>
              <input className="field mt-1" value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} />
            </label>
            <p className="text-xs text-clay">Email: {customer.email}</p>

            <div className="border-t border-line pt-4">
              <div className="flex items-center justify-between">
                <span className="eyebrow">Saved shipping address</span>
                <button type="button" className="text-xs text-accent underline" onClick={() => setEditAddress((value) => !value)}>
                  {editAddress ? 'Cancel' : customer.savedAddress ? 'Change' : 'Add'}
                </button>
              </div>
              {!editAddress ? (
                <p className="mt-2 text-sm text-ink-soft">
                  {customer.savedAddress
                    ? `${customer.savedAddress.houseAddress}, ${customer.savedAddress.barangay}, ${customer.savedAddress.city}, ${customer.savedAddress.province}`
                    : 'None yet — save one to prefill checkout.'}
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <input className="field" placeholder="House no. / Street / Unit" value={draft.house} onChange={(e) => setDraft((d) => ({ ...d, house: e.target.value }))} />
                  <select className="field" value={draft.provinceCode} onChange={(e) => setDraft((d) => ({ ...d, provinceCode: e.target.value, cityCode: '', barangayCode: '' }))}>
                    <option value="">Select province</option>
                    {provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                  <select className="field" value={draft.cityCode} disabled={!cities.length} onChange={(e) => setDraft((d) => ({ ...d, cityCode: e.target.value, barangayCode: '' }))}>
                    <option value="">Select city / municipality</option>
                    {cities.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                  <select className="field" value={draft.barangayCode} disabled={!barangays.length} onChange={(e) => setDraft((d) => ({ ...d, barangayCode: e.target.value }))}>
                    <option value="">Select barangay</option>
                    {barangays.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <button type="button" className="btn-ink w-full" onClick={saveProfile}>Save changes</button>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Order history</h2>
          {buyAgainNote && (
            <p className="mt-3 text-sm text-ink-soft" role="status">
              {buyAgainNote} <Link to="/cart" className="text-accent underline">View cart</Link>
            </p>
          )}
          <div className="mt-4 space-y-4">
            {orders.map((order) => (
              <article key={order.orderNumber} className="border border-line bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <strong className="text-sm">{order.orderNumber}</strong>
                    <p className="text-xs text-clay">{order.placedAt ? new Date(order.placedAt).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : ''}</p>
                  </div>
                  <span className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                    order.status === 'cancelled' ? 'bg-line text-clay' :
                    order.status === 'delivered' ? 'bg-[#2f7d32]/10 text-[#2f7d32]' : 'bg-accent/10 text-accent-deep'
                  }`}>
                    {statusLabel(order)}
                  </span>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-ink-soft">
                  {order.items.map((item, index) => (
                    <li key={index}>{item.quantity}× {item.productName} — {item.size}</li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                  <div className="text-sm">
                    <strong>{formatMoney(order.totalCents)}</strong>
                    {order.trackingNumber && (
                      <span className="ml-3 text-xs text-clay">J&T tracking: <strong className="text-ink">{order.trackingNumber}</strong></span>
                    )}
                  </div>
                  {order.status !== 'cancelled' && (
                    <button type="button" className="btn-ghost !px-4 !py-2 text-xs" onClick={() => buyAgain(order)}>
                      Buy again
                    </button>
                  )}
                </div>
              </article>
            ))}
            {!orders.length && (
              <div className="border border-line bg-white p-8 text-center">
                <p className="text-sm text-ink-soft">No orders yet.</p>
                <Link to="/#new-arrivals" className="btn-ink mt-4">Start shopping</Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
