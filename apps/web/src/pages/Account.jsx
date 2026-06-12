import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clearCustomerToken, customerJson, useCustomerLoggedIn } from '../lib/customerAuth.js';
import { fetchProduct } from '../lib/api.js';
import { addToCart } from '../lib/cart.js';
import { formatMoney } from '../lib/money.js';

const STATUS_STEPS = ['received', 'confirmed', 'packed', 'shipped', 'delivered'];

function StatusTracker({ order }) {
  if (order.status === 'cancelled') {
    return <span className="bg-line px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-clay">Cancelled</span>;
  }
  const current = STATUS_STEPS.indexOf(order.status);
  return (
    <div className="flex items-center gap-1.5" aria-label={`Order status: ${order.status}`}>
      {STATUS_STEPS.map((step, index) => (
        <div key={step} className="flex items-center gap-1.5">
          <span
            title={step}
            className={`h-2.5 w-2.5 rounded-full ${index <= current ? 'bg-accent' : 'bg-line'}`}
          />
          {index < STATUS_STEPS.length - 1 && <span className={`h-px w-4 ${index < current ? 'bg-accent' : 'bg-line'}`} />}
        </div>
      ))}
      <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-deep">{order.status}</span>
    </div>
  );
}

export default function Account() {
  const navigate = useNavigate();
  const loggedIn = useCustomerLoggedIn();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState('');
  const [buyAgainNote, setBuyAgainNote] = useState('');

  useEffect(() => {
    if (!loggedIn) {
      navigate('/login');
      return;
    }
    customerJson('/api/customer/me')
      .then((body) => setCustomer(body.customer))
      .catch((err) => setMessage(err.message));
    customerJson('/api/customer/orders')
      .then((body) => setOrders(body.orders))
      .catch(() => {});
  }, [loggedIn, navigate]);

  if (!customer) {
    return <div className="mx-auto max-w-7xl px-5 py-16 text-sm text-clay lg:px-8">{message || 'Loading account…'}</div>;
  }

  async function buyAgain(order) {
    setBuyAgainNote('Checking stock…');
    const added = [];
    const unavailable = [];
    for (const item of order.items) {
      try {
        const { product } = await fetchProduct(String(item.productId).replace(/^catalog-/, ''));
        const variant = product.variants.find((candidate) =>
          candidate.size === item.size && Number(candidate.stockQuantity) >= Number(item.quantity));
        if (!variant || product.merchandisingStatus === 'sold_out') {
          unavailable.push(`${item.productName} (${item.size})`);
          continue;
        }
        addToCart({
          productId: product.id,
          slug: product.slug,
          variantId: variant.id,
          productName: product.name,
          size: variant.size,
          quantity: Number(item.quantity),
          unitPriceCents: product.priceCents,
          imageUrl: product.images[0]?.url || '',
          externalPosProductId: product.externalPosProductId || '',
          externalPosVariantId: variant.externalPosVariantId || ''
        });
        added.push(item.productName);
      } catch (_error) {
        unavailable.push(`${item.productName} (${item.size})`);
      }
    }
    setBuyAgainNote(
      [added.length ? `Added ${added.length} item${added.length === 1 ? '' : 's'} to cart.` : '',
        unavailable.length ? `Unavailable: ${unavailable.join(', ')}.` : ''].filter(Boolean).join(' ')
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="display mt-1 text-4xl sm:text-5xl">Hi, {customer.fullName.split(' ')[0]}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/account/settings" className="btn-ghost !px-5 !py-2.5 text-xs">Account settings</Link>
          <button
            type="button"
            className="text-xs uppercase tracking-[0.12em] text-clay underline hover:text-accent"
            onClick={() => { clearCustomerToken(); navigate('/'); }}
          >
            Log out
          </button>
        </div>
      </div>
      {message && <p className="mt-4 text-sm text-accent-deep" role="status">{message}</p>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* compact read-only summary */}
        <aside>
          <div className="border border-line bg-white p-5">
            <p className="eyebrow">Your details</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-clay">Name</dt>
                <dd className="font-semibold">{customer.fullName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-clay">Mobile</dt>
                <dd>{customer.phone}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-clay">Email</dt>
                <dd className="break-all">{customer.email}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-clay">Saved shipping address</dt>
                <dd className="text-ink-soft">
                  {customer.savedAddress
                    ? `${customer.savedAddress.houseAddress}, ${customer.savedAddress.barangay}, ${customer.savedAddress.city}, ${customer.savedAddress.province}`
                    : 'None yet'}
                </dd>
              </div>
            </dl>
            <Link to="/account/settings" className="mt-4 inline-block text-xs font-semibold uppercase tracking-[0.1em] text-accent underline">
              Edit in account settings
            </Link>
          </div>
          <div className="mt-4 border border-line bg-cream p-5 text-sm text-ink-soft">
            <p className="font-semibold text-ink">COD reminder</p>
            <p className="mt-1">We text {customer.phone} to confirm every order before it ships. Pay cash when it arrives.</p>
          </div>
        </aside>

        {/* order history — main area */}
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Order history</h2>
            <span className="text-xs text-clay">{orders.length} order{orders.length === 1 ? '' : 's'}</span>
          </div>
          {buyAgainNote && (
            <p className="mt-3 text-sm text-ink-soft" role="status">
              {buyAgainNote} <Link to="/cart" className="text-accent underline">View cart</Link>
            </p>
          )}
          <div className="mt-4 space-y-3">
            {orders.map((order) => (
              <article key={order.orderNumber} className="grid gap-4 border border-line bg-white p-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <strong className="text-sm">{order.orderNumber}</strong>
                    <span className="text-xs text-clay">
                      {order.placedAt ? new Date(order.placedAt).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : ''}
                    </span>
                    <StatusTracker order={order} />
                  </div>
                  <ul className="mt-2 text-sm text-ink-soft">
                    {order.items.map((item, index) => (
                      <li key={index}>{item.quantity}× {item.productName} — {item.size}</li>
                    ))}
                  </ul>
                  {order.trackingNumber && (
                    <p className="mt-1 text-xs text-clay">J&T tracking: <strong className="text-ink">{order.trackingNumber}</strong></p>
                  )}
                </div>
                <div className="flex items-center gap-4 lg:flex-col lg:items-end">
                  <strong className="text-base">{formatMoney(order.totalCents)}</strong>
                  {order.status !== 'cancelled' && (
                    <button type="button" className="btn-ghost !px-4 !py-2 text-xs" onClick={() => buyAgain(order)}>
                      Buy again
                    </button>
                  )}
                </div>
              </article>
            ))}
            {!orders.length && (
              <div className="border border-line bg-white p-10 text-center">
                <p className="text-sm text-ink-soft">No orders yet.</p>
                <Link to="/#new-arrivals" className="btn-ink mt-4">Start shopping</Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
