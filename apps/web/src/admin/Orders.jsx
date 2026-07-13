import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminDownload, adminJson, adminSend } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';
import AdminConfirmDialog from './AdminConfirmDialog.jsx';

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
const ORDER_SORT_OPTIONS = [['placed_desc', 'Newest first'], ['placed_asc', 'Oldest first'], ['total_desc', 'Total high-low'], ['total_asc', 'Total low-high'], ['customer_asc', 'Customer A-Z']];
const PAYMENT_STATUS_OPTIONS = ['', 'cod_pending', 'pending_payment', 'paid', 'failed', 'expired', 'cancelled', 'partially_refunded', 'refunded'];
const FULFILLMENT_STATUS_OPTIONS = ['', 'unfulfilled', 'packed', 'shipped', 'delivered', 'cancelled'];

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
  const [paymentStatus, setPaymentStatus] = useState('');
  const [fulfillmentStatus, setFulfillmentStatus] = useState('');
  const [sort, setSort] = useState('placed_desc');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, hasPrevious: false, hasNext: false });
  const [listSummary, setListSummary] = useState(null);
  const [cancelRequest, setCancelRequest] = useState(null);
  const selectAllRef = useRef(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (dateRange) params.set('dateRange', dateRange);
    if (dateRange === 'custom' && dateFrom) params.set('dateFrom', dateFrom);
    if (dateRange === 'custom' && dateTo) params.set('dateTo', dateTo);
    if (query) params.set('q', query);
    if (paymentStatus) params.set('paymentStatus', paymentStatus);
    if (fulfillmentStatus) params.set('fulfillmentStatus', fulfillmentStatus);
    params.set('sort', sort);
    params.set('page', String(page));
    params.set('pageSize', '25');
    adminJson(`/api/admin/orders?${params}`)
      .then((body) => {
        const nextOrders = body.orders || [];
        const visible = new Set(nextOrders.map((order) => order.orderNumber));
        setOrders(nextOrders);
        setPagination(body.pagination || { page: 1, totalPages: 1, total: nextOrders.length, hasPrevious: false, hasNext: false });
        setListSummary(body.summary || null);
        setSelected((previous) => new Set([...previous].filter((orderNumber) => visible.has(orderNumber))));
      })
      .catch((err) => setMessage(err.message));
  }, [status, dateRange, dateFrom, dateTo, query, paymentStatus, fulfillmentStatus, sort, page]);

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
  const summaryCards = [
    ['Filtered orders', listSummary?.total ?? orders.length],
    ['Needs COD confirmation', listSummary?.codPending ?? codQueue.length],
    ['Ready for J&T', listSummary?.jntReady ?? jntReady.length],
    ['Total sales', formatMoney(listSummary?.totalSalesCents ?? 0)],
    ['Items sold', listSummary?.totalItems ?? 0],
    ['Delivered', listSummary?.delivered ?? 0]
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

  async function exportOrdersCsv() {
    setMessage('Preparing order CSV...');
    try {
      await adminDownload('/api/admin/orders/export', {
        orderNumbers: selectedOrderNumbers,
        status, dateRange, dateFrom, dateTo, q: query, paymentStatus, fulfillmentStatus, sort
      }, `maria-clara-orders-${new Date().toISOString().slice(0, 10)}.csv`);
      setMessage(`${selectedOrderNumbers.length ? `${selectedOrderNumbers.length} selected` : 'Filtered'} orders exported.`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function updateOrderStatus(order, nextStatus) {
    if (!nextStatus || nextStatus === order.status) return;
    if (nextStatus === 'cancelled') {
      setCancelRequest({ order, nextStatus });
      return;
    }
    await persistOrderStatus(order, nextStatus);
  }

  async function persistOrderStatus(order, nextStatus) {
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

  async function confirmCancellation() {
    const request = cancelRequest;
    if (!request) return;
    await persistOrderStatus(request.order, request.nextStatus);
    setCancelRequest(null);
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">Orders</p>
          <h1 className="display mt-1 text-3xl">Order management</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--admin-muted)]">Filter, export, and update fulfillment work from the same operations table.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={exportOrdersCsv}>Export CSV</button>
          <button type="button" className="btn-ink" onClick={exportJnt}>
            Export {selectedOrderNumbers.length ? `${selectedOrderNumbers.length} selected` : `${exportableOrderNumbers.length} filtered ready`} to J&T
          </button>
        </div>
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
        <select className="field max-w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>{option ? humanize(option) : 'All statuses'}</option>
          ))}
        </select>
        <select className="field max-w-44" value={dateRange} onChange={(e) => { setDateRange(e.target.value); setPage(1); }}>
          {DATE_RANGE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {dateRange === 'custom' && (
          <>
            <input className="field max-w-40" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} aria-label="Date from" />
            <input className="field max-w-40" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} aria-label="Date to" />
          </>
        )}
        <input
          className="field max-w-72"
          placeholder="Search name, phone, order no."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
        />
        <select className="field max-w-48" value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value); setPage(1); }} aria-label="Payment status filter">
          {PAYMENT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option ? `Payment: ${humanize(option)}` : 'All payment statuses'}</option>)}
        </select>
        <select className="field max-w-48" value={fulfillmentStatus} onChange={(event) => { setFulfillmentStatus(event.target.value); setPage(1); }} aria-label="Fulfillment status filter">
          {FULFILLMENT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option ? `Fulfillment: ${humanize(option)}` : 'All fulfillment statuses'}</option>)}
        </select>
        <select className="field max-w-44" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="Sort orders">
          {ORDER_SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
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
      <div className="mt-3 flex flex-col gap-3 text-sm text-[var(--admin-muted)] sm:flex-row sm:items-center sm:justify-between">
        <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} matching orders</span>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary !px-3 !py-1.5" disabled={!pagination.hasPrevious} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
          <button type="button" className="btn-secondary !px-3 !py-1.5" disabled={!pagination.hasNext} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      </div>
      <AdminConfirmDialog
        open={Boolean(cancelRequest)}
        title={`Cancel ${cancelRequest?.order?.orderNumber || 'order'}?`}
        description="This saves the order as Cancelled, restores its committed stock once, and queues cancellation for the linked Pancake POS order."
        warning="A cancelled order cannot be reopened. Create a replacement order if the customer changes their mind."
        confirmLabel="Cancel order"
        danger
        busy={Boolean(cancelRequest && updatingStatus[cancelRequest.order.orderNumber])}
        onCancel={() => setCancelRequest(null)}
        onConfirm={confirmCancellation}
      />
    </div>
  );
}
