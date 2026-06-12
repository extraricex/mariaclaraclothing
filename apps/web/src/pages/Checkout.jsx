import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createOrder } from '../lib/api.js';
import { cartQuantity, clearCart, removeFromCart, subtotalCents, updateQuantity, useCart } from '../lib/cart.js';
import { formatMoney } from '../lib/money.js';
import {
  deliveryEstimate,
  feeForRegion,
  loadBarangays,
  loadCities,
  loadProvinces,
  regionForProvince,
  regionLabel
} from '../lib/addressGuide.js';

function checkoutTotals(items, region, discountTotalCents = 0) {
  const subtotal = subtotalCents(items);
  const freeShippingUnlocked = cartQuantity(items) >= 2;
  const shippingFeeCents = items.length && !freeShippingUnlocked && region !== 'pending_address'
    ? feeForRegion(region)
    : 0;
  const discount = Math.min(discountTotalCents, subtotal);
  return {
    subtotalCents: subtotal,
    shippingFeeCents,
    discountTotalCents: discount,
    totalCents: subtotal - discount + shippingFeeCents,
    shippingRegion: region,
    shippingRegionLabel: regionLabel(region),
    freeShippingUnlocked
  };
}

function cartSnapshotFields(items, totals) {
  return {
    checkoutChannel: 'storefront_checkout',
    paymentMethod: 'cash_on_delivery',
    shippingRegion: totals.shippingRegion,
    shippingRegionLabel: totals.shippingRegionLabel,
    freeShippingUnlocked: totals.freeShippingUnlocked,
    cartSnapshot: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      sku: item.sku || '',
      slug: item.slug || '',
      productName: item.productName,
      size: item.size,
      imageUrl: item.imageUrl || '',
      unitPriceCents: Number(item.unitPriceCents || 0),
      quantity: Number(item.quantity || 0)
    })),
    adminEditableTotals: {
      subtotalCents: totals.subtotalCents,
      discountTotalCents: totals.discountTotalCents,
      shippingFeeCents: totals.shippingFeeCents,
      totalCents: totals.totalCents
    }
  };
}

export default function Checkout() {
  const items = useCart();
  const navigate = useNavigate();

  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [provinceCode, setProvinceCode] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [barangayCode, setBarangayCode] = useState('');
  const [house, setHouse] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState({ tone: 'neutral', message: '' });
  const [pending, setPending] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [discount, setDiscount] = useState(null);
  const [discountError, setDiscountError] = useState('');

  useEffect(() => {
    loadProvinces().then(setProvinces);
  }, []);

  useEffect(() => {
    setCities([]);
    setCityCode('');
    setBarangays([]);
    setBarangayCode('');
    if (provinceCode) loadCities(provinceCode).then(setCities);
  }, [provinceCode]);

  useEffect(() => {
    setBarangays([]);
    setBarangayCode('');
    if (cityCode) loadBarangays(cityCode).then(setBarangays);
  }, [cityCode]);

  const province = provinces.find((item) => item.code === provinceCode) || null;
  const city = cities.find((item) => item.code === cityCode) || null;
  const barangay = barangays.find((item) => item.code === barangayCode) || null;
  const addressReady = Boolean(house.trim() && provinceCode && cityCode && barangayCode);
  const region = addressReady ? regionForProvince(province) : 'pending_address';
  const discountCents = discount?.discountTotalCents || 0;
  const totals = useMemo(() => checkoutTotals(items, region, discountCents), [items, region, discountCents]);
  const doorToDoorWarning = Boolean(barangay) && String(barangay.doorToDoor || '').toUpperCase() !== 'YES';

  async function applyDiscount() {
    const code = discountInput.trim();
    setDiscountError('');
    if (!code) {
      setDiscount(null);
      return;
    }
    try {
      const response = await fetch('/api/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotalCents: subtotalCents(items) })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Discount code is invalid');
      setDiscount(body.discount);
    } catch (error) {
      setDiscount(null);
      setDiscountError(error.message);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!items.length) {
      setStatus({ tone: 'error', message: 'Your cart is empty. Add an item before placing an order.' });
      return;
    }
    const missing = [];
    if (!house.trim()) missing.push('House Number / Street / Building / Unit');
    if (!barangay) missing.push('Barangay');
    if (!province) missing.push('Province');
    if (!city) missing.push('City / Municipality');
    if (missing.length) {
      setStatus({ tone: 'error', message: `Complete your shipping address: ${missing.join(', ')}.` });
      return;
    }

    setStatus({ tone: 'neutral', message: 'Placing your order...' });
    setPending(true);

    const submitTotals = checkoutTotals(items, regionForProvince(province), discountCents);
    const addressLine = `${house.trim()}, ${barangay.name}, ${city.name}, ${province.name}, Philippines`;
    const payload = {
      customer: { fullName: fullName.trim(), phone: phone.trim(), email: email.trim() },
      address: {
        addressLine,
        houseAddress: house.trim(),
        barangay: barangay.name,
        city: city.name,
        province: province.name,
        country: 'Philippines',
        postalCode: ''
      },
      shippingRegion: submitTotals.shippingRegion,
      shippingRegionLabel: submitTotals.shippingRegionLabel,
      freeShippingUnlocked: submitTotals.freeShippingUnlocked,
      shippingFeeCents: submitTotals.shippingFeeCents,
      discountCode: discount?.code || '',
      discountTotalCents: submitTotals.discountTotalCents,
      notes: notes.trim(),
      items,
      ...cartSnapshotFields(items, submitTotals)
    };

    try {
      const result = await createOrder(payload);
      sessionStorage.setItem('maria-clara-last-order', JSON.stringify({
        orderNumber: result.orderNumber,
        customerName: payload.customer.fullName,
        paymentMethod: 'Cash on Delivery',
        addressLine: payload.address.addressLine,
        shippingRegionLabel: submitTotals.shippingRegionLabel,
        shippingFeeCents: submitTotals.shippingFeeCents,
        totalCents: submitTotals.totalCents,
        placedAt: new Date().toISOString()
      }));
      clearCart();
      navigate(`/thank-you?order=${encodeURIComponent(result.orderNumber)}`);
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 lg:px-8">
          <Link to="/" className="display text-xl">Maria<span className="text-accent">Clara</span></Link>
          <Link to="/cart" className="text-[12px] font-semibold uppercase tracking-[0.18em] hover:text-accent">Back to cart</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-10 lg:grid-cols-[1.1fr_1fr] lg:px-8">
        <form onSubmit={handleSubmit} noValidate={false}>
          <p className="eyebrow">Checkout · Cash on Delivery</p>
          <h1 className="display mt-2 text-3xl sm:text-4xl">Where do we send it?</h1>

          <fieldset className="mt-8 space-y-4">
            <legend className="text-sm font-semibold uppercase tracking-[0.12em]">Contact</legend>
            <input className="field" required placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            <input className="field" required type="tel" placeholder="Mobile number (09XXXXXXXXX)" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            <input className="field" type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </fieldset>

          <fieldset className="mt-8 space-y-4">
            <legend className="text-sm font-semibold uppercase tracking-[0.12em]">Shipping address</legend>
            <input className="field" required placeholder="House no. / Street / Building / Unit" value={house} onChange={(e) => setHouse(e.target.value)} autoComplete="street-address" />
            <select className="field" required value={provinceCode} onChange={(e) => setProvinceCode(e.target.value)}>
              <option value="">Select province</option>
              {provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            <select className="field" required value={cityCode} disabled={!cities.length} onChange={(e) => setCityCode(e.target.value)}>
              <option value="">{provinceCode ? 'Select city / municipality' : 'Select province first'}</option>
              {cities.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            <select className="field" required value={barangayCode} disabled={!barangays.length} onChange={(e) => setBarangayCode(e.target.value)}>
              <option value="">{cityCode ? 'Select barangay' : 'Select city / municipality first'}</option>
              {barangays.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            {doorToDoorWarning && (
              <p className="border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-deep">
                J&T door-to-door delivery is not confirmed for this barangay. We will review before shipping.
              </p>
            )}
            <textarea className="field" rows="2" placeholder="Order notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </fieldset>

          <p className="mt-6 text-sm text-ink-soft">{addressReady ? deliveryEstimate(region) : 'Complete your address to see estimated delivery time.'}</p>

          {status.message && (
            <p className={`mt-4 text-sm ${status.tone === 'error' ? 'text-accent-deep' : 'text-ink-soft'}`} role="status">
              {status.message}
            </p>
          )}

          <button type="submit" className="btn-ink mt-6 w-full" disabled={pending}>
            {pending ? 'Placing order...' : 'Place COD order'}
          </button>
          <p className="mt-3 text-xs text-clay">No payment now. We text you to confirm, then you pay cash on delivery.</p>
        </form>

        <aside className="lg:border-l lg:border-line lg:pl-12">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Order summary</h2>
          {!items.length ? (
            <div className="mt-6">
              <p className="text-sm text-ink-soft">Your cart is empty.</p>
              <Link to="/#new-arrivals" className="btn-ghost mt-4">Continue shopping</Link>
            </div>
          ) : (
            <>
              <div className="mt-6 space-y-5">
                {items.map((item) => (
                  <article key={item.variantId} className="flex gap-4">
                    <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-cream">
                      {item.imageUrl && <img src={item.imageUrl} alt={item.productName} className="h-full w-full object-cover" loading="lazy" />}
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-paper">{item.quantity}</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold leading-snug">{item.productName}</h3>
                      <p className="text-xs uppercase tracking-[0.12em] text-clay">{item.size}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <button type="button" className="border border-line px-2 py-0.5" onClick={() => updateQuantity(item.variantId, Number(item.quantity) - 1)} aria-label="Decrease quantity">−</button>
                        <button type="button" className="border border-line px-2 py-0.5" onClick={() => updateQuantity(item.variantId, Number(item.quantity) + 1)} aria-label="Increase quantity">+</button>
                        <button type="button" className="text-clay underline hover:text-accent" onClick={() => removeFromCart(item.variantId)}>Remove</button>
                      </div>
                    </div>
                    <strong className="text-sm">{formatMoney(Number(item.unitPriceCents) * Number(item.quantity))}</strong>
                  </article>
                ))}
              </div>
              <div className="mt-8 border-t border-line pt-4">
                <div className="flex gap-2">
                  <input
                    className="field flex-1 uppercase"
                    placeholder="Discount code"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                  />
                  <button type="button" className="btn-ghost !px-4" onClick={applyDiscount}>Apply</button>
                </div>
                {discountError && <p className="mt-2 text-xs text-accent-deep" role="alert">{discountError}</p>}
                {discount && (
                  <p className="mt-2 text-xs text-[#2f7d32]">
                    Code {discount.code} applied — you save {formatMoney(discount.discountTotalCents)}.{' '}
                    <button type="button" className="underline" onClick={() => { setDiscount(null); setDiscountInput(''); }}>Remove</button>
                  </p>
                )}
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd>{formatMoney(totals.subtotalCents)}</dd></div>
                {totals.discountTotalCents > 0 && (
                  <div className="flex justify-between text-[#2f7d32]"><dt>Discount{discount ? ` (${discount.code})` : ''}</dt><dd>−{formatMoney(totals.discountTotalCents)}</dd></div>
                )}
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Shipping</dt>
                  <dd>{addressReady ? (totals.shippingFeeCents ? formatMoney(totals.shippingFeeCents) : 'Free') : 'Calculated after address'}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
                  <dt>Total</dt><dd>{formatMoney(totals.totalCents)}</dd>
                </div>
              </dl>
              <p className="mt-4 bg-cream px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                {totals.freeShippingUnlocked ? 'Free shipping unlocked.' : 'Add 1 more item to unlock free shipping.'}
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
