import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminJson } from '../lib/adminApi.js';
import { formatPeso } from '../lib/money.js';

function trustLabel(customer) {
  if (customer.cancelledCount === 0 && customer.unreachableCount === 0 && customer.deliveredCount > 0) {
    return ['Trusted', 'bg-[#2f7d32]/10 text-[#2f7d32]'];
  }
  if (customer.cancelledCount > 0 || customer.unreachableCount > 0) {
    return ['Review', 'bg-[#b8860b]/10 text-[#8a6508]'];
  }
  return ['New', 'bg-cream text-ink-soft'];
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState('');
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    adminJson(`/api/admin/customers?${params}`)
      .then((body) => setCustomers(body.customers))
      .catch((err) => setError(err.message));
  }, [query]);

  useEffect(() => { load(); }, [load]);

  function toggleDetail(phone) {
    if (expanded === phone) {
      setExpanded('');
      setDetail(null);
      return;
    }
    setExpanded(phone);
    setDetail(null);
    adminJson(`/api/admin/customers/${encodeURIComponent(phone)}`)
      .then(setDetail)
      .catch((err) => setError(err.message));
  }

  return (
    <div>
      <p className="eyebrow">Customers</p>
      <h1 className="display mt-1 text-3xl">Customer profiles</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Built automatically from order history (matched by mobile number). Use the trust badge
        when confirming COD orders — repeat buyers with clean delivery history rarely refuse parcels.
      </p>
      {error && <p className="mt-3 text-sm text-accent-deep">{error}</p>}

      <input
        className="field mt-6 max-w-md"
        placeholder="Search name, phone, or email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="admin-table-shell mt-6">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-clay">
              <th className="p-3">Customer</th>
              <th className="p-3">Orders</th>
              <th className="p-3">Total spent</th>
              <th className="p-3">Delivered</th>
              <th className="p-3">Cancelled / Unreachable</th>
              <th className="p-3">COD trust</th>
              <th className="p-3">Last order</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => {
              const [label, badgeClass] = trustLabel(customer);
              return [
                <tr
                  key={customer.phone}
                  className="cursor-pointer border-b border-line/60 hover:bg-cream/60"
                  onClick={() => toggleDetail(customer.phone)}
                >
                  <td className="p-3">
                    <strong className="block">{customer.fullName || 'Customer'}</strong>
                    <span className="text-xs text-clay">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</span>
                  </td>
                  <td className="p-3">{customer.ordersCount}</td>
                  <td className="p-3">{formatPeso(customer.totalSpentCents)}</td>
                  <td className="p-3">{customer.deliveredCount}</td>
                  <td className="p-3">{customer.cancelledCount} / {customer.unreachableCount}</td>
                  <td className="p-3"><span className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${badgeClass}`}>{label}</span></td>
                  <td className="p-3 text-xs text-clay">{customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString('en-PH') : ''}</td>
                </tr>,
                expanded === customer.phone && (
                  <tr key={`${customer.phone}-detail`} className="border-b border-line/60 bg-cream/40">
                    <td colSpan="7" className="p-4">
                      {!detail ? <p className="text-xs text-clay">Loading order history…</p> : (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-clay">
                            {customer.city ? `${customer.city}, ${customer.province} · ` : ''}Order history
                          </p>
                          <ul className="mt-2 space-y-1.5">
                            {detail.orders.map((order) => (
                              <li key={order.orderNumber} className="flex flex-wrap items-center gap-3 text-xs">
                                <Link to={`/admin/orders/${encodeURIComponent(order.orderNumber)}`} className="font-semibold text-accent-deep underline">
                                  {order.orderNumber}
                                </Link>
                                <span>{formatPeso(order.totalCents)}</span>
                                <span className="uppercase text-clay">{order.status}</span>
                                <span className="text-clay">{order.placedAt ? new Date(order.placedAt).toLocaleString('en-PH') : ''}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              ];
            })}
            {!customers.length && (
              <tr><td colSpan="7" className="p-6 text-center text-sm text-clay">No customers yet — they appear automatically after the first order.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
