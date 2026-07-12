import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminDownload, adminJson, adminSend } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';

const STATUS_OPTIONS = [
  '', 'received', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned', 'failed', 'unreachable'
];
const DATE_RANGE_OPTIONS = [
  ['', 'All dates'],
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['last_7_days', 'Last 7 days'],
  ['last_30_days', 'Last 30 days'],
  ['custom', 'Custom range']
];

export function statusBadge(status) {
  const tones = {
    received: 'admin-status-info',
    confirmed: 'admin-status-good',
    packed: 'admin-status-warn',
    shipped: 'admin-status-info',
    delivered: 'admin-status-good',
    cancelled: 'admin-status-bad line-through',
    returned: 'admin-status-warn',
    failed: 'admin-status-bad',
    unreachable: 'admin-status-warn'
  };
  return tones[status] || 'admin-status-info';
}

function humanize(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || '-';
}

function paymentStatusLabel(status) {
  return humanize(status);
}

function fulfillmentStatusLabel(status) {
  return humanize(status || 'unfulfilled');
}

function jntStatusLabel(status) {
  return humanize(status);
}

function promoLabel(order) {
  const snapshot = order.discountSnapshot || {};
  return snapshot.name || snapshot.promoId || order.discountCode || '';
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [message, setMessage] = useState('');
  const [exportErrors, setExportErrors] = useState([]);
  const [updatingStatus, setUpdatingStatus] = useState({});
  const selectAllRef = useRef(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (dateRange) params.set('dateRange', dateRange);
    if (dateRange === 'custom' && dateFrom) params.set('dateFrom', dateFrom);
    if (dateRange === 'custom' && dateTo) params.set('dateTo', dateTo);
    if (query) params.set('q', query);
    adminJson(`/api/admin/orders?${params}`)
      .then((body) => {
        const nextOrders = body.orders || [];
        const visible = new Set(nextOrders.map((order) => order.orderNumber));
        setOrders(nextOrders);
        setSelected((previous) => new Set([...previous].filter((orderNumber) => visible.has(orderNumber))));
      })
      .catch((err) => setMessage(err.message));
  }, [status, dateRange, dateFrom, dateTo, query]);

  useEffect(() => { load(); }, [load]);

  const codQueue = orders.filter((order) => order.codConfirmationStatus === 'pending' && order.status !== 'cancelled');
  const jntReady = orders.filter((order) => order.jntExportStatus === 'ready');
  const selectedOrderNumbers = orders
    .filter((order) => selected.has(order.orderNumber))
    .map((order) => order.orderNumber);
  const allVisibleSelected = orders.length > 0 && selectedOrderNumbers.length === orders.length;
  const someVisibleSelected = selectedOrderNumbers.length > 0 && !allVisibleSelected;
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);
  const exportableOrderNumbers = selectedOrderNumbers.length
    ? selectedOrderNumbers
    : jntReady.map((order) => order.orderNumber);
  const totalSalesCents = orders.reduce((sum, order) => sum + Number(order.totalCents || 0), 0);
  const totalItems = orders.reduce((sum, order) => sum + Number(order.itemCount || 0), 0);
  const deliveredCount = orders.filter((order) =>
    order.status === 'delivered' ||
    order.fulfillmentStatus === 'delivered' ||
    order.deliveryStatus === 'delivered'
  ).length;
  const summaryCards = [
    ['Filtered orders', orders.length],
    ['Needs COD confirmation', codQueue.length],
    ['Ready for J&T', jntReady.length],
    ['Total sales', formatMoney(totalSalesCents)],
    ['Items sold', totalItems],
    ['Delivered', deliveredCount]
  ];

  function toggle(orderNumber) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(orderNumber)) next.delete(orderNumber);
      else next.add(orderNumber);
      return next;
    });
  }

  function toggleAllVisibleOrders() {
    setSelected(allVisibleSelected
      ? new Set()
      : new Set(orders.map((order) => order.orderNumber)));
  }

  async function exportJnt() {
    setMessage('');
    setExportErrors([]);
    if (!exportableOrderNumbers.length) {
      setMessage('No filtered orders are ready for J&T export.');
      return;
    }
    try {
      await adminDownload(
        '/api/admin/orders/export/jnt',
        { orderNumbers: exportableOrderNumbers },
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

  async function updateOrderStatus(order, nextStatus) {
    if (!nextStatus || nextStatus === order.status) return;
    setMessage('');
    setUpdatingStatus((previous) => ({ ...previous, [order.orderNumber]: true }));
    try {
      const body = await adminSend('PATCH', `/api/admin/orders/${encodeURIComponent(order.orderNumber)}`, { status: nextStatus });
      setOrders((previous) => previous.map((item) => item.orderNumber === order.orderNumber ? { ...item, ...body.order } : item));
      setMessage(`${order.orderNumber} status updated to ${humanize(nextStatus)}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setUpdatingStatus((previous) => {
        const next = { ...previous };
        delete next[order.orderNumber];
        return next;
      });
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">Orders</p>
          <h1 className="display mt-1 text-3xl">Order management</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--admin-muted)]">Filter, export, and update fulfillment work from the same operations table.</p>
        </div>
        <button type="button" className="btn-ink" onClick={exportJnt}>
          Export {selectedOrderNumbers.length ? `${selectedOrderNumbers.length} selected` : `${exportableOrderNumbers.length} filtered ready`} to J&T
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {summaryCards.map(([label, value]) => (
          <div key={label} className="admin-metric-card">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</p>
            <p className="mt-2 text-xl font-semibold text-[var(--admin-text)]">{value}</p>
          </div>
        ))}
      </div>

      {message && <p className="mt-4 text-sm text-[var(--admin-muted)]" role="status">{message}</p>}
      {exportErrors.length > 0 && (
        <ul className="admin-panel mt-2 space-y-1 border-[var(--admin-red)]/40 bg-[var(--admin-red)]/10 text-sm text-[#ffd8de]">
          {exportErrors.map((item) => (
            <li key={item.orderNumber}><strong>{item.orderNumber}</strong>: missing {item.missing.join(', ')}</li>
          ))}
        </ul>
      )}

      <div className="admin-panel admin-mobile-stack mt-6">
        <select className="field max-w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>{option ? humanize(option) : 'All statuses'}</option>
          ))}
        </select>
        <select className="field max-w-44" value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
          {DATE_RANGE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {dateRange === 'custom' && (
          <>
            <input className="field max-w-40" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Date from" />
            <input className="field max-w-40" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Date to" />
          </>
        )}
        <input
          className="field max-w-72"
          placeholder="Search name, phone, order no."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="admin-table-shell mt-6">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--admin-line)] text-[11px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">
              <th className="p-3">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="Select all filtered orders"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisibleOrders}
                />
              </th>
              <th className="p-3">Order</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Total</th>
              <th className="p-3">Promo</th>
              <th className="p-3">Items</th>
              <th className="p-3">Order status</th>
              <th className="p-3">Payment</th>
              <th className="p-3">Fulfillment</th>
              <th className="p-3">COD</th>
              <th className="p-3">Shipping</th>
              <th className="p-3">J&T</th>
              <th className="p-3">Placed</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.orderNumber} className="border-b border-[var(--admin-line)]">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(order.orderNumber)}
                    onChange={() => toggle(order.orderNumber)}
                    aria-label={`Select ${order.orderNumber}`}
                  />
                </td>
                <td className="p-3">
                  <Link to={`/admin/orders/${encodeURIComponent(order.orderNumber)}`} className="font-semibold text-[var(--admin-orange)] underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="p-3">{order.customerName}<br /><span className="text-xs text-[var(--admin-muted)]">{order.phone}</span></td>
                <td className="p-3">{formatMoney(order.totalCents)}</td>
                <td className="p-3">
                  {promoLabel(order) ? (
                    <>
                      <span className="block text-xs font-semibold uppercase text-[var(--admin-text)]">{promoLabel(order)}</span>
                      <span className="text-xs text-[var(--admin-muted)]">-{formatMoney(order.discountTotalCents || 0)}</span>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--admin-muted)]">No promo</span>
                  )}
                </td>
                <td className="p-3">{order.itemCount}</td>
                <td className="p-3">
                  <select
                    className={`field min-w-32 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${statusBadge(order.status)}`}
                    value={order.status || 'received'}
                    disabled={Boolean(updatingStatus[order.orderNumber])}
                    onChange={(event) => updateOrderStatus(order, event.target.value)}
                    aria-label={`Update status for ${order.orderNumber}`}
                  >
                    {STATUS_OPTIONS.filter(Boolean).map((option) => (
                      <option key={option} value={option}>{humanize(option)}</option>
                    ))}
                  </select>
                </td>
                <td className="p-3 text-xs uppercase">{paymentStatusLabel(order.paymentStatus)}</td>
                <td className="p-3 text-xs uppercase">{fulfillmentStatusLabel(order.fulfillmentStatus)}</td>
                <td className="p-3 text-xs uppercase">{humanize(order.codConfirmationStatus)}</td>
                <td className="p-3">
                  <span className="block text-xs uppercase">{order.deliveryMethod || 'Standard shipping'}</span>
                  <span className="text-xs text-[var(--admin-muted)]">{order.shippingRegionLabel || 'No region'}</span>
                </td>
                <td className="p-3 text-xs uppercase">{jntStatusLabel(order.jntExportStatus)}</td>
                <td className="p-3 text-xs text-[var(--admin-muted)]">{order.placedAt ? new Date(order.placedAt).toLocaleString('en-PH') : ''}</td>
              </tr>
            ))}
            {!orders.length && (
              <tr><td colSpan="13" className="p-6 text-center text-sm text-[var(--admin-muted)]">No orders match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
