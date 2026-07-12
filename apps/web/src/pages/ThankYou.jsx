import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchOrderConfirmation } from '../lib/api.js';
import { formatMoney } from '../lib/money.js';
import { DEFAULT_STOREFRONT_SETTINGS, loadStorefrontSettings } from '../lib/storeSettings.js';

function storedConfirmation() {
  try {
    return JSON.parse(sessionStorage.getItem('maria-clara-last-order') || 'null');
  } catch (_error) {
    return null;
  }
}

export default function ThankYou() {
  const [params] = useSearchParams();
  const orderNumber = params.get('order') || '';
  const [order, setOrder] = useState(null);
  const [confirmation] = useState(storedConfirmation);
  const [settings, setSettings] = useState(DEFAULT_STOREFRONT_SETTINGS);

  useEffect(() => {
    if (orderNumber && confirmation?.orderNumber === orderNumber && confirmation.confirmationToken) {
      fetchOrderConfirmation(orderNumber, confirmation.confirmationToken)
        .then((body) => setOrder(body.order))
        .catch(() => {});
    }
  }, [orderNumber, confirmation]);

  useEffect(() => {
    loadStorefrontSettings().then(setSettings);
  }, []);

  const summary = order;

  if (!summary) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <p className="display text-3xl">No recent order found</p>
        <Link to="/" className="btn-ink mt-8">Back to shop</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-16 text-center lg:py-24">
      <p className="eyebrow text-accent">Order received</p>
      <h1 className="display mt-3 text-4xl sm:text-6xl">Salamat{summary.customerFirstName ? `, ${summary.customerFirstName}` : ''}.</h1>
      <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-ink-soft">
        Your order <strong className="break-all text-ink">{summary.orderNumber}</strong> is in.
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
        {summary.paymentMethod === 'cash_on_delivery'
          ? 'Thank you for your order! Your order is now complete and will be prepared for packing and shipping.'
          : 'Thank you for your order! Payment instructions are shown below.'}
      </p>

      <dl className="mx-auto mt-10 max-w-md space-y-3 border border-line bg-white p-6 text-left text-sm">
        <div className="flex justify-between gap-6"><dt className="text-clay">Order no.</dt><dd className="min-w-0 break-words text-right font-semibold">{summary.orderNumber}</dd></div>
        {summary.customerName && (
          <div className="flex justify-between gap-6"><dt className="text-clay">Customer</dt><dd className="min-w-0 break-words text-right">{summary.customerName}</dd></div>
        )}
        {summary.addressLine && (
          <div className="flex justify-between gap-6"><dt className="text-clay">Deliver to</dt><dd className="min-w-0 break-words text-right">{summary.addressLine}</dd></div>
        )}
        <div className="flex justify-between gap-6"><dt className="text-clay">Payment</dt><dd>{summary.paymentMethodLabel}</dd></div>
        {summary.subtotalCents !== undefined && (
          <div className="flex justify-between gap-6"><dt className="text-clay">Subtotal</dt><dd>{formatMoney(summary.subtotalCents)}</dd></div>
        )}
        {Number(summary.discountTotalCents || 0) > 0 && (
          <div className="flex justify-between gap-6 text-accent-deep">
            <dt>{summary.discountCode ? `Discount (${summary.discountCode})` : 'Discount'}</dt>
            <dd>-{formatMoney(summary.discountTotalCents)}</dd>
          </div>
        )}
        {summary.shippingFeeCents !== undefined && (
          <div className="flex justify-between gap-6"><dt className="text-clay">Shipping</dt><dd>{summary.shippingFeeCents ? formatMoney(summary.shippingFeeCents) : 'Free'}</dd></div>
        )}
        {summary.totalCents !== undefined && (
          <div className="flex justify-between gap-6 border-t border-line pt-3 text-base font-semibold"><dt>Total due</dt><dd>{formatMoney(summary.totalCents)}</dd></div>
        )}
      </dl>

      {summary.items?.length > 0 && (
        <section className="mx-auto mt-5 max-w-md border border-line bg-white p-5 text-left">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">Items ordered</h2>
          <div className="mt-4 space-y-3">
            {summary.items.map((item, index) => (
              <article key={`${item.variantId || item.productName || 'item'}-${index}`} className="flex min-w-0 justify-between gap-4 border-b border-line/60 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold">{item.productName || 'Product'}</h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-clay">
                    Qty {item.quantity}{item.size ? ` · Size ${item.size}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <p className="font-semibold">{formatMoney(Number(item.unitPriceCents || 0) * Number(item.quantity || 0))}</p>
                  <p className="text-xs text-clay">{formatMoney(Number(item.unitPriceCents || 0))} each</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link to="/" className="btn-ink customer-compact-button">Continue shopping</Link>
        {settings.messengerUrl && (
          <a href={settings.messengerUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost customer-compact-button">
            Message Us About Your Order
          </a>
        )}
      </div>
    </div>
  );
}
