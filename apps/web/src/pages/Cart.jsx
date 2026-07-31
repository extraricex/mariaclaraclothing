import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createCheckoutQuote, fetchProducts } from '../lib/api.js';
import { addToCart, cartQuantity, getCartSessionId, removeFromCart, replaceCart, subtotalCents, updateQuantity, useCart } from '../lib/cart.js';
import { formatMoney } from '../lib/money.js';
import { trackFacebookAddToCart } from '../lib/metaPixel.js';
import { productPath } from '../lib/productUrl.js';
import { selectStableCheckoutUpsells } from '../lib/checkoutUpsell.js';
import { fetchWithRecovery, responseErrorMessage } from '../lib/network.js';
import { cartAvailabilityRepair, isCartAvailabilityError } from '../lib/checkoutAvailability.js';

export default function Cart() {
  const items = useCart();
  const location = useLocation();
  const navigate = useNavigate();
  const recoveryStarted = useRef(false);
  const [products, setProducts] = useState([]);
  const [quote, setQuote] = useState(null);
  const [quoteIssue, setQuoteIssue] = useState(null);
  const [cartNotice, setCartNotice] = useState('');
  const [upsellVariantIds, setUpsellVariantIds] = useState({});
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const quantity = cartQuantity(items);
  const subtotal = subtotalCents(items);
  const displaySubtotal = quote?.subtotalCents ?? subtotal;
  const displayDiscount = quote?.discountTotalCents ?? 0;
  const displayShipping = quote?.shippingFeeCents;
  const displayTotal = quote?.totalCents ?? Math.max(0, subtotal - displayDiscount);
  const freeShippingRemaining = quote?.freeShippingEnabled
    ? Math.max(0, Number(quote.freeShippingMinimumItems || 0) - quantity)
    : null;
  const freeShippingMessage = freeShippingRemaining === 0
    ? 'FREE shipping unlocked!'
    : freeShippingRemaining === null
      ? 'Shipping and promos refresh before checkout'
      : `Add ${freeShippingRemaining} more item${freeShippingRemaining === 1 ? '' : 's'} to unlock FREE shipping.`;
  const cartUpsells = useMemo(() => selectStableCheckoutUpsells({
    products,
    cartItems: items,
    cartSessionId: getCartSessionId(),
    limit: 3
  }), [items, products]);

  useEffect(() => {
    fetchProducts()
      .then((body) => setProducts(body.products || []))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(location.search).get('restore');
    if (!token || recoveryStarted.current) return;
    recoveryStarted.current = true;
    setRecoveryNotice('Restoring your saved cart...');
    fetchWithRecovery(`/api/cart-sessions/recovery/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || responseErrorMessage(response, 'This saved cart is no longer available.'));
        replaceCart(body.cart?.items || []);
        setRecoveryNotice(body.cart?.adjusted
          ? 'Your cart was restored with current stock and quantities.'
          : 'Your cart was restored. Current price and availability will be confirmed at checkout.');
      })
      .catch((error) => setRecoveryNotice(error.message))
      .finally(() => navigate('/cart', { replace: true }));
  }, [location.search, navigate]);

  useEffect(() => {
    if (!items.length) {
      setQuote(null);
      setQuoteIssue(null);
      return;
    }
    let cancelled = false;
    createCheckoutQuote({ cartSessionId: getCartSessionId(), items })
      .then((body) => {
        if (cancelled) return;
        setQuote(body.quote || null);
        setQuoteIssue(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteIssue(error);
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  function addUpsell(product) {
    const variant = (product.variants || []).find((candidate) => candidate.id === upsellVariantIds[product.id] && Number(candidate.stockQuantity || 0) > 0);
    if (!variant) {
      setCartNotice(`Choose a size for ${product.name} before adding it.`);
      return;
    }
    const cartItem = {
      productId: product.id,
      slug: product.slug,
      publicHandle: product.publicHandle,
      variantId: variant.id,
      productName: product.name,
      size: variant.size,
      quantity: 1,
      maxStock: Number(variant.stockQuantity || 0),
      unitPriceCents: variant.priceCents ?? product.priceCents,
      imageUrl: product.images?.[0]?.url || '',
      externalPosProductId: product.externalPosProductId || '',
      externalPosVariantId: variant.externalPosVariantId || ''
    };
    const result = addToCart(cartItem);
    if (result?.limited) {
      setCartNotice('Maximum available quantity added.');
      return;
    }
    setCartNotice('');
    setUpsellVariantIds((current) => ({ ...current, [product.id]: '' }));
    trackFacebookAddToCart(cartItem);
  }

  function increaseItem(item) {
    const result = updateQuantity(item.variantId, Number(item.quantity) + 1);
    if (result?.limited) {
      setCartNotice(`Only ${item.maxStock} ${item.size} left in stock.`);
      return;
    }
    setCartNotice('');
  }

  function decreaseItem(item) {
    setCartNotice('');
    updateQuantity(item.variantId, Number(item.quantity) - 1);
  }

  function repairCart() {
    const repair = cartAvailabilityRepair(quoteIssue, items);
    if (repair?.type === 'reduce') {
      updateQuantity(repair.variantId, repair.quantity);
    } else if (repair?.type === 'remove') {
      repair.variantIds.forEach((variantId) => removeFromCart(variantId));
    }
    setCartNotice('Cart updated. Rechecking availability...');
  }

  const checkoutBlocked = isCartAvailabilityError(quoteIssue);
  const repair = cartAvailabilityRepair(quoteIssue, items);

  if (!items.length) {
    return (
      <div className="customer-page mx-auto max-w-3xl px-5 py-20 text-center sm:py-24">
        <p className="display text-3xl sm:text-4xl">Your cart is empty</p>
        {location.state?.message && <p className="mx-auto mt-3 max-w-sm text-sm text-accent-deep" role="alert">{location.state.message}</p>}
        {recoveryNotice && <p className="mx-auto mt-3 max-w-sm text-sm text-accent-deep" role="status">{recoveryNotice}</p>}
        <p className="mt-3 text-sm text-ink-soft">The good stuff is one click away.</p>
        <Link to="/#new-arrivals" className="btn-ink customer-compact-button mt-7">Continue shopping</Link>
      </div>
    );
  }

  return (
    <div className="customer-page mx-auto max-w-5xl px-5 py-10 sm:py-12 lg:px-8">
      <p className="eyebrow">Cart / {quantity} item{quantity === 1 ? '' : 's'}</p>
      <h1 className="display mt-2 text-3xl sm:text-5xl">Your cart</h1>
      <p className="mt-4 inline-block bg-cream px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
        {quote?.freeShippingUnlocked ? 'FREE shipping unlocked!' : freeShippingMessage}
      </p>
      {quoteIssue && (
        <div className="mt-3 text-sm text-accent-deep" role="alert">
          <p>{quoteIssue.message}</p>
          {repair && (
            <button type="button" className="btn-ghost customer-compact-button mt-3" onClick={repairCart}>
              {repair.type === 'reduce' ? `Set quantity to ${repair.quantity}` : 'Remove unavailable item'}
            </button>
          )}
        </div>
      )}
      {cartNotice && <p className="mt-3 text-sm text-accent-deep" role="alert">{cartNotice}</p>}
      {recoveryNotice && <p className="mt-3 text-sm text-accent-deep" role="status">{recoveryNotice}</p>}

      <div className="mt-8 divide-y divide-line border-y border-line">
        {items.map((item) => (
          <article key={item.variantId} className="flex min-w-0 gap-3 py-5 sm:gap-5 sm:py-6">
            <Link to={productPath(item)} className="block h-28 w-20 shrink-0 overflow-hidden bg-transparent sm:h-32 sm:w-24">
              {item.imageUrl && <img src={item.imageUrl} alt={item.productName} className="product-photo-blend h-full w-full object-contain" loading="lazy" />}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-w-0 items-start justify-between gap-3 sm:gap-4">
                <div>
                  <h2 className="break-words text-sm font-semibold">{item.productName}</h2>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-clay">Size {item.size}</p>
                  <p className="mt-1 text-sm">{formatMoney(item.unitPriceCents)}</p>
                </div>
                <p className="text-sm font-semibold">{formatMoney(Number(item.unitPriceCents) * Number(item.quantity))}</p>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-3 sm:gap-4">
                <div className="flex items-center rounded-[8px] border border-line bg-white">
                  <button type="button" className="touch-target px-3 py-1.5" aria-label="Decrease quantity" onClick={() => decreaseItem(item)}>−</button>
                  <span className="min-w-8 text-center text-sm">{item.quantity}</span>
                  <button type="button" className="touch-target px-3 py-1.5 disabled:cursor-not-allowed disabled:text-clay" aria-label="Increase quantity" disabled={Number(item.maxStock) > 0 && Number(item.quantity) >= Number(item.maxStock)} onClick={() => increaseItem(item)}>+</button>
                </div>
                <button type="button" className="text-xs uppercase tracking-[0.12em] text-clay underline hover:text-accent" onClick={() => removeFromCart(item.variantId)}>
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="customer-order-summary mt-8 ml-auto flex max-w-md flex-col items-end gap-2 rounded-[8px] border border-[var(--customer-border)] bg-[var(--customer-surface)] p-5 shadow-sm">
        <p className="text-sm text-ink-soft">Subtotal <span className="ml-4 text-base font-semibold text-ink">{formatMoney(displaySubtotal)}</span></p>
        {displayDiscount > 0 && (
          <p className="text-sm text-[#2f7d32]">Discount <span className="ml-4 text-base font-semibold">-{formatMoney(displayDiscount)}</span></p>
        )}
        <p className="text-sm text-ink-soft">Shipping <span className="ml-4 text-base font-semibold text-ink">{quote?.freeShippingUnlocked ? 'Free' : 'Calculated at checkout'}</span></p>
        <p className="text-base font-semibold">Total <span className="ml-4 text-lg">{formatMoney(displayTotal)}</span></p>
        <p className="text-xs text-clay">Final delivery fee is confirmed after your address.</p>
        {checkoutBlocked
          ? <button type="button" className="btn-ink customer-compact-button mt-3 w-full cursor-not-allowed opacity-60 sm:w-auto" disabled>Update cart before checkout</button>
          : <Link to="/checkout" className="btn-ink customer-compact-button mt-3 w-full sm:w-auto">Continue to checkout</Link>}
      </div>

      {cartUpsells.length > 0 && (
        <section className="mt-14 border-t border-line pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Recommended</p>
              <h2 className="display mt-2 text-2xl sm:text-3xl">You may also love this</h2>
            </div>
            <p className="max-w-xs text-sm text-ink-soft">Add another piece before checkout and keep everything in one delivery.</p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {cartUpsells.map((product) => {
              const availableVariants = (product.variants || []).filter((variant) => Number(variant.stockQuantity || 0) > 0);
              const variant = availableVariants.find((candidate) => candidate.id === upsellVariantIds[product.id]) || null;
              const image = product.images?.[0];
              return (
                <article key={product.id} className="text-center">
                  <Link to={productPath(product)} className="block aspect-[4/5] overflow-hidden bg-transparent">
                    {image && <img src={image.url} alt={image.altText || product.name} className="product-photo-blend h-full w-full object-contain" loading="lazy" />}
                  </Link>
                  <div className="mt-2 flex flex-col items-center">
                    <h3 className="text-sm font-semibold leading-snug">{product.name}</h3>
                    <p className="mt-1 text-sm font-semibold">{formatMoney(product.priceCents)}</p>
                    <label className="mt-3 block w-full text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-clay">
                      Size
                      <select className="field mt-1 w-full" value={upsellVariantIds[product.id] || ''} onChange={(event) => setUpsellVariantIds((current) => ({ ...current, [product.id]: event.target.value }))}>
                        <option value="">Choose size</option>
                        {availableVariants.map((candidate) => <option key={candidate.id} value={candidate.id}>{String(candidate.size).toUpperCase()}</option>)}
                      </select>
                    </label>
                    <button type="button" className="btn-ghost customer-compact-button mt-3 w-full" disabled={!variant} onClick={() => addUpsell(product)}>
                      Add to cart
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
