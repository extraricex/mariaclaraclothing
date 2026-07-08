import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createCheckoutQuote, fetchProducts } from '../lib/api.js';
import { addToCart, cartQuantity, getCartSessionId, removeFromCart, subtotalCents, updateQuantity, useCart } from '../lib/cart.js';
import { formatMoney } from '../lib/money.js';
import { trackFacebookAddToCart, trackFacebookInitiateCheckout } from '../lib/metaPixel.js';

function firstAvailableVariant(product) {
  return (product.variants || []).find((variant) => Number(variant.stockQuantity || 0) > 0) || null;
}

export default function Cart() {
  const items = useCart();
  const [products, setProducts] = useState([]);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const quantity = cartQuantity(items);
  const subtotal = subtotalCents(items);
  const displaySubtotal = quote?.subtotalCents ?? subtotal;
  const displayDiscount = quote?.discountTotalCents ?? 0;
  const displayShipping = quote?.shippingFeeCents;
  const displayTotal = quote?.totalCents ?? Math.max(0, subtotal - displayDiscount);
  const cartUpsells = useMemo(() => products
    .filter((product) => firstAvailableVariant(product))
    .filter((product) => !items.some((item) => item.slug === product.slug || item.productId === product.id))
    .slice(0, 3), [items, products]);

  useEffect(() => {
    fetchProducts()
      .then((body) => setProducts(body.products || []))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (!items.length) {
      setQuote(null);
      setQuoteError('');
      return;
    }
    let cancelled = false;
    createCheckoutQuote({ cartSessionId: getCartSessionId(), items })
      .then((body) => {
        if (cancelled) return;
        setQuote(body.quote || null);
        setQuoteError('');
      })
      .catch((error) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  function addUpsell(product) {
    const variant = firstAvailableVariant(product);
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
  }

  function trackCheckout() {
    trackFacebookInitiateCheckout(
      items,
      quote || { subtotalCents: subtotal, totalCents: displayTotal },
      `checkout:${getCartSessionId()}`
    );
  }

  if (!items.length) {
    return (
      <div className="customer-page mx-auto max-w-3xl px-5 py-24 text-center">
        <p className="display text-4xl">Your cart is empty</p>
        <p className="mt-3 text-sm text-ink-soft">The good stuff is one click away.</p>
        <Link to="/#new-arrivals" className="btn-ink mt-8">Continue shopping</Link>
      </div>
    );
  }

  return (
    <div className="customer-page mx-auto max-w-5xl px-5 py-12 lg:px-8">
      <p className="eyebrow">Cart / {quantity} item{quantity === 1 ? '' : 's'}</p>
      <h1 className="display mt-2 text-4xl sm:text-5xl">Your cart</h1>
      <p className="mt-4 inline-block bg-cream px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
        {quote?.freeShippingUnlocked ? 'Free shipping unlocked' : 'Shipping and promos refresh before checkout'}
      </p>
      {quoteError && <p className="mt-3 text-sm text-accent-deep" role="alert">{quoteError}</p>}

      <div className="mt-8 divide-y divide-line border-y border-line">
        {items.map((item) => (
          <article key={item.variantId} className="flex min-w-0 gap-4 py-6 sm:gap-5">
            <Link to={`/product/${encodeURIComponent(item.slug || String(item.productId).replace(/^catalog-/, ''))}`} className="block h-32 w-24 shrink-0 overflow-hidden bg-transparent">
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
              <div className="mt-auto flex items-center gap-4 pt-3">
                <div className="flex items-center rounded-[8px] border border-line bg-white">
                  <button type="button" className="px-3 py-1.5" aria-label="Decrease quantity" onClick={() => updateQuantity(item.variantId, Number(item.quantity) - 1)}>−</button>
                  <span className="min-w-8 text-center text-sm">{item.quantity}</span>
                  <button type="button" className="px-3 py-1.5" aria-label="Increase quantity" onClick={() => updateQuantity(item.variantId, Number(item.quantity) + 1)}>+</button>
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
        <p className="text-xs text-clay">Final delivery fee is confirmed after your address · COD nationwide</p>
        <Link to="/checkout" className="btn-ink mt-3 w-full sm:w-auto" onClick={trackCheckout}>Check out — Cash on Delivery</Link>
      </div>

      {cartUpsells.length > 0 && (
        <section className="mt-14 border-t border-line pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Recommended</p>
              <h2 className="display mt-2 text-3xl">You may also love this</h2>
            </div>
            <p className="max-w-xs text-sm text-ink-soft">Add another piece before checkout and keep everything in one COD delivery.</p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {cartUpsells.map((product) => {
              const variant = firstAvailableVariant(product);
              const image = product.images?.[0];
              return (
                <article key={product.id} className="text-center">
                  <Link to={`/product/${encodeURIComponent(product.slug)}`} className="block aspect-[4/5] overflow-hidden bg-transparent">
                    {image && <img src={image.url} alt={image.altText || product.name} className="product-photo-blend h-full w-full object-contain" loading="lazy" />}
                  </Link>
                  <div className="mt-3 flex flex-col items-center">
                    <h3 className="min-h-10 text-sm font-semibold leading-snug">{product.name}</h3>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-clay">Size {variant.size}</p>
                    <p className="mt-2 text-sm font-semibold">{formatMoney(product.priceCents)}</p>
                    <button type="button" className="btn-ghost mt-3 w-full !py-2 text-xs" onClick={() => addUpsell(product)}>
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
