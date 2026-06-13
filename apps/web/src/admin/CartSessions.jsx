import { useCallback, useEffect, useState } from 'react';
import { adminJson } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';

const PAGE_COPY = {
  draft: {
    eyebrow: 'Orders / Draft',
    title: 'Draft carts',
    description: 'Customers with items still in their cart. Anonymous means they have not entered checkout contact details yet.'
  },
  abandoned_checkout: {
    eyebrow: 'Orders / Abandoned Checkout',
    title: 'Abandoned checkouts',
    description: 'Customers who started checkout but have not placed an order.'
  }
};

export default function CartSessions({ status }) {
  const [sessions, setSessions] = useState([]);
  const [message, setMessage] = useState('');
  const copy = PAGE_COPY[status] || PAGE_COPY.draft;

  const load = useCallback(() => {
    adminJson(`/api/admin/cart-sessions?status=${status}`)
      .then((body) => setSessions(body.sessions || []))
      .catch((error) => setMessage(error.message));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="display mt-1 text-3xl">{copy.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">{copy.description}</p>
        </div>
        <button type="button" className="btn-ghost" onClick={load}>Refresh</button>
      </div>

      {message && <p className="mt-4 text-sm text-accent-deep" role="status">{message}</p>}

      <div className="mt-6 overflow-x-auto border border-line bg-paper">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-clay">
              <th className="p-3">Customer</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Items</th>
              <th className="p-3">Subtotal</th>
              <th className="p-3">Cart contents</th>
              <th className="p-3">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.sessionId} className="border-b border-line/60 align-top hover:bg-cream/60">
                <td className="p-3 font-semibold">{session.customerName || 'Anonymous'}</td>
                <td className="p-3 text-xs text-clay">
                  <span className="block">{session.phone || 'No phone yet'}</span>
                  <span className="block">{session.email || 'No email'}</span>
                  <span className="block">{session.addressLine || 'No address yet'}</span>
                </td>
                <td className="p-3">{session.itemCount}</td>
                <td className="p-3">{formatMoney(session.subtotalCents)}</td>
                <td className="p-3">
                  <ul className="space-y-1 text-xs text-ink-soft">
                    {(session.items || []).map((item) => (
                      <li key={`${session.sessionId}-${item.variantId}`}>
                        {item.quantity}x {item.productName} {item.size ? `(${item.size})` : ''}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="p-3 text-xs text-clay">{session.lastActivityAt ? new Date(session.lastActivityAt).toLocaleString('en-PH') : ''}</td>
              </tr>
            ))}
            {!sessions.length && (
              <tr><td colSpan="6" className="p-6 text-center text-sm text-clay">No sessions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
