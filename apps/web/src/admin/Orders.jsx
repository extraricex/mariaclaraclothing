import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminDownload, adminJson } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';

const STATUS_OPTIONS = ['', 'received', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];

export function statusBadge(status) {
  const tones = {
    received: 'bg-cream text-ink-soft',
    confirmed: 'bg-accent/15 text-accent-deep',
    packed: 'bg-accent/15 text-accent-deep',
    shipped: 'bg-ink text-paper',
    delivered: 'bg-ink text-paper',
    cancelled: 'bg-line text-clay line-through'
  };
  return tones[status] || 'bg-cream text-ink-soft';
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [message, setMessage] = useState('');
  const [exportErrors, setExportErrors] = useState([]);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (query) params.set('q', query);
    adminJson(`/api/admin/orders?${params}`)
      .then((body) => setOrders(body.orders))
      .catch((err) => setMessage(err.message));
  }, [status, query]);

  useEffect(() => { load(); }, [load]);

  const codQueue = orders.filter((order) => order.codConfirmationStatus === 'pending' && order.status !== 'cancelled');
  const jntReady = orders.filter((order) => order.jntExportStatus === 'ready');

  function toggle(orderNumber) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(orderNumber)) next.delete(orderNumber);
      else next.add(orderNumber);
      return next;
    });
  }

  async function exportJnt() {
    setMessage('');
    setExportErrors([]);
    try {
      await adminDownload(
        '/api/admin/orders/export/jnt',
        selected.size ? { orderNumbers: [...selected] } : {},
        `JNT_Orders_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      setMessage('J&T export downloaded. Orders marked as exported.');
      setSelected(new Set());
      load();
    } catch (error) {
      setMessage(error.message);
      setExportErrors(error.body?.orders || []);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Orders</p>
          <h1 className="display mt-1 text-3xl">Order management</h1>
        </div>
        <button type="button" className="btn-ink" onClick={exportJnt}>
          Export {selected.size ? `${selected.size} selected` : 'pending'} to J&T
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <span className="border border-line bg-paper px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em]">
          Needs COD confirmation: <strong className="text-accent-deep">{codQueue.length}</strong>
        </span>
        <span className="border border-line bg-paper px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em]">
          Ready for J&T: <strong className="text-accent-deep">{jntReady.length}</strong>
        </span>
      </div>

      {message && <p className="mt-4 text-sm text-ink-soft" role="status">{message}</p>}
      {exportErrors.length > 0 && (
        <ul className="mt-2 space-y-1 border border-accent/40 bg-accent/10 p-4 text-sm text-accent-deep">
          {exportErrors.map((item) => (
            <li key={item.orderNumber}><strong>{item.orderNumber}</strong>: missing {item.missing.join(', ')}</li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <select className="field max-w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>{option ? option : 'All statuses'}</option>
          ))}
        </select>
        <input
          className="field max-w-72"
          placeholder="Search name, phone, order no."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-6 overflow-x-auto border border-line bg-paper">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-clay">
              <th className="p-3"></th>
              <th className="p-3">Order</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Total</th>
              <th className="p-3">Status</th>
              <th className="p-3">COD</th>
              <th className="p-3">J&T</th>
              <th className="p-3">Placed</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.orderNumber} className="border-b border-line/60 hover:bg-cream/60">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(order.orderNumber)}
                    onChange={() => toggle(order.orderNumber)}
                    aria-label={`Select ${order.orderNumber}`}
                  />
                </td>
                <td className="p-3">
                  <Link to={`/admin/orders/${encodeURIComponent(order.orderNumber)}`} className="font-semibold text-accent-deep underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="p-3">{order.customerName}<br /><span className="text-xs text-clay">{order.phone}</span></td>
                <td className="p-3">{formatMoney(order.totalCents)}</td>
                <td className="p-3"><span className={`px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusBadge(order.status)}`}>{order.status}</span></td>
                <td className="p-3 text-xs uppercase">{order.codConfirmationStatus}</td>
                <td className="p-3 text-xs uppercase">{order.jntExportStatus?.replace('_', ' ')}</td>
                <td className="p-3 text-xs text-clay">{order.placedAt ? new Date(order.placedAt).toLocaleString('en-PH') : ''}</td>
              </tr>
            ))}
            {!orders.length && (
              <tr><td colSpan="8" className="p-6 text-center text-sm text-clay">No orders match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
