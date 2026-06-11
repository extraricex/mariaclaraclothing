import { Link } from 'react-router-dom';
import { cartQuantity, removeFromCart, subtotalCents, updateQuantity, useCart } from '../lib/cart.js';
import { formatMoney } from '../lib/money.js';

export default function Cart() {
  const items = useCart();
  const quantity = cartQuantity(items);
  const subtotal = subtotalCents(items);

  if (!items.length) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <p className="display text-4xl">Your cart is empty</p>
        <p className="mt-3 text-sm text-ink-soft">The good stuff is one click away.</p>
        <Link to="/#new-arrivals" className="btn-ink mt-8">Continue shopping</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 lg:px-8">
      <p className="eyebrow">Cart / {quantity} item{quantity === 1 ? '' : 's'}</p>
      <h1 className="display mt-2 text-4xl sm:text-5xl">Your cart</h1>
      <p className="mt-4 inline-block bg-cream px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
        {quantity >= 2 ? '✓ Free shipping unlocked' : 'Add 1 more item to unlock free shipping'}
      </p>

      <div className="mt-8 divide-y divide-line border-y border-line">
        {items.map((item) => (
          <article key={item.variantId} className="flex gap-5 py-6">
            <Link to={`/product/${encodeURIComponent(item.slug || String(item.productId).replace(/^catalog-/, ''))}`} className="block h-32 w-24 shrink-0 overflow-hidden bg-cream">
              {item.imageUrl && <img src={item.imageUrl} alt={item.productName} className="h-full w-full object-cover" loading="lazy" />}
            </Link>
            <div className="flex flex-1 flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">{item.productName}</h2>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-clay">Size {item.size}</p>
                  <p className="mt-1 text-sm">{formatMoney(item.unitPriceCents)}</p>
                </div>
                <p className="text-sm font-semibold">{formatMoney(Number(item.unitPriceCents) * Number(item.quantity))}</p>
              </div>
              <div className="mt-auto flex items-center gap-4 pt-3">
                <div className="flex items-center border border-line">
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

      <div className="mt-8 flex flex-col items-end gap-2">
        <p className="text-sm text-ink-soft">Subtotal <span className="ml-4 text-base font-semibold text-ink">{formatMoney(subtotal)}</span></p>
        <p className="text-xs text-clay">Shipping calculated at checkout · COD nationwide</p>
        <Link to="/checkout" className="btn-ink mt-3 w-full sm:w-auto">Check out — Cash on Delivery</Link>
      </div>
    </div>
  );
}
