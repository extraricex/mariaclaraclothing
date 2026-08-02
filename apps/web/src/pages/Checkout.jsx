import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import CheckoutHeader from '../components/CheckoutHeader.jsx';
import { createCheckoutQuote } from '../lib/api.js';
import { customerJson, useCustomerLoggedIn } from '../lib/customerAuth.js';
import { cartQuantity, getCartSessionId, subtotalCents, syncCartSession, useCart } from '../lib/cart.js';
import { checkoutCartFingerprint, loadCheckoutReviewDraft, saveCheckoutReviewDraft } from '../lib/checkoutDraft.js';
import { trackFacebookInitiateCheckout } from '../lib/metaPixel.js';
import { loadBarangays, loadCities, loadProvinces, regionForProvince } from '../lib/addressGuide.js';
import { DEFAULT_STOREFRONT_SETTINGS, loadStorefrontSettings, regionEstimate } from '../lib/storeSettings.js';
import { customerNameParts } from '../lib/customerName.js';
import { normalizedCheckoutDetails } from '../lib/checkoutValidation.js';
import { isCartAvailabilityError } from '../lib/checkoutAvailability.js';
import { trackFunnelEvent } from '../lib/funnelAnalytics.js';
import { fetchWithRecovery } from '../lib/network.js';
import { claimedOfferCode } from '../lib/claimOffer.js';

function checkoutErrorCategory(error, fallback = 'order_api_failure') {
  const code = String(error?.code || '').trim().toLowerCase();
  if (['insufficient_stock', 'product_unavailable', 'variant_unavailable', 'cart_invalid'].includes(code)) return 'insufficient_stock';
  if (['address_invalid', 'incomplete_delivery_address', 'checkout_customer_invalid'].includes(code)) return 'invalid_address';
  if (code.includes('phone')) return 'invalid_phone';
  if (code.includes('duplicate') || code.includes('idempot')) return 'duplicate_submission';
  return fallback;
}

export default function Checkout() {
  const items = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const paymentWasCancelled = useMemo(
    () => new URLSearchParams(location.search).get('payment') === 'cancelled',
    [location.search]
  );
  const loggedIn = useCustomerLoggedIn();
  const initialDraft = useMemo(() => loadCheckoutReviewDraft(), []);
  const checkoutDiscountCode = initialDraft?.discountCode || claimedOfferCode();
  const metaTestAuthorization = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const reference = String(params.get('meta_test_reference') || '').trim().toUpperCase();
    const grant = String(params.get('meta_test_grant') || '').trim();
    if (/^META-TEST-[A-Z0-9-]{8,80}$/.test(reference) && grant.length >= 80) {
      return { metaTestReference: reference, metaTestGrant: grant };
    }
    return {
      metaTestReference: initialDraft?.metaTestReference || '',
      metaTestGrant: initialDraft?.metaTestGrant || ''
    };
  }, [initialDraft, location.search]);
  const initialCustomerName = useMemo(() => customerNameParts(initialDraft?.customer), [initialDraft]);

  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [provinceCode, setProvinceCode] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [barangayCode, setBarangayCode] = useState('');
  const [house, setHouse] = useState(initialDraft?.address?.houseAddress || '');
  const [postalCode, setPostalCode] = useState(initialDraft?.address?.postalCode || '');
  const [firstName, setFirstName] = useState(initialCustomerName.firstName);
  const [lastName, setLastName] = useState(initialCustomerName.lastName);
  const [phone, setPhone] = useState(initialDraft?.customer?.phone || '');
  const [email, setEmail] = useState(initialDraft?.customer?.email || '');
  const [recoveryConsent, setRecoveryConsent] = useState(Boolean(initialDraft?.recoveryConsent));
  const [prefillAddress, setPrefillAddress] = useState(initialDraft?.address || null);
  const [saveAddress, setSaveAddress] = useState(initialDraft?.saveAddress ?? true);
  const [settings, setSettings] = useState(DEFAULT_STOREFRONT_SETTINGS);
  const [socialProviders, setSocialProviders] = useState({ google: false, facebook: false });
  const [missingFields, setMissingFields] = useState({});
  const [pending, setPending] = useState(false);
  const [cartAvailability, setCartAvailability] = useState({ state: 'checking', message: '' });
  const [status, setStatus] = useState({
    tone: (location.state?.message || paymentWasCancelled) ? 'error' : 'neutral',
    message: location.state?.message || (paymentWasCancelled
      ? 'Online payment was cancelled. Your delivery details and cart are still saved. Review them below, then continue to retry or choose Cash on Delivery.'
      : '')
  });
  const checkoutFieldRefs = {
    firstName: useRef(null),
    lastName: useRef(null),
    phone: useRef(null),
    email: useRef(null),
    house: useRef(null),
    province: useRef(null),
    city: useRef(null),
    barangay: useRef(null),
    postalCode: useRef(null)
  };

  useEffect(() => {
    loadProvinces().then(setProvinces);
    loadStorefrontSettings().then(setSettings);
    fetchWithRecovery('/api/customer/oauth/status', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => setSocialProviders(body.providers || { google: false, facebook: false }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!paymentWasCancelled) return;
    trackFunnelEvent('payment_cancelled', {
      paymentMethod: 'paymongo',
      metricName: 'CUSTOMER_RETURN',
      errorCategory: 'payment_cancelled',
      errorMessage: 'Customer returned from online payment without completing payment.',
      checkoutStep: 'payment',
      reference: getCartSessionId(),
      dedupeKey: `paymongo-cancelled:${getCartSessionId()}`,
      dedupeMilliseconds: 60_000
    });
  }, [paymentWasCancelled]);

  useEffect(() => {
    if (!items.length) return;
    const cartSessionId = getCartSessionId();
    trackFunnelEvent('checkout_start', {
      quantity: cartQuantity(items),
      valueCents: subtotalCents(items),
      checkoutStep: 'information',
      reference: cartSessionId,
      dedupeKey: `checkout-start:${cartSessionId}`,
      dedupeMilliseconds: 60 * 60 * 1000
    });
  }, [items.length]);

  useEffect(() => {
    if (!items.length) {
      navigate('/cart', { replace: true, state: { message: 'Your cart is empty. Please add an item before checking out.' } });
      return;
    }
  }, [items, navigate]);

  useEffect(() => {
    if (!items.length) return undefined;
    let cancelled = false;
    setCartAvailability({ state: 'checking', message: '' });
    createCheckoutQuote({ cartSessionId: getCartSessionId(), items, discountCode: checkoutDiscountCode })
      .then(() => {
        if (!cancelled) setCartAvailability({ state: 'ready', message: '' });
      })
      .catch((error) => {
        if (cancelled) return;
        setCartAvailability(isCartAvailabilityError(error)
          ? { state: 'blocked', message: error.message }
          : { state: 'ready', message: '' });
      });
    return () => {
      cancelled = true;
    };
  }, [checkoutDiscountCode, items]);

  useEffect(() => {
    if (!loggedIn) return;
    customerJson('/api/customer/me')
      .then(({ customer }) => {
        const name = customerNameParts(customer);
        setFirstName((value) => value || name.firstName);
        setLastName((value) => value || name.lastName);
        setPhone((value) => value || customer.phone);
        setEmail((value) => value || customer.email);
        if (!initialDraft?.address && customer.savedAddress) {
          setHouse((value) => value || customer.savedAddress.houseAddress);
          setPostalCode((value) => value || customer.savedAddress.postalCode);
          setPrefillAddress(customer.savedAddress);
        }
      })
      .catch(() => {});
  }, [loggedIn, initialDraft]);

  useEffect(() => {
    if (!prefillAddress || !provinces.length) return;
    const match = provinces.find((item) =>
      item.code === prefillAddress.provinceCode || item.name === String(prefillAddress.province || '').toUpperCase());
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
    const match = cities.find((item) =>
      item.code === prefillAddress.cityCode || item.name === String(prefillAddress.city || '').toUpperCase());
    if (match) setCityCode(match.code);
  }, [prefillAddress, cities]);

  useEffect(() => {
    setBarangays([]);
    setBarangayCode('');
    if (cityCode) loadBarangays(cityCode).then(setBarangays);
  }, [cityCode]);

  useEffect(() => {
    if (!prefillAddress || !barangays.length) return;
    const match = barangays.find((item) =>
      item.code === prefillAddress.barangayCode || item.name === String(prefillAddress.barangay || '').toUpperCase());
    if (match) setBarangayCode(match.code);
    setPrefillAddress(null);
  }, [prefillAddress, barangays]);

  const province = provinces.find((item) => item.code === provinceCode) || null;
  const city = cities.find((item) => item.code === cityCode) || null;
  const barangay = barangays.find((item) => item.code === barangayCode) || null;
  const region = province ? regionForProvince(province) : 'pending_address';
  const doorToDoorWarning = Boolean(barangay) && String(barangay.doorToDoor || '').toUpperCase() !== 'YES';

  useEffect(() => {
    if (!items.length) return;
    syncCartSession({
      checkoutStarted: true,
      customer: {
        firstName,
        lastName,
        fullName: [firstName, lastName].filter(Boolean).join(' ').trim(),
        phone,
        email
      },
      recoveryConsent,
      address: {
        addressLine: [house, barangay?.name, city?.name, province?.name, postalCode].filter(Boolean).join(', '),
        province: province?.name || '',
        city: city?.name || '',
        barangay: barangay?.name || '',
        postalCode
      },
      items
    });
  }, [items, firstName, lastName, phone, email, recoveryConsent, house, province, city, barangay, postalCode]);

  useEffect(() => {
    if (!String(email || '').trim()) setRecoveryConsent(false);
  }, [email]);

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
    const result = normalizedCheckoutDetails({ firstName, lastName, phone, email }, {
      houseAddress: house,
      provinceCode,
      province: province?.name || '',
      cityCode,
      city: city?.name || '',
      barangayCode,
      barangay: barangay?.name || '',
      postalCode
    }, { requireAddressCodes: true });
    if (result.valid) {
      setMissingFields({});
      return result;
    }
    setMissingFields(result.errors);
    setStatus({ tone: 'error', message: 'Please correct the highlighted delivery information before continuing.' });
    const firstInvalidField = Object.keys(result.errors)[0];
    const category = firstInvalidField === 'province' ? 'missing_province'
      : firstInvalidField === 'city' ? 'missing_city'
        : firstInvalidField === 'barangay' ? 'missing_barangay'
          : firstInvalidField === 'phone' ? 'invalid_phone'
            : 'invalid_address';
    trackFunnelEvent('checkout_error', {
      errorCategory: category,
      errorMessage: 'Checkout information did not pass validation.',
      checkoutStep: 'information',
      reference: getCartSessionId(),
      dedupeKey: `validation:${category}:${getCartSessionId()}`,
      dedupeMilliseconds: 3000
    });
    focusMissingField(firstInvalidField);
    return null;
  }

  async function continueToReview(event) {
    event.preventDefault();
    const details = validateDetails();
    if (!items.length || !details) return;
    setPending(true);
    setStatus({ tone: 'neutral', message: 'Checking stock and preparing your review...' });
    const cartSessionId = getCartSessionId();
    const address = {
      ...details.address,
      provinceCode,
      province: province.name,
      cityCode,
      city: city.name,
      barangayCode,
      barangay: barangay.name,
      postalCode: details.address.postalCode
    };
    try {
      const body = await createCheckoutQuote({
        cartSessionId,
        items,
        discountCode: checkoutDiscountCode,
        address
      });
      const quote = body.quote;
      if (!quote?.finalizable) throw new Error('Your checkout information is not ready for review.');
      trackFunnelEvent('shipping_info_completed', {
        quantity: cartQuantity(quote.items || items),
        valueCents: quote.totalCents,
        checkoutStep: 'information',
        reference: cartSessionId,
        dedupeKey: `shipping-complete:${cartSessionId}`,
        dedupeMilliseconds: 60 * 60 * 1000
      });
      trackFacebookInitiateCheckout(
        quote.items || items,
        quote,
        `checkout:${cartSessionId}`
      );
      saveCheckoutReviewDraft({
        cartSessionId,
        cartFingerprint: checkoutCartFingerprint(items),
        customer: details.customer,
        address,
        saveAddress,
        recoveryConsent,
        discountCode: checkoutDiscountCode,
        quote,
        ...metaTestAuthorization
      });
      navigate('/checkout/review');
    } catch (error) {
      trackFunnelEvent('checkout_error', {
        errorCategory: checkoutErrorCategory(error),
        errorMessage: error.message,
        checkoutStep: 'information',
        reference: cartSessionId,
        dedupeKey: `information-error:${cartSessionId}:${error.code || 'unknown'}`,
        dedupeMilliseconds: 10_000
      });
      if (isCartAvailabilityError(error)) {
        saveCheckoutReviewDraft({
          cartSessionId,
          cartFingerprint: checkoutCartFingerprint(items),
          customer: details.customer,
          address,
          saveAddress,
          recoveryConsent,
          discountCode: checkoutDiscountCode,
          quote: null,
          ...metaTestAuthorization
        });
        setCartAvailability({ state: 'blocked', message: error.message });
        setStatus({ tone: 'error', message: 'Your details are saved. Please update the unavailable item in your cart, then return to continue.' });
        return;
      }
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="customer-checkout-shell min-h-screen min-w-0 overflow-x-hidden bg-[var(--customer-bg)]">
      <CheckoutHeader current="information" />
      <main className="mx-auto max-w-4xl px-4 pb-14 pt-6 sm:px-5 sm:pt-7 lg:px-8">
        <form className="customer-card mx-auto max-w-3xl rounded-[8px] border border-[var(--customer-border)] bg-[var(--customer-surface)] p-4 shadow-sm sm:p-7" onSubmit={continueToReview} noValidate>
          <p className="eyebrow">Checkout information</p>
          <h1 className="display mt-2 text-3xl leading-tight sm:text-4xl">Where do we send it?</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">Enter your contact and delivery details. You will review the products, total, and payment method on the next page.</p>

          {cartAvailability.state === 'blocked' && (
            <div className="mt-5 border border-accent/40 bg-accent/10 px-4 py-4 text-sm text-accent-deep" role="alert">
              <p className="font-semibold">Your cart needs a quick update before checkout.</p>
              <p className="mt-1">{cartAvailability.message}</p>
              <Link to="/cart" className="btn-ghost customer-compact-button mt-3 inline-flex">Update cart</Link>
            </div>
          )}

          {!loggedIn && (
            <div className="mt-6 border-y border-line py-5">
              <p className="text-sm text-ink-soft"><Link to="/login" state={{ from: '/checkout' }} className="text-accent underline">Log in</Link> to prefill your saved address, or continue as guest.</p>
              {(socialProviders.google || socialProviders.facebook) && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {socialProviders.google && <a className="btn-ghost text-center" href="/api/customer/oauth/google/start?returnTo=%2Fcheckout">Continue with Google</a>}
                  {socialProviders.facebook && <a className="btn-ghost text-center" href="/api/customer/oauth/facebook/start?returnTo=%2Fcheckout">Continue with Facebook</a>}
                </div>
              )}
            </div>
          )}

          <fieldset className="mt-8 grid gap-4 sm:grid-cols-2">
            <legend className="mb-4 text-sm font-semibold uppercase tracking-[0.12em]">Contact</legend>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">First Name <span aria-hidden="true">*</span></span>
              <input name="given-name" ref={checkoutFieldRefs.firstName} className={fieldClass('firstName')} required aria-invalid={Boolean(missingFields.firstName)} aria-describedby={missingFields.firstName ? 'checkout-first-name-error' : undefined} placeholder="First name" value={firstName} onChange={(event) => { setFirstName(event.target.value); clearMissingField('firstName'); }} autoComplete="given-name" />
              {missingFields.firstName && <span id="checkout-first-name-error" className="mt-1 block text-xs text-accent-deep" role="alert">{missingFields.firstName}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Last Name <span aria-hidden="true">*</span></span>
              <input name="family-name" ref={checkoutFieldRefs.lastName} className={fieldClass('lastName')} required aria-invalid={Boolean(missingFields.lastName)} aria-describedby={missingFields.lastName ? 'checkout-last-name-error' : undefined} placeholder="Last name" value={lastName} onChange={(event) => { setLastName(event.target.value); clearMissingField('lastName'); }} autoComplete="family-name" />
              {missingFields.lastName && <span id="checkout-last-name-error" className="mt-1 block text-xs text-accent-deep" role="alert">{missingFields.lastName}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Mobile Number <span aria-hidden="true">*</span></span>
              <input name="tel" ref={checkoutFieldRefs.phone} className={fieldClass('phone')} required type="tel" inputMode="tel" aria-invalid={Boolean(missingFields.phone)} aria-describedby={missingFields.phone ? 'checkout-phone-error' : undefined} placeholder="09XXXXXXXXX" value={phone} onChange={(event) => { setPhone(event.target.value); clearMissingField('phone'); }} autoComplete="tel" />
              {missingFields.phone && <span id="checkout-phone-error" className="mt-1 block text-xs text-accent-deep" role="alert">{missingFields.phone}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Email <span className="font-normal text-clay">(optional)</span></span>
              <input name="email" ref={checkoutFieldRefs.email} className={fieldClass('email')} type="email" aria-invalid={Boolean(missingFields.email)} aria-describedby={missingFields.email ? 'checkout-email-error' : undefined} placeholder="you@example.com" value={email} onChange={(event) => { setEmail(event.target.value); clearMissingField('email'); }} autoComplete="email" />
              {missingFields.email && <span id="checkout-email-error" className="mt-1 block text-xs text-accent-deep" role="alert">{missingFields.email}</span>}
            </label>
            <label className="flex items-start gap-3 text-sm text-ink-soft sm:col-span-2">
              <input
                type="checkbox"
                name="checkout-reminder-consent"
                className="mt-1 h-4 w-4 shrink-0"
                checked={recoveryConsent}
                disabled={!String(email || '').trim()}
                onChange={(event) => setRecoveryConsent(event.target.checked)}
              />
              <span>Email me one reminder if I do not finish checkout. Optional, and sent only once.</span>
            </label>
          </fieldset>

          <fieldset className="mt-8 grid gap-4 sm:grid-cols-2">
            <legend className="mb-4 text-sm font-semibold uppercase tracking-[0.12em]">Delivery address</legend>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold">House / Street / Building / Unit <span aria-hidden="true">*</span></span>
              <input name="street-address" ref={checkoutFieldRefs.house} className={fieldClass('house')} required aria-invalid={Boolean(missingFields.house)} aria-describedby={missingFields.house ? 'checkout-house-error' : undefined} placeholder="House no. / Street / Building / Unit" value={house} onChange={(event) => { setHouse(event.target.value); clearMissingField('house'); }} autoComplete="street-address" />
              {missingFields.house && <span id="checkout-house-error" className="mt-1 block text-xs text-accent-deep" role="alert">{missingFields.house}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Province <span aria-hidden="true">*</span></span>
              <select name="address-level1" ref={checkoutFieldRefs.province} className={fieldClass('province')} required aria-invalid={Boolean(missingFields.province)} aria-describedby={missingFields.province ? 'checkout-province-error' : undefined} value={provinceCode} onChange={(event) => { setPrefillAddress(null); setProvinceCode(event.target.value); clearMissingField('province'); }} autoComplete="address-level1">
                <option value="">Select province</option>
                {provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
              {missingFields.province && <span id="checkout-province-error" className="mt-1 block text-xs text-accent-deep" role="alert">{missingFields.province}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">City / Municipality <span aria-hidden="true">*</span></span>
              <select name="address-level2" ref={checkoutFieldRefs.city} className={fieldClass('city')} required aria-invalid={Boolean(missingFields.city)} aria-describedby={missingFields.city ? 'checkout-city-error' : undefined} value={cityCode} disabled={!cities.length} onChange={(event) => { setPrefillAddress(null); setCityCode(event.target.value); clearMissingField('city'); }} autoComplete="address-level2">
                <option value="">{provinceCode ? 'Select city / municipality' : 'Select province first'}</option>
                {cities.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
              {missingFields.city && <span id="checkout-city-error" className="mt-1 block text-xs text-accent-deep" role="alert">{missingFields.city}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Barangay <span aria-hidden="true">*</span></span>
              <select name="address-level3" ref={checkoutFieldRefs.barangay} className={fieldClass('barangay')} required aria-invalid={Boolean(missingFields.barangay)} aria-describedby={missingFields.barangay ? 'checkout-barangay-error' : undefined} value={barangayCode} disabled={!barangays.length} onChange={(event) => { setPrefillAddress(null); setBarangayCode(event.target.value); clearMissingField('barangay'); }} autoComplete="address-level3">
                <option value="">{cityCode ? 'Select barangay' : 'Select city / municipality first'}</option>
                {barangays.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
              {missingFields.barangay && <span id="checkout-barangay-error" className="mt-1 block text-xs text-accent-deep" role="alert">{missingFields.barangay}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">ZIP Code <span className="font-normal text-clay">(optional)</span></span>
              <input name="postal-code" ref={checkoutFieldRefs.postalCode} className={fieldClass('postalCode')} aria-invalid={Boolean(missingFields.postalCode)} aria-describedby={missingFields.postalCode ? 'checkout-postal-code-error' : undefined} inputMode="numeric" maxLength="4" placeholder="ZIP code (optional)" value={postalCode} onChange={(event) => { setPostalCode(event.target.value.replace(/\D/g, '').slice(0, 4)); clearMissingField('postalCode'); }} autoComplete="postal-code" />
              {missingFields.postalCode && <span id="checkout-postal-code-error" className="mt-1 block text-xs text-accent-deep" role="alert">{missingFields.postalCode}</span>}
            </label>
            {loggedIn && (
              <label className="flex items-center gap-2 text-sm text-ink-soft sm:col-span-2">
                <input type="checkbox" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} />
                Save this address to my account
              </label>
            )}
          </fieldset>

          {doorToDoorWarning && (
            <p className="mt-4 border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-deep">
              J&T door-to-door delivery is not confirmed for this barangay. We will review before shipping.
            </p>
          )}
          {province && <p className="mt-5 text-sm text-ink-soft">{regionEstimate(settings, region)}</p>}
          {settings.shipping.freeShippingEnabled && (
            <section className="checkout-free-shipping-reminder mt-5 rounded-[8px] border border-[var(--customer-border)] bg-[var(--customer-accent-soft)]/45 p-4 text-left">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink">Buy {settings.shipping.freeShippingMinimumItems} or more items and get FREE shipping.</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {cartQuantity(items) >= settings.shipping.freeShippingMinimumItems
                  ? 'Free shipping is already unlocked for this order.'
                  : `Add ${settings.shipping.freeShippingMinimumItems - cartQuantity(items)} more ${settings.shipping.freeShippingMinimumItems - cartQuantity(items) === 1 ? 'item' : 'items'} to unlock free shipping.`}
              </p>
            </section>
          )}

          {status.message && (
            <p className={`mt-5 text-sm ${status.tone === 'error' ? 'text-accent-deep' : 'text-ink-soft'}`} role={status.tone === 'error' ? 'alert' : 'status'}>
              {status.message}
            </p>
          )}
          <button type="submit" className="btn-ink customer-compact-button mt-6 w-full" disabled={pending || cartAvailability.state !== 'ready'}>
            {pending || cartAvailability.state === 'checking'
              ? 'Checking stock...'
              : cartAvailability.state === 'blocked'
                ? 'Update cart to continue'
                : 'Review order'}
          </button>
          <p className="mt-3 text-center text-xs text-clay">No order is created and no stock is deducted until you confirm on the review page.</p>
          <p className="mt-2 text-center text-xs leading-relaxed text-clay">
            We use your contact and delivery details to fulfill your order. See our <Link className="underline" to="/terms">privacy information</Link>.
          </p>
        </form>
      </main>
    </div>
  );
}
