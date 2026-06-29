import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchOrderConfirmation } from '../lib/api.js';
import { formatMoney } from '../lib/money.js';

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

  useEffect(() => {
    if (orderNumber && confirmation?.orderNumber === orderNumber && confirmation.confirmationToken) {
      fetchOrderConfirmation(orderNumber, confirmation.confirmationToken)
        .then((body) => setOrder(body.order))
        .catch(() => {});
    }
  }, [orderNumber, confirmation]);

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
        Your order <strong className="text-ink">{summary.orderNumber}</strong> is in.
        {summary.paymentMethod === 'cash_on_delivery' ? " We'll text you to confirm Cash on Delivery before anything ships." : ' Payment instructions are shown below.'}
      </p>

      <dl className="mx-auto mt-10 max-w-md space-y-3 border border-line bg-white p-6 text-left text-sm">
        <div className="flex justify-between gap-6"><dt className="text-clay">Order no.</dt><dd className="font-semibold">{summary.orderNumber}</dd></div>
        {summary.addressLine && (
          <div className="flex justify-between gap-6"><dt className="text-clay">Deliver to</dt><dd className="text-right">{summary.addressLine}</dd></div>
        )}
        <div className="flex justify-between gap-6"><dt className="text-clay">Payment</dt><dd>{summary.paymentMethodLabel}</dd></div>
        {summary.shippingFeeCents !== undefined && (
          <div className="flex justify-between gap-6"><dt className="text-clay">Shipping</dt><dd>{summary.shippingFeeCents ? formatMoney(summary.shippingFeeCents) : 'Free'}</dd></div>
        )}
        {summary.totalCents !== undefined && (
          <div className="flex justify-between gap-6 border-t border-line pt-3 text-base font-semibold"><dt>Total due</dt><dd>{formatMoney(summary.totalCents)}</dd></div>
        )}
      </dl>

      <Link to="/" className="btn-ink mt-10">Continue shopping</Link>
    </div>
  );
}
