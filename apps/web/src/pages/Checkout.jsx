import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createCheckoutQuote, createQuoteBackedOrder } from '../lib/api.js';
import { customerJson, getCustomerToken, useCustomerLoggedIn } from '../lib/customerAuth.js';
import { cartQuantity, clearCart, clearCheckoutIdempotencyKey, getCartSessionId, getCheckoutIdempotencyKey, removeFromCart, resetCartSessionId, subtotalCents, syncCartSession, updateQuantity, useCart } from '../lib/cart.js';
import { formatMoney } from '../lib/money.js';
import { trackFacebookPurchase } from '../lib/metaPixel.js';
import {
  loadBarangays,
  loadCities,
  loadProvinces,
  regionForProvince,
  regionLabel
} from '../lib/addressGuide.js';
import {
  DEFAULT_STOREFRONT_SETTINGS,
  freeShippingHint,
  isFreeShipping,
  loadStorefrontSettings,
  regionEstimate,
  regionFee
} from '../lib/storeSettings.js';

function checkoutTotals(items, region, discountTotalCents, settings) {
  const subtotal = subtotalCents(items);
  const freeShippingUnlocked = isFreeShipping(settings, cartQuantity(items));
  const shippingFeeCents = items.length && !freeShippingUnlocked && region !== 'pending_address'
    ? regionFee(settings, region)
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

function quoteTotals(quote, fallbackTotals) {
  if (!quote) return fallbackTotals;
  return {
    ...fallbackTotals,
    subtotalCents: quote.subtotalCents,
    shippingFeeCents: quote.shippingFeeCents,
    discountTotalCents: quote.discountTotalCents,
    totalCents: quote.totalCents,
    freeShippingUnlocked: quote.freeShippingUnlocked
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
  const [activeDiscountCode, setActiveDiscountCode] = useState('');
  const [discountError, setDiscountError] = useState('');
  const [quote, setQuote] = useState(null);
  const [reviewQuote, setReviewQuote] = useState(null);
  const [step, setStep] = useState('details');
  const loggedIn = useCustomerLoggedIn();
  const [prefillAddress, setPrefillAddress] = useState(null);
  const [saveAddress, setSaveAddress] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_STOREFRONT_SETTINGS);
  const [paymentMethod, setPaymentMethod] = useState('cash_on_delivery');

  useEffect(() => {
    loadProvinces().then(setProvinces);
  }, []);

  useEffect(() => {
    loadStorefrontSettings().then(setSettings);
  }, []);

  // if an admin disables the chosen method between loads, fall back to COD
  useEffect(() => {
    if (!settings.paymentMethods.some((method) => method.id === paymentMethod)) {
      setPaymentMethod('cash_on_delivery');
    }
  }, [settings, paymentMethod]);

  useEffect(() => {
    if (!loggedIn) return;
    customerJson('/api/customer/me')
      .then(({ customer }) => {
        setFullName((value) => value || customer.fullName);
        setPhone((value) => value || customer.phone);
        setEmail((value) => value || customer.email);
        if (customer.savedAddress) {
          setHouse((value) => value || customer.savedAddress.houseAddress);
          setPrefillAddress(customer.savedAddress);
        }
      })
      .catch(() => {});
  }, [loggedIn]);

  // cascade the saved address through the dependent selects as each level loads
  useEffect(() => {
    if (!prefillAddress || !provinces.length) return;
    const match = provinces.find((item) => item.name === String(prefillAddress.province).toUpperCase());
    if (match) setProvinceCode(match.code);
  }, [prefillAddress, provinces]);

  useEffect(() => {
    setCities([]);
    setCityCode('');
    setBarangays([]);
    setBarangayCode('');
    if (provinceCode) loadCities(provinceCode).then(setCities);
  }, [provinceCode]);

  useEffect(() => {
    if (!prefillAddress || !cities.length) return;
    const match = cities.find((item) => item.name === String(prefillAddress.city).toUpperCase());
    if (match) setCityCode(match.code);
  }, [prefillAddress, cities]);

  useEffect(() => {
    setBarangays([]);
    setBarangayCode('');
    if (cityCode) loadBarangays(cityCode).then(setBarangays);
  }, [cityCode]);

  useEffect(() => {
    if (!prefillAddress || !barangays.length) return;
    const match = barangays.find((item) => item.name === String(prefillAddress.barangay).toUpperCase());
    if (match) {
      setBarangayCode(match.code);
      setPrefillAddress(null);
    }
  }, [prefillAddress, barangays]);

  const province = provinces.find((item) => item.code === provinceCode) || null;
  const city = cities.find((item) => item.code === cityCode) || null;
  const barangay = barangays.find((item) => item.code === barangayCode) || null;
  const addressReady = Boolean(house.trim() && provinceCode && cityCode && barangayCode);
  const region = addressReady ? regionForProvince(province) : 'pending_address';
  const fallbackTotals = useMemo(() => checkoutTotals(items, region, 0, settings), [items, region, settings]);
  const totals = quoteTotals(reviewQuote || quote, fallbackTotals);
  const doorToDoorWarning = Boolean(barangay) && String(barangay.doorToDoor || '').toUpperCase() !== 'YES';

  function quotePayload(discountCode = activeDiscountCode) {
    return {
      cartSessionId: getCartSessionId(),
      items,
      discountCode,
      ...(addressReady ? { address: {
        houseAddress: house.trim(),
        provinceCode,
        cityCode,
        barangayCode
      } } : {})
    };
  }

  async function refreshQuote(discountCode = activeDiscountCode) {
    const body = await createCheckoutQuote(quotePayload(discountCode));
    setQuote(body.quote || null);
    return body.quote || null;
  }

  useEffect(() => {
    if (!items.length) return;
    syncCartSession({
      checkoutStarted: true,
      customer: { fullName, phone, email },
      address: {
        addressLine: [house, barangay?.name, city?.name, province?.name].filter(Boolean).join(', '),
        province: province?.name || '',
        city: city?.name || '',
        barangay: barangay?.name || ''
      },
      items
    });
  }, [items, fullName, phone, email, house, province, city, barangay]);

  useEffect(() => {
    setReviewQuote(null);
    setStep('details');
  }, [items, provinceCode, cityCode, barangayCode, house, activeDiscountCode]);

  useEffect(() => {
    if (!items.length) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    createCheckoutQuote(quotePayload(activeDiscountCode))
      .then((body) => {
        if (!cancelled) setQuote(body.quote || null);
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [items, region, activeDiscountCode, settings]);

  async function applyDiscount() {
    const code = discountInput.trim();
    setDiscountError('');
    if (!code) {
      setActiveDiscountCode('');
      setReviewQuote(null);
      refreshQuote('').catch(() => {});
      return;
    }
    try {
      const nextQuote = await refreshQuote(code);
      setActiveDiscountCode(nextQuote?.discountCode || code);
      setReviewQuote(null);
    } catch (error) {
      setActiveDiscountCode('');
      setDiscountError(error.message);
    }
  }

  function validateDetails() {
    if (!items.length) {
      setStatus({ tone: 'error', message: 'Your cart is empty. Add an item before placing an order.' });
      return false;
    }
    const missing = [];
    if (!fullName.trim()) missing.push('Full name');
    if (!phone.trim()) missing.push('Mobile number');
    if (!house.trim()) missing.push('House Number / Street / Building / Unit');
    if (!barangay) missing.push('Barangay');
    if (!province) missing.push('Province');
    if (!city) missing.push('City / Municipality');
    if (missing.length) {
      setStatus({ tone: 'error', message: `Complete your checkout details: ${missing.join(', ')}.` });
      return false;
    }
    return true;
  }

  async function handleReview(event) {
    event.preventDefault();
    setDiscountError('');
    if (!validateDetails()) return;

    setStatus({ tone: 'neutral', message: 'Reviewing current prices and promos...' });
    setPending(true);
    try {
      const nextQuote = await refreshQuote(discountInput.trim());
      setReviewQuote(nextQuote);
      setActiveDiscountCode(nextQuote?.discountCode || discountInput.trim());
      setStep('review');
      setStatus({ tone: 'neutral', message: '' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setPending(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validateDetails()) return;

    setStatus({ tone: 'neutral', message: 'Placing your order...' });
    setPending(true);

    const latestQuote = await refreshQuote(discountInput.trim()).catch((error) => {
      setStatus({ tone: 'error', message: error.message });
      return null;
    });
    if (!latestQuote) {
      setPending(false);
      return;
    }
    const reviewedTotals = ['subtotalCents', 'discountTotalCents', 'shippingFeeCents', 'totalCents'];
    if (!reviewQuote || reviewedTotals.some((field) => reviewQuote[field] !== latestQuote[field])) {
      setReviewQuote(latestQuote);
      setStatus({ tone: 'error', message: 'Checkout totals changed. Review the updated total before placing your order.' });
      setPending(false);
      return;
    }
    const payload = {
      cartSessionId: getCartSessionId(),
      customer: { fullName: fullName.trim(), phone: phone.trim(), email: email.trim() },
      paymentMethod,
      notes: notes.trim(),
    };

    try {
      const token = loggedIn ? getCustomerToken() : '';
      const idempotencyKey = getCheckoutIdempotencyKey(latestQuote.id);
      const result = await createQuoteBackedOrder(
        payload,
        latestQuote.id,
        idempotencyKey,
        token ? { Authorization: `Bearer ${token}` } : {}
      );
      trackFacebookPurchase(result, result.items, result.trackingEventId);
      if (loggedIn && saveAddress) {
        customerJson('/api/customer/me', {
          method: 'PUT',
          body: JSON.stringify({ savedAddress: {
            houseAddress: house.trim(),
            provinceCode, province: province.name,
            cityCode, city: city.name,
            barangayCode, barangay: barangay.name,
            postalCode: ''
          } })
        }).catch(() => {});
      }
      sessionStorage.setItem('maria-clara-last-order', JSON.stringify({
        orderNumber: result.orderNumber,
        confirmationToken: result.confirmationToken
      }));
      clearCheckoutIdempotencyKey();
      clearCart();
      resetCartSessionId();
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
        <form onSubmit={step === 'review' ? handleSubmit : handleReview} noValidate={false}>
          <p className="eyebrow">Checkout · Cash on Delivery</p>
          <h1 className="display mt-2 text-3xl sm:text-4xl">{step === 'review' ? 'Review and place order' : 'Where do we send it?'}</h1>
          {!loggedIn && (
            <p className="mt-3 text-sm text-ink-soft">
              <Link to="/login" state={{ from: '/checkout' }} className="text-accent underline">Log in</Link> to
              prefill your saved address — or continue as guest below.
            </p>
          )}

          <fieldset className="mt-8 space-y-4" disabled={step === 'review'}>
            <legend className="text-sm font-semibold uppercase tracking-[0.12em]">Contact</legend>
            <input className="field" required placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            <input className="field" required type="tel" placeholder="Mobile number (09XXXXXXXXX)" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            <input className="field" type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </fieldset>

          <fieldset className="mt-8 space-y-4" disabled={step === 'review'}>
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
            {loggedIn && (
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                Save this address to my account
              </label>
            )}
          </fieldset>

          <fieldset className="mt-8 space-y-3" disabled={step === 'review'}>
            <legend className="text-sm font-semibold uppercase tracking-[0.12em]">Payment</legend>
            {settings.paymentMethods.map((method) => (
              <label key={method.id} className="flex items-start gap-3 border border-line px-4 py-3 text-sm">
                <input
                  type="radio"
                  name="payment-method"
                  value={method.id}
                  checked={paymentMethod === method.id}
                  onChange={() => setPaymentMethod(method.id)}
                />
                <span>
                  <span className="font-semibold">{method.label}</span>
                  {paymentMethod === method.id && method.instructions && (
                    <span className="mt-1 block text-xs text-ink-soft">{method.instructions}</span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>

          <p className="mt-6 text-sm text-ink-soft">{addressReady ? regionEstimate(settings, region) : 'Complete your address to see estimated delivery time.'}</p>

          {status.message && (
            <p className={`mt-4 text-sm ${status.tone === 'error' ? 'text-accent-deep' : 'text-ink-soft'}`} role="status">
              {status.message}
            </p>
          )}

          {step === 'review' && (
            <section className="mt-6 border border-line bg-white p-4 text-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Review</h2>
              <dl className="mt-3 space-y-2">
                <div><dt className="font-semibold">Customer</dt><dd>{fullName} · {phone}</dd></div>
                <div><dt className="font-semibold">Delivery address</dt><dd>{house.trim()}, {barangay?.name}, {city?.name}, {province?.name}, Philippines</dd></div>
                <div><dt className="font-semibold">Payment</dt><dd>{settings.paymentMethods.find((method) => method.id === paymentMethod)?.label || 'Cash on Delivery'}</dd></div>
              </dl>
            </section>
          )}

          {step === 'review' && (
            <button type="button" className="btn-ghost mt-6 w-full" onClick={() => setStep('details')} disabled={pending}>
              Back to details
            </button>
          )}
          <button type="submit" className="btn-ink mt-6 w-full" disabled={pending}>
            {pending
              ? (step === 'review' ? 'Placing order...' : 'Preparing review...')
              : step === 'review'
                ? (paymentMethod === 'cash_on_delivery' ? 'Place COD order' : 'Place order')
                : 'Continue to review'}
          </button>
          <p className="mt-3 text-xs text-clay">
            {paymentMethod === 'cash_on_delivery'
              ? 'No payment now. We text you to confirm, then you pay cash on delivery.'
              : 'We text you to confirm your order and payment before shipping.'}
          </p>
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
                  <article key={item.variantId} className="flex min-w-0 gap-3 sm:gap-4">
                    <div className="relative aspect-[4/5] w-16 shrink-0 self-start overflow-hidden bg-cream sm:w-20">
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="product-photo-blend block h-full w-full object-contain"
                          loading="lazy"
                        />
                      )}
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-paper">{item.quantity}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-sm font-semibold leading-snug">{item.productName}</h3>
                      <p className="text-xs uppercase tracking-[0.12em] text-clay">{item.size}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <button type="button" className="border border-line px-2 py-0.5" onClick={() => updateQuantity(item.variantId, Number(item.quantity) - 1)} aria-label="Decrease quantity">−</button>
                        <button type="button" className="border border-line px-2 py-0.5" onClick={() => updateQuantity(item.variantId, Number(item.quantity) + 1)} aria-label="Increase quantity">+</button>
                        <button type="button" className="text-clay underline hover:text-accent" onClick={() => removeFromCart(item.variantId)}>Remove</button>
                      </div>
                    </div>
                    <strong className="shrink-0 text-sm">{formatMoney(Number(item.unitPriceCents) * Number(item.quantity))}</strong>
                  </article>
                ))}
              </div>
              <div className="mt-8 border-t border-line pt-4">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <input
                    className="field flex-1 uppercase"
                    placeholder="Discount code"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                  />
                  <button type="button" className="btn-ghost !px-4" onClick={applyDiscount}>Apply</button>
                </div>
                {discountError && <p className="mt-2 text-xs text-accent-deep" role="alert">{discountError}</p>}
                {activeDiscountCode && (
                  <p className="mt-2 text-xs text-[#2f7d32]">
                    Code {activeDiscountCode} applied — you save {formatMoney(totals.discountTotalCents)}.{' '}
                    <button type="button" className="underline" onClick={() => { setActiveDiscountCode(''); setDiscountInput(''); setReviewQuote(null); }}>Remove</button>
                  </p>
                )}
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd>{formatMoney(totals.subtotalCents)}</dd></div>
                {totals.discountTotalCents > 0 && (
                  <div className="flex justify-between text-[#2f7d32]"><dt>Discount{activeDiscountCode ? ` (${activeDiscountCode})` : ''}</dt><dd>−{formatMoney(totals.discountTotalCents)}</dd></div>
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
                {totals.freeShippingUnlocked ? 'Free shipping unlocked.' : freeShippingHint(settings, cartQuantity(items))}
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
