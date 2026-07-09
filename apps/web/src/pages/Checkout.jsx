import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createCheckoutQuote, createQuoteBackedOrder, fetchProducts } from '../lib/api.js';
import { customerJson, useCustomerLoggedIn } from '../lib/customerAuth.js';
import { addToCart, cartQuantity, clearCart, clearCheckoutIdempotencyKey, getCartSessionId, getCheckoutIdempotencyKey, removeFromCart, resetCartSessionId, subtotalCents, syncCartSession, updateQuantity, useCart } from '../lib/cart.js';
import { formatMoney } from '../lib/money.js';
import { trackFacebookAddToCart, trackFacebookPurchase } from '../lib/metaPixel.js';
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
  const [missingFields, setMissingFields] = useState({});
  const [suggestedProducts, setSuggestedProducts] = useState([]);
  const placingOrderRef = useRef(false);
  const checkoutFieldRefs = {
    fullName: useRef(null),
    phone: useRef(null),
    house: useRef(null),
    province: useRef(null),
    city: useRef(null),
    barangay: useRef(null)
  };

  useEffect(() => {
    loadProvinces().then(setProvinces);
  }, []);

  useEffect(() => {
    if (!items.length && !placingOrderRef.current) {
      navigate('/cart', { replace: true, state: { message: 'Your cart is empty. Please add an item before checking out.' } });
    }
  }, [items.length, navigate]);

  useEffect(() => {
    loadStorefrontSettings().then(setSettings);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((body) => {
        if (!cancelled) setSuggestedProducts(body.products || []);
      })
      .catch(() => {
        if (!cancelled) setSuggestedProducts([]);
      });
    return () => {
      cancelled = true;
    };
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
  const oneItemCheckout = cartQuantity(items) === 1;
  const suggestedCheckoutProducts = useMemo(() => {
    const cartProductKeys = new Set(items.map((item) => item.slug || item.productId));
    return suggestedProducts
      .filter((product) => !cartProductKeys.has(product.slug) && !cartProductKeys.has(product.id))
      .filter((product) => product.merchandisingStatus !== 'sold_out')
      .filter((product) => product.images?.[0]?.url)
      .filter((product) => product.variants?.some((variant) => Number(variant.stockQuantity) > 0))
      .slice(0, 4);
  }, [items, suggestedProducts]);

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

  function addSuggestedProductToCart(product) {
    const variant = product.variants?.find((candidate) => Number(candidate.stockQuantity) > 0);
    if (!variant) return;
    const cartItem = {
      productId: product.id,
      slug: product.slug,
      variantId: variant.id,
      productName: product.name,
      size: variant.size,
      quantity: 1,
      unitPriceCents: variant.priceCents ?? product.priceCents,
      imageUrl: product.images?.[0]?.url || '',
      externalPosProductId: product.externalPosProductId || '',
      externalPosVariantId: variant.externalPosVariantId || ''
    };
    addToCart(cartItem);
    trackFacebookAddToCart(cartItem);
    setStatus({ tone: 'neutral', message: `${product.name} was added to your cart.` });
  }

  function fieldClass(fieldName) {
    return `field customer-input ${missingFields[fieldName] ? 'checkout-field-error' : ''}`;
  }

  function clearMissingField(fieldName) {
    setMissingFields((current) => {
      if (!current[fieldName]) return current;
      const next = { ...current };
      delete next[fieldName];
      return next;
    });
  }

  function focusMissingField(fieldName) {
    requestAnimationFrame(() => {
      const node = checkoutFieldRefs[fieldName]?.current;
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof node.focus === 'function') node.focus({ preventScroll: true });
    });
  }

  function validateDetails() {
    if (!items.length) {
      setMissingFields({});
      setStatus({ tone: 'error', message: 'Your cart is empty. Add an item before placing an order.' });
      return false;
    }
    const missing = [];
    if (!fullName.trim()) missing.push({ key: 'fullName', label: 'Full name' });
    if (!phone.trim()) missing.push({ key: 'phone', label: 'Mobile number' });
    if (!house.trim()) missing.push({ key: 'house', label: 'House Number / Street / Building / Unit' });
    if (!province) missing.push({ key: 'province', label: 'Province' });
    if (!city) missing.push({ key: 'city', label: 'City / Municipality' });
    if (!barangay) missing.push({ key: 'barangay', label: 'Barangay' });
    if (missing.length) {
      setMissingFields(Object.fromEntries(missing.map((field) => [field.key, true])));
      setStatus({ tone: 'error', message: `Please complete the missing checkout information: ${missing.map((field) => field.label).join(', ')}.` });
      focusMissingField(missing[0].key);
      return false;
    }
    setMissingFields({});
    return true;
  }

  async function handleReview(event) {
    event.preventDefault();
    setDiscountError('');
    if (!validateDetails()) return;

    setStatus({ tone: 'neutral', message: 'Reviewing current prices and promos...' });
    setPending(true);
    try {
      const manualDiscountCode = discountInput.trim();
      const nextQuote = await refreshQuote(manualDiscountCode);
      setReviewQuote(nextQuote);
      if (discountInput.trim()) {
        setActiveDiscountCode(nextQuote?.discountCode || discountInput.trim());
      }
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

    const orderDiscountCode = activeDiscountCode ? discountInput.trim() : '';
    const latestQuote = await refreshQuote(orderDiscountCode).catch((error) => {
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
      const idempotencyKey = getCheckoutIdempotencyKey(latestQuote.id);
      const result = await createQuoteBackedOrder(
        payload,
        latestQuote.id,
        idempotencyKey
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
      placingOrderRef.current = true;
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
    <div className="customer-checkout-shell min-h-screen bg-[var(--customer-bg)]">
      <header className="border-b border-[var(--customer-border)] bg-[var(--customer-surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 lg:px-8">
          <Link to="/" className="display text-xl">Maria<span className="text-accent">Clara</span></Link>
          <Link to="/cart" className="text-[12px] font-semibold uppercase tracking-[0.18em] hover:text-accent">Back to cart</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1.1fr_1fr] lg:px-8">
        <form className="customer-card rounded-[8px] border border-[var(--customer-border)] bg-[var(--customer-surface)] p-5 shadow-sm sm:p-6" onSubmit={step === 'review' ? handleSubmit : handleReview} noValidate>
          <p className="eyebrow">Checkout · Cash on Delivery</p>
          <h1 className="display mt-2 text-2xl leading-tight sm:text-4xl">{step === 'review' ? 'Review and place order' : 'Where do we send it?'}</h1>
          {!loggedIn && (
            <p className="mt-3 text-sm text-ink-soft">
              <Link to="/login" state={{ from: '/checkout' }} className="text-accent underline">Log in</Link> to
              prefill your saved address — or continue as guest below.
            </p>
          )}

          <fieldset className="mt-8 space-y-4" disabled={step === 'review'}>
            <legend className="text-sm font-semibold uppercase tracking-[0.12em]">Contact</legend>
            <input ref={checkoutFieldRefs.fullName} className={fieldClass('fullName')} required placeholder="Full name" value={fullName} onChange={(e) => { setFullName(e.target.value); clearMissingField('fullName'); }} autoComplete="name" />
            <input ref={checkoutFieldRefs.phone} className={fieldClass('phone')} required type="tel" placeholder="Mobile number (09XXXXXXXXX)" value={phone} onChange={(e) => { setPhone(e.target.value); clearMissingField('phone'); }} autoComplete="tel" />
            <input className="field customer-input" type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </fieldset>

          <fieldset className="mt-8 space-y-4" disabled={step === 'review'}>
            <legend className="text-sm font-semibold uppercase tracking-[0.12em]">Shipping address</legend>
            <input ref={checkoutFieldRefs.house} className={fieldClass('house')} required placeholder="House no. / Street / Building / Unit" value={house} onChange={(e) => { setHouse(e.target.value); clearMissingField('house'); }} autoComplete="street-address" />
            <select ref={checkoutFieldRefs.province} className={fieldClass('province')} required value={provinceCode} onChange={(e) => { setProvinceCode(e.target.value); clearMissingField('province'); }}>
              <option value="">Select province</option>
              {provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            <select ref={checkoutFieldRefs.city} className={fieldClass('city')} required value={cityCode} disabled={!cities.length} onChange={(e) => { setCityCode(e.target.value); clearMissingField('city'); }}>
              <option value="">{provinceCode ? 'Select city / municipality' : 'Select province first'}</option>
              {cities.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            <select ref={checkoutFieldRefs.barangay} className={fieldClass('barangay')} required value={barangayCode} disabled={!barangays.length} onChange={(e) => { setBarangayCode(e.target.value); clearMissingField('barangay'); }}>
              <option value="">{cityCode ? 'Select barangay' : 'Select city / municipality first'}</option>
              {barangays.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            {doorToDoorWarning && (
              <p className="border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-deep">
                J&T door-to-door delivery is not confirmed for this barangay. We will review before shipping.
              </p>
            )}
            <textarea className="field customer-input" rows="2" placeholder="Order notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
              <label key={method.id} className="flex items-start gap-3 rounded-[8px] border border-line bg-white px-4 py-3 text-sm">
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

          {settings.shipping.freeShippingEnabled && (
            <section className="checkout-free-shipping-reminder mt-5 rounded-[8px] border border-[var(--customer-border)] bg-[var(--customer-accent-soft)]/45 p-4 text-left">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink">Buy 2 or more items and get FREE shipping.</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {cartQuantity(items) >= settings.shipping.freeShippingMinimumItems
                  ? 'Free shipping is already unlocked for this order.'
                  : `Add ${Math.max(0, settings.shipping.freeShippingMinimumItems - cartQuantity(items))} more ${Math.max(0, settings.shipping.freeShippingMinimumItems - cartQuantity(items)) === 1 ? 'item' : 'items'} to remove the delivery fee.`}
              </p>
            </section>
          )}

          {settings.shipping.freeShippingEnabled && oneItemCheckout && (
            <section className="checkout-one-item-offer mt-4 rounded-[8px] border border-accent/25 bg-white px-4 py-3 text-left shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent-deep">Add one more item to get FREE shipping.</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                You are one piece away from unlocking the shipping offer before placing this order.
              </p>
            </section>
          )}

          {status.message && (
            <p className={`mt-4 text-sm ${status.tone === 'error' ? 'text-accent-deep' : 'text-ink-soft'}`} role={status.tone === 'error' ? 'alert' : 'status'}>
              {status.message}
            </p>
          )}

          {step === 'review' && (
            <section className="mt-6 rounded-[8px] border border-line bg-white p-4 text-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Review</h2>
              <dl className="mt-3 space-y-2">
                <div><dt className="font-semibold">Customer</dt><dd>{fullName} · {phone}</dd></div>
                <div><dt className="font-semibold">Delivery address</dt><dd>{house.trim()}, {barangay?.name}, {city?.name}, {province?.name}, Philippines</dd></div>
                <div><dt className="font-semibold">Payment</dt><dd>{settings.paymentMethods.find((method) => method.id === paymentMethod)?.label || 'Cash on Delivery'}</dd></div>
              </dl>
            </section>
          )}

          {step === 'review' && (
            <button type="button" className="btn-ghost customer-compact-button mt-6 w-full" onClick={() => setStep('details')} disabled={pending}>
              Back to details
            </button>
          )}
          <button type="submit" className="btn-ink customer-compact-button mt-6 w-full" disabled={pending}>
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

        <aside className="customer-order-summary self-start rounded-[8px] border border-[var(--customer-border)] bg-[var(--customer-surface)] p-5 shadow-sm lg:sticky lg:top-6">
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
                    <div className="relative aspect-[4/5] w-16 shrink-0 self-start overflow-hidden bg-transparent sm:w-20">
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
                        <button type="button" className="touch-target border border-line px-2 py-0.5" onClick={() => updateQuantity(item.variantId, Number(item.quantity) - 1)} aria-label="Decrease quantity">−</button>
                        <button type="button" className="touch-target border border-line px-2 py-0.5" onClick={() => updateQuantity(item.variantId, Number(item.quantity) + 1)} aria-label="Increase quantity">+</button>
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
                    className="field customer-input flex-1 uppercase"
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

      {suggestedCheckoutProducts.length > 0 && (
        <section className="checkout-upsell-products mx-auto max-w-6xl px-5 pb-12 lg:px-8" aria-label="Suggested products">
          <div className="border-t border-[var(--customer-border)] pt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Complete the order</p>
                <h2 className="display mt-2 text-2xl leading-tight sm:text-3xl">Add one more favorite</h2>
              </div>
              <p className="max-w-xs text-sm text-ink-soft">Small add-ons that can help unlock free shipping before checkout.</p>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
              {suggestedCheckoutProducts.map((product) => {
                const image = product.images[0];
                return (
                  <article key={product.id} className="min-w-0 text-center">
                    <Link to={`/product/${encodeURIComponent(product.slug)}`} className="block aspect-[4/5] overflow-hidden bg-transparent">
                      <img
                        src={image.url}
                        alt={image.altText || `Product photo for ${product.name}`}
                        className="product-photo-blend h-full w-full object-contain"
                        loading="lazy"
                      />
                    </Link>
                    <h3 className="mt-2 line-clamp-2 text-center text-sm font-semibold leading-snug">{product.name}</h3>
                    <p className="mt-1 text-center text-sm font-semibold">{formatMoney(product.priceCents)}</p>
                    <button
                      type="button"
                      className="btn-ghost customer-compact-button mt-3 w-full !px-3 !py-2 text-[10px]"
                      onClick={() => addSuggestedProductToCart(product)}
                    >
                      Add to Cart
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
