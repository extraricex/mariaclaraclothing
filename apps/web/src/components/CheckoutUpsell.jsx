import { useEffect, useState } from 'react';
import { availableUpsellVariants } from '../lib/checkoutUpsell.js';
import { cartQuantity } from '../lib/cart.js';
import { formatMoney } from '../lib/money.js';

function UpsellProductImage({ product }) {
  const image = product.images?.[0];
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [image?.url]);

  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-cream">
      {(!image?.url || failed) && (
        <span className="absolute inset-0 flex items-center justify-center px-3 text-center text-[10px] uppercase tracking-[0.1em] text-clay">Image unavailable</span>
      )}
      {image?.url && !failed && (
        <img
          src={image.url}
          alt={image.altText || product.name}
          className="product-photo-blend relative h-full w-full object-contain"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export default function CheckoutUpsell({
  recommendations,
  items,
  settings,
  quote,
  pendingProductId,
  message,
  onAdd
}) {
  const [selectedVariants, setSelectedVariants] = useState({});

  useEffect(() => {
    setSelectedVariants((current) => {
      const next = {};
      for (const product of recommendations) {
        const variants = availableUpsellVariants(product);
        const currentId = current[product.id];
        if (variants.some((variant) => variant.id === currentId)) next[product.id] = currentId;
        else if (variants.length === 1) next[product.id] = variants[0].id;
      }
      return next;
    });
  }, [recommendations]);

  if (!recommendations.length) return null;

  const minimumItems = Math.max(2, Number(settings.shipping.freeShippingMinimumItems || 2));
  const remainingItems = Math.max(0, minimumItems - cartQuantity(items));
  const shippingUnlocked = Boolean(quote?.freeShippingUnlocked || remainingItems === 0);

  return (
    <section className="mt-7 min-w-0 max-w-full border-y border-line py-6" aria-labelledby="checkout-upsell-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="checkout-upsell-heading" className="text-base font-semibold">
            {shippingUnlocked ? 'FREE shipping unlocked!' : 'Add one more item and unlock FREE shipping'}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">
            Complete your look and enjoy free shipping when your cart has 2 or more items.
          </p>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-deep" aria-live="polite">
          {shippingUnlocked
            ? 'FREE shipping unlocked!'
            : `Add ${remainingItems} more ${remainingItems === 1 ? 'item' : 'items'} to unlock FREE shipping.`}
        </p>
      </div>

      <div className="checkout-upsell-viewport mt-4 min-w-0 max-w-full overflow-hidden">
        <div className="checkout-upsell-strip flex max-w-full snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible">
          {recommendations.map((product, index) => {
            const variants = availableUpsellVariants(product);
            const selectedVariantId = selectedVariants[product.id] || '';
            const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
            const pending = pendingProductId === product.id;
            return (
              <article
                key={product.id}
                className={`${index === 3 ? 'hidden sm:flex' : 'flex'} w-[72vw] max-w-[240px] shrink-0 snap-start flex-col border border-line bg-white p-3 sm:w-auto sm:max-w-none`}
              >
                <UpsellProductImage product={product} />
                <h3 className="mt-3 line-clamp-2 min-h-10 text-sm font-semibold leading-snug">{product.name}</h3>
                <p className="mt-1 text-sm font-semibold">{formatMoney(product.priceCents)}</p>
                <label className="mt-3 block">
                  <span className="sr-only">Choose a size for {product.name}</span>
                  <select
                    className="field customer-input !px-3 !py-2 text-xs"
                    value={selectedVariantId}
                    onChange={(event) => setSelectedVariants((current) => ({ ...current, [product.id]: event.target.value }))}
                    aria-label={`Choose a size for ${product.name}`}
                  >
                    {variants.length > 1 && <option value="">Choose size</option>}
                    {variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.size} - {Number(variant.stockQuantity)} in stock
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-secondary customer-compact-button mt-3 w-full"
                  disabled={pending || !selectedVariant}
                  onClick={() => onAdd(product, selectedVariantId)}
                >
                  {pending ? 'Adding...' : 'Add to Order'}
                </button>
              </article>
            );
          })}
        </div>
      </div>
      {message && <p className="mt-3 text-sm font-semibold text-[#2f7d32]" role="status">{message}</p>}
    </section>
  );
}
