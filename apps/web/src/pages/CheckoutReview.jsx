import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createCheckoutQuote, createPayMongoCheckout, createQuoteBackedOrder } from '../lib/api.js';
import { customerJson, useCustomerLoggedIn } from '../lib/customerAuth.js';
import {
  cartQuantity,
  clearCart,
  clearCheckoutIdempotencyKey,
  getCartSessionId,
  getCheckoutIdempotencyKey,
  resetCartSessionId,
  useCart
} from '../lib/cart.js';
import {
  checkoutDraftMatchesCart,
  clearCheckoutReviewDraft,
  loadCheckoutReviewDraft,
  saveCheckoutReviewDraft
} from '../lib/checkoutDraft.js';
import { formatMoney } from '../lib/money.js';
import { trackFacebookAddPaymentInfo, trackFacebookPurchase } from '../lib/metaPixel.js';
import { DEFAULT_STOREFRONT_SETTINGS, freeShippingHint, loadStorefrontSettings } from '../lib/storeSettings.js';
import CheckoutHeader from '../components/CheckoutHeader.jsx';

const REVIEWED_TOTAL_FIELDS = ['subtotalCents', 'discountTotalCents', 'shippingFeeCents', 'totalCents'];

function totalsChanged(previous, latest) {
  return !previous || REVIEWED_TOTAL_FIELDS.some((field) => previous[field] !== latest?.[field]);
}

function paymentDescription(method) {
  if (method.id === 'paymongo') {
    return 'Pay securely using GCash, Maya, card, QRPh, or online banking through PayMongo.';
  }
  return method.instructions || 'Pay cash to the rider when your order arrives.';
}

export default function CheckoutReview() {
  const items = useCart();
  const navigate = useNavigate();
  const loggedIn = useCustomerLoggedIn();
  const initialDraft = useMemo(() => loadCheckoutReviewDraft(), []);
  const [draft, setDraft] = useState(initialDraft);
  const [quote, setQuote] = useState(initialDraft?.quote || null);
  const [settings, setSettings] = useState(DEFAULT_STOREFRONT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash_on_delivery');
  const [discountInput, setDiscountInput] = useState(initialDraft?.discountCode || '');
  const [discountError, setDiscountError] = useState('');
  const [pending, setPending] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [status, setStatus] = useState({ tone: 'neutral', message: '' });
  const placingOrderRef = useRef(false);
  const cartSessionId = getCartSessionId();
  const draftMatchesCart = checkoutDraftMatchesCart(draft, items, cartSessionId);

  function quotePayload(discountCode = draft?.discountCode || '') {
    return {
      cartSessionId,
      items,
      discountCode,
      address: draft?.address
    };
  }

  function storeReviewDraft(nextQuote, discountCode = draft?.discountCode || '') {
    const next = saveCheckoutReviewDraft({
      ...draft,
      discountCode,
      quote: nextQuote
    });
    setDraft(next);
    setQuote(nextQuote);
    return next;
  }

  async function refreshQuote(discountCode = draft?.discountCode || '') {
    const body = await createCheckoutQuote(quotePayload(discountCode));
    const nextQuote = body.quote;
    if (!nextQuote?.finalizable) throw new Error('Your checkout information is incomplete. Return to checkout and review your address.');
    storeReviewDraft(nextQuote, discountCode);
    return nextQuote;
  }

  useEffect(() => {
    if (!items.length) {
      if (!placingOrderRef.current) {
        navigate('/cart', { replace: true, state: { message: 'Your cart is empty. Please add an item before checking out.' } });
      }
      return;
    }
    if (!draftMatchesCart && !placingOrderRef.current) {
      navigate('/checkout', {
        replace: true,
        state: { message: 'Your cart changed or your checkout session expired. Please confirm your delivery information again.' }
      });
    }
  }, [items.length, draftMatchesCart, navigate]);

  useEffect(() => {
    loadStorefrontSettings()
      .then(setSettings)
      .finally(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    if (!settings.paymentMethods.some((method) => method.id === paymentMethod)) {
      setPaymentMethod(settings.paymentMethods[0]?.id || 'cash_on_delivery');
    }
  }, [settings, paymentMethod]);

  useEffect(() => {
    if (!draftMatchesCart || !items.length) return;
    let cancelled = false;
    setLoadingQuote(true);
    createCheckoutQuote(quotePayload(draft.discountCode || ''))
      .then((body) => {
        if (cancelled) return;
        storeReviewDraft(body.quote, draft.discountCode || '');
        setStatus({ tone: 'neutral', message: '' });
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus({ tone: 'error', message: error.message });
      })
      .finally(() => {
        if (!cancelled) setLoadingQuote(false);
      });
    return () => { cancelled = true; };
  }, []);

  function selectPayment(methodId) {
    setPaymentMethod(methodId);
    if (!quote) return;
    trackFacebookAddPaymentInfo(
      quote.items || items,
      quote,
      methodId,
      `payment:${cartSessionId}:${quote.id}:${methodId}`
    );
  }

  async function applyDiscount() {
    const code = discountInput.trim();
    setDiscountError('');
    setPending(true);
    try {
      const nextQuote = await refreshQuote(code);
      setDiscountInput(code);
      setStatus({ tone: 'neutral', message: nextQuote.discountCode ? 'Discount applied.' : '' });
    } catch (error) {
      setDiscountError(error.message);
    } finally {
      setPending(false);
    }
  }

  async function saveCustomerAddress() {
    if (!loggedIn || !draft?.saveAddress) return;
    const address = draft.address;
    await customerJson('/api/customer/me', {
      method: 'PUT',
      body: JSON.stringify({ savedAddress: {
        houseAddress: address.houseAddress,
        provinceCode: address.provinceCode,
        province: address.province,
        cityCode: address.cityCode,
        city: address.city,
        barangayCode: address.barangayCode,
        barangay: address.barangay,
        postalCode: address.postalCode
      } })
    });
  }

  async function placeOrder(event) {
    event.preventDefault();
    if (pending || placingOrderRef.current || !draftMatchesCart || !quote) return;
    placingOrderRef.current = true;
    setPending(true);
    setStatus({ tone: 'neutral', message: paymentMethod === 'paymongo' ? 'Preparing secure payment...' : 'Placing your order...' });
    try {
      const latestQuote = await createCheckoutQuote(quotePayload(draft.discountCode || '')).then((body) => body.quote);
      if (totalsChanged(quote, latestQuote)) {
        storeReviewDraft(latestQuote, draft.discountCode || '');
        setStatus({ tone: 'error', message: 'Checkout totals changed. Review the updated total before placing your order.' });
        placingOrderRef.current = false;
        return;
      }

      const payload = {
        cartSessionId,
        customer: draft.customer,
        paymentMethod,
        notes: draft.notes || ''
      };
      const idempotencyKey = getCheckoutIdempotencyKey(latestQuote.id);
      const result = paymentMethod === 'paymongo'
        ? await createPayMongoCheckout(payload, latestQuote.id, idempotencyKey)
        : await createQuoteBackedOrder(payload, latestQuote.id, idempotencyKey);

      saveCustomerAddress().catch(() => {});
      sessionStorage.setItem('maria-clara-last-order', JSON.stringify({
        orderNumber: result.orderNumber,
        confirmationToken: result.confirmationToken
      }));

      if (paymentMethod === 'paymongo') {
        window.location.assign(result.checkoutUrl);
        return;
      }

      trackFacebookPurchase(result, result.items, result.trackingEventId);
      clearCheckoutReviewDraft();
      clearCheckoutIdempotencyKey();
      clearCart();
      resetCartSessionId();
      navigate(`/thank-you?order=${encodeURIComponent(result.orderNumber)}`);
    } catch (error) {
      placingOrderRef.current = false;
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setPending(false);
    }
  }

  if (!draftMatchesCart || !draft) return null;

  const displayItems = quote?.items?.length ? quote.items : items;
  const selectedPayment = settings.paymentMethods.find((method) => method.id === paymentMethod);
  const address = draft.address;

  return (
    <div className="customer-checkout-shell min-h-screen min-w-0 overflow-x-hidden bg-[var(--customer-bg)]">
      <CheckoutHeader current="review" />
      <main className="mx-auto grid max-w-6xl gap-7 px-5 pb-14 pt-7 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)] lg:px-8">
        <form className="customer-card rounded-[8px] border border-[var(--customer-border)] bg-[var(--customer-surface)] p-5 shadow-sm sm:p-7" onSubmit={placeOrder}>
          <p className="eyebrow">Final review</p>
          <h1 className="display mt-2 text-3xl leading-tight sm:text-4xl">Review and payment</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">Confirm your delivery details, then choose how you would like to pay.</p>

          <section className="mt-7 rounded-[8px] border border-line bg-white p-4 sm:p-5" aria-labelledby="customer-review-heading">
            <div className="flex items-start justify-between gap-4">
              <h2 id="customer-review-heading" className="text-sm font-semibold uppercase tracking-[0.12em]">Customer information</h2>
              <Link to="/checkout" className="shrink-0 text-xs font-semibold text-accent underline">Edit</Link>
            </div>
            <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0"><dt className="text-clay">Name</dt><dd className="break-words font-semibold">{draft.customer.fullName}</dd></div>
              <div className="min-w-0"><dt className="text-clay">Mobile</dt><dd className="break-words">{draft.customer.phone}</dd></div>
              {draft.customer.email && <div className="min-w-0 sm:col-span-2"><dt className="text-clay">Email</dt><dd className="break-all">{draft.customer.email}</dd></div>}
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-clay">Delivery address</dt>
                <dd className="break-words">{address.houseAddress}, {address.barangay}, {address.city}, {address.province} {address.postalCode}, Philippines</dd>
              </div>
              {draft.notes && <div className="min-w-0 sm:col-span-2"><dt className="text-clay">Delivery notes</dt><dd className="break-words">{draft.notes}</dd></div>}
            </dl>
          </section>

          <fieldset className="mt-7 space-y-3">
            <legend className="mb-3 text-sm font-semibold uppercase tracking-[0.12em]">Payment method</legend>
            {settings.paymentMethods.map((method) => (
              <label key={method.id} className={`flex cursor-pointer items-start gap-3 rounded-[8px] border px-4 py-4 text-sm transition-colors ${paymentMethod === method.id ? 'border-ink bg-white' : 'border-line bg-white/60 hover:border-clay'}`}>
                <input
                  type="radio"
                  name="payment-method"
                  value={method.id}
                  checked={paymentMethod === method.id}
                  onChange={() => selectPayment(method.id)}
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{method.label}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{paymentDescription(method)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {status.message && (
            <p className={`mt-5 text-sm ${status.tone === 'error' ? 'text-accent-deep' : 'text-ink-soft'}`} role={status.tone === 'error' ? 'alert' : 'status'}>
              {status.message}
            </p>
          )}
          <button type="submit" className="btn-ink customer-compact-button mt-6 w-full" disabled={pending || loadingQuote || !settingsLoaded || !selectedPayment}>
            {pending
              ? (paymentMethod === 'paymongo' ? 'Preparing payment...' : 'Placing order...')
              : paymentMethod === 'paymongo'
                ? 'Proceed to Online Payment'
                : 'Place Order - Cash on Delivery'}
          </button>
          <p className="mt-3 text-center text-xs text-clay">
            {paymentMethod === 'paymongo'
              ? 'Your payment status becomes Paid only after PayMongo confirms it securely.'
              : 'Your order is created only once when you press the button above.'}
          </p>
        </form>

        <aside className="customer-order-summary self-start rounded-[8px] border border-[var(--customer-border)] bg-[var(--customer-surface)] p-5 shadow-sm lg:sticky lg:top-6" aria-label="Order summary">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Order summary</h2>
            <Link to="/cart" className="text-xs text-accent underline">Edit cart</Link>
          </div>
          <div className="mt-6 space-y-5">
            {displayItems.map((item) => (
              <article key={item.variantId} className="flex min-w-0 gap-3 sm:gap-4">
                <div className="relative aspect-[4/5] w-16 shrink-0 self-start overflow-hidden bg-transparent sm:w-20">
                  {item.imageUrl && <img src={item.imageUrl} alt={item.productName} className="product-photo-blend block h-full w-full object-contain" loading="lazy" />}
                  <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-paper">{item.quantity}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-sm font-semibold leading-snug">{item.productName}</h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-clay">Size {item.size}</p>
                  <p className="mt-1 text-xs text-ink-soft">{formatMoney(item.unitPriceCents)} each</p>
                </div>
                <strong className="shrink-0 text-sm">{formatMoney(Number(item.unitPriceCents) * Number(item.quantity))}</strong>
              </article>
            ))}
          </div>

          <div className="mt-7 border-t border-line pt-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <input className="field customer-input flex-1 uppercase" placeholder="Discount code" value={discountInput} onChange={(event) => setDiscountInput(event.target.value)} />
              <button type="button" className="btn-ghost !px-4" onClick={applyDiscount} disabled={pending}>Apply</button>
            </div>
            {discountError && <p className="mt-2 text-xs text-accent-deep" role="alert">{discountError}</p>}
            {quote?.discountCode && <p className="mt-2 text-xs text-[#2f7d32]">Code {quote.discountCode} applied.</p>}
          </div>

          <dl className="mt-5 space-y-2 text-sm" aria-busy={loadingQuote}>
            <div className="flex justify-between gap-4"><dt className="text-ink-soft">Subtotal</dt><dd>{formatMoney(quote?.subtotalCents || 0)}</dd></div>
            {Number(quote?.discountTotalCents || 0) > 0 && (
              <div className="flex justify-between gap-4 text-[#2f7d32]"><dt>Discount{quote.discountCode ? ` (${quote.discountCode})` : ''}</dt><dd>-{formatMoney(quote.discountTotalCents)}</dd></div>
            )}
            <div className="flex justify-between gap-4"><dt className="text-ink-soft">Shipping</dt><dd>{quote?.shippingFeeCents ? formatMoney(quote.shippingFeeCents) : 'Free'}</dd></div>
            <div className="flex justify-between gap-4 border-t border-line pt-3 text-base font-semibold"><dt>Total</dt><dd>{formatMoney(quote?.totalCents || 0)}</dd></div>
          </dl>
          <p className="mt-4 bg-cream px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
            {quote?.freeShippingUnlocked ? 'Free shipping unlocked.' : freeShippingHint(settings, cartQuantity(items))}
          </p>
        </aside>
      </main>
    </div>
  );
}
