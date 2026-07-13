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

export default function Checkout() {
  const items = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const loggedIn = useCustomerLoggedIn();
  const initialDraft = useMemo(() => loadCheckoutReviewDraft(), []);
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
  const [notes, setNotes] = useState(initialDraft?.notes || '');
  const [prefillAddress, setPrefillAddress] = useState(initialDraft?.address || null);
  const [saveAddress, setSaveAddress] = useState(initialDraft?.saveAddress ?? true);
  const [settings, setSettings] = useState(DEFAULT_STOREFRONT_SETTINGS);
  const [socialProviders, setSocialProviders] = useState({ google: false, facebook: false });
  const [missingFields, setMissingFields] = useState({});
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState({
    tone: location.state?.message ? 'error' : 'neutral',
    message: location.state?.message || ''
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
    fetch('/api/customer/oauth/status', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => setSocialProviders(body.providers || { google: false, facebook: false }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!items.length) {
      navigate('/cart', { replace: true, state: { message: 'Your cart is empty. Please add an item before checking out.' } });
      return;
    }
    trackFacebookInitiateCheckout(
      items,
      { subtotalCents: subtotalCents(items), totalCents: subtotalCents(items) },
      `checkout:${getCartSessionId()}`
    );
  }, [items, navigate]);

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
      address: {
        addressLine: [house, barangay?.name, city?.name, province?.name, postalCode].filter(Boolean).join(', '),
        province: province?.name || '',
        city: city?.name || '',
        barangay: barangay?.name || '',
        postalCode
      },
      items
    });
  }, [items, firstName, lastName, phone, email, house, province, city, barangay, postalCode]);

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
    const invalid = [];
    if (!firstName.trim()) invalid.push({ key: 'firstName', label: 'First name' });
    if (!lastName.trim()) invalid.push({ key: 'lastName', label: 'Last name' });
    if (!phone.trim()) invalid.push({ key: 'phone', label: 'Mobile number' });
    else if (!/^(?:\+?63|0)9\d{9}$/.test(phone.replace(/[\s()-]/g, ''))) invalid.push({ key: 'phone', label: 'Valid Philippine mobile number' });
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) invalid.push({ key: 'email', label: 'Valid email address' });
    if (!house.trim()) invalid.push({ key: 'house', label: 'House number / street / building / unit' });
    if (!province) invalid.push({ key: 'province', label: 'Province' });
    if (!city) invalid.push({ key: 'city', label: 'City / municipality' });
    if (!barangay) invalid.push({ key: 'barangay', label: 'Barangay' });
    if (postalCode.trim() && !/^\d{4}$/.test(postalCode.trim())) invalid.push({ key: 'postalCode', label: 'Valid 4-digit ZIP code' });
    if (!invalid.length) {
      setMissingFields({});
      return true;
    }
    setMissingFields(Object.fromEntries(invalid.map((field) => [field.key, true])));
    setStatus({ tone: 'error', message: `Please complete the missing checkout information: ${invalid.map((field) => field.label).join(', ')}.` });
    focusMissingField(invalid[0].key);
    return false;
  }

  async function continueToReview(event) {
    event.preventDefault();
    if (!items.length || !validateDetails()) return;
    setPending(true);
    setStatus({ tone: 'neutral', message: 'Checking stock and preparing your review...' });
    const cartSessionId = getCartSessionId();
    const address = {
      houseAddress: house.trim(),
      provinceCode,
      province: province.name,
      cityCode,
      city: city.name,
      barangayCode,
      barangay: barangay.name,
      postalCode: postalCode.trim()
    };
    try {
      const body = await createCheckoutQuote({
        cartSessionId,
        items,
        discountCode: initialDraft?.discountCode || '',
        address
      });
      const quote = body.quote;
      if (!quote?.finalizable) throw new Error('Your checkout information is not ready for review.');
      saveCheckoutReviewDraft({
        cartSessionId,
        cartFingerprint: checkoutCartFingerprint(items),
        customer: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          fullName: `${firstName.trim()} ${lastName.trim()}`,
          phone: phone.trim(),
          email: email.trim()
        },
        address,
        notes: notes.trim(),
        saveAddress,
        discountCode: initialDraft?.discountCode || '',
        quote
      });
      navigate('/checkout/review');
    } catch (error) {
      if (['insufficient_stock', 'product_unavailable', 'variant_unavailable', 'cart_invalid'].includes(error.code)) {
        navigate('/cart', { replace: true, state: { message: error.message } });
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
      <main className="mx-auto max-w-4xl px-5 pb-14 pt-7 lg:px-8">
        <form className="customer-card mx-auto max-w-3xl rounded-[8px] border border-[var(--customer-border)] bg-[var(--customer-surface)] p-5 shadow-sm sm:p-7" onSubmit={continueToReview} noValidate>
          <p className="eyebrow">Checkout information</p>
          <h1 className="display mt-2 text-3xl leading-tight sm:text-4xl">Where do we send it?</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">Enter your contact and delivery details. You will review the products, total, and payment method on the next page.</p>

          {!loggedIn && (
            <div className="mt-6 border-y border-line py-5">
              <p className="text-sm text-ink-soft"><Link to="/login" state={{ from: '/checkout' }} className="text-accent underline">Log in</Link> to prefill your saved address, or continue as guest.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {socialProviders.google ? <a className="btn-ghost text-center" href="/api/customer/oauth/google/start?returnTo=%2Fcheckout">Continue with Google</a> : <button type="button" className="btn-ghost" disabled>Continue with Google</button>}
                {socialProviders.facebook ? <a className="btn-ghost text-center" href="/api/customer/oauth/facebook/start?returnTo=%2Fcheckout">Continue with Facebook</a> : <button type="button" className="btn-ghost" disabled>Continue with Facebook</button>}
              </div>
            </div>
          )}

          <fieldset className="mt-8 grid gap-4 sm:grid-cols-2">
            <legend className="mb-4 text-sm font-semibold uppercase tracking-[0.12em]">Contact</legend>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">First Name <span aria-hidden="true">*</span></span>
              <input ref={checkoutFieldRefs.firstName} className={fieldClass('firstName')} required aria-invalid={Boolean(missingFields.firstName)} aria-describedby={missingFields.firstName ? 'checkout-first-name-error' : undefined} placeholder="First name" value={firstName} onChange={(event) => { setFirstName(event.target.value); clearMissingField('firstName'); }} autoComplete="given-name" />
              {missingFields.firstName && <span id="checkout-first-name-error" className="mt-1 block text-xs text-accent-deep" role="alert">First Name is required.</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Last Name <span aria-hidden="true">*</span></span>
              <input ref={checkoutFieldRefs.lastName} className={fieldClass('lastName')} required aria-invalid={Boolean(missingFields.lastName)} aria-describedby={missingFields.lastName ? 'checkout-last-name-error' : undefined} placeholder="Last name" value={lastName} onChange={(event) => { setLastName(event.target.value); clearMissingField('lastName'); }} autoComplete="family-name" />
              {missingFields.lastName && <span id="checkout-last-name-error" className="mt-1 block text-xs text-accent-deep" role="alert">Last Name is required.</span>}
            </label>
            <input ref={checkoutFieldRefs.phone} className={fieldClass('phone')} required type="tel" inputMode="tel" placeholder="Mobile number (09XXXXXXXXX)" value={phone} onChange={(event) => { setPhone(event.target.value); clearMissingField('phone'); }} autoComplete="tel" />
            <input ref={checkoutFieldRefs.email} className={`${fieldClass('email')} sm:col-span-2`} type="email" placeholder="Email (optional)" value={email} onChange={(event) => { setEmail(event.target.value); clearMissingField('email'); }} autoComplete="email" />
          </fieldset>

          <fieldset className="mt-8 grid gap-4 sm:grid-cols-2">
            <legend className="mb-4 text-sm font-semibold uppercase tracking-[0.12em]">Delivery address</legend>
            <input ref={checkoutFieldRefs.house} className={`${fieldClass('house')} sm:col-span-2`} required placeholder="House no. / Street / Building / Unit" value={house} onChange={(event) => { setHouse(event.target.value); clearMissingField('house'); }} autoComplete="street-address" />
            <select ref={checkoutFieldRefs.province} className={fieldClass('province')} required value={provinceCode} onChange={(event) => { setPrefillAddress(null); setProvinceCode(event.target.value); clearMissingField('province'); }} autoComplete="address-level1">
              <option value="">Select province</option>
              {provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            <select ref={checkoutFieldRefs.city} className={fieldClass('city')} required value={cityCode} disabled={!cities.length} onChange={(event) => { setPrefillAddress(null); setCityCode(event.target.value); clearMissingField('city'); }} autoComplete="address-level2">
              <option value="">{provinceCode ? 'Select city / municipality' : 'Select province first'}</option>
              {cities.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            <select ref={checkoutFieldRefs.barangay} className={fieldClass('barangay')} required value={barangayCode} disabled={!barangays.length} onChange={(event) => { setPrefillAddress(null); setBarangayCode(event.target.value); clearMissingField('barangay'); }} autoComplete="address-level3">
              <option value="">{cityCode ? 'Select barangay' : 'Select city / municipality first'}</option>
              {barangays.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">ZIP Code <span className="font-normal text-clay">(optional)</span></span>
              <input ref={checkoutFieldRefs.postalCode} className={fieldClass('postalCode')} aria-invalid={Boolean(missingFields.postalCode)} inputMode="numeric" maxLength="4" placeholder="ZIP code (optional)" value={postalCode} onChange={(event) => { setPostalCode(event.target.value.replace(/\D/g, '').slice(0, 4)); clearMissingField('postalCode'); }} autoComplete="postal-code" />
              {missingFields.postalCode && <span className="mt-1 block text-xs text-accent-deep" role="alert">ZIP Code must contain 4 digits when provided.</span>}
            </label>
            <textarea className="field customer-input sm:col-span-2" rows="3" placeholder="Delivery notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} />
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
          <button type="submit" className="btn-ink customer-compact-button mt-6 w-full" disabled={pending}>
            {pending ? 'Checking stock...' : 'Continue to Checkout'}
          </button>
          <p className="mt-3 text-center text-xs text-clay">No order is created and no stock is deducted until you confirm on the review page.</p>
        </form>
      </main>
    </div>
  );
}
