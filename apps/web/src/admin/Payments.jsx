import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminJson } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';

function titleCase(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status) {
  if (['paid', 'partially_refunded', 'refunded', 'succeeded', 'synced'].includes(status)) return 'border-[var(--admin-green)]/45 bg-[var(--admin-green)]/10 text-[#7ee787]';
  if (['failed', 'expired'].includes(status)) return 'border-[var(--admin-red)]/45 bg-[var(--admin-red)]/10 text-[#ff8b98]';
  return 'border-[var(--admin-yellow)]/45 bg-[var(--admin-yellow)]/10 text-[#ffd166]';
}

function Metric({ label, value, hint }) {
  return (
    <article className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel)] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold text-[var(--admin-text)]">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--admin-muted)]">{hint}</p>}
    </article>
  );
}

export default function Payments() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (query.trim()) params.set('q', query.trim());
    const timer = setTimeout(() => {
      adminJson(`/api/admin/payments?${params}`)
        .then(setData)
        .catch((error) => setMessage(error.message));
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [status, query]);

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (query.trim()) params.set('q', query.trim());
    return `/api/admin/payments/export?${params}`;
  }, [status, query]);

  if (!data) return <p className="text-sm text-[var(--admin-muted)]">{message || 'Loading payment operations...'}</p>;
  const summary = data.summary || {};
  const operations = data.operations || [];
  const alerts = data.alerts || [];

  return (
    <div className="mx-auto max-w-[1540px] text-[var(--admin-text)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-[var(--admin-orange)]">Payment operations</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">PayMongo payments</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--admin-muted)]">Monitor verified payments, refund state, and Pancake linkage without exposing provider secrets.</p>
        </div>
        <a className="btn-secondary !border-[var(--admin-line)] !bg-[var(--admin-panel)] !text-[var(--admin-text)]" href={exportUrl}>Export CSV</a>
      </div>

      <div className={`mt-5 rounded-[var(--radius-admin)] border p-4 ${data.provider?.mode === 'live' ? 'border-[var(--admin-green)]/45 bg-[var(--admin-green)]/10' : 'border-[var(--admin-yellow)]/45 bg-[var(--admin-yellow)]/10'}`}>
        <p className="text-sm font-semibold">PayMongo {titleCase(data.provider?.mode || 'not configured')} mode</p>
        <p className="mt-1 text-xs text-[var(--admin-muted)]">
          {data.provider?.refundsEnabled
            ? 'Live refund requests are enabled. Every request still requires explicit confirmation on its order.'
            : 'Payments can be inspected, but refunds remain disabled until production uses verified PayMongo live credentials.'}
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="PayMongo orders" value={summary.totalCount || 0} hint={formatMoney(summary.totalAmountCents || 0)} />
        <Metric label="Paid" value={summary.paidCount || 0} hint={formatMoney(summary.paidAmountCents || 0)} />
        <Metric label="Pending" value={summary.pendingCount || 0} />
        <Metric label="Failed / expired" value={summary.failedCount || 0} />
        <Metric label="Refunded" value={formatMoney(summary.refundedAmountCents || 0)} />
        <Metric label="Active alerts" value={alerts.length} />
      </div>

      {alerts.length > 0 && (
        <section className="mt-5 border-y border-[var(--admin-line)] py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em]">Needs attention</h2>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {alerts.map((alert, index) => (
              <article key={`${alert.code}-${alert.orderNumber}-${alert.createdAt}-${index}`} className={`rounded-[var(--radius-admin)] border p-3 ${statusTone(alert.level === 'error' ? 'failed' : 'pending')}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em]">{titleCase(alert.code)}</p>
                  {alert.orderNumber && <Link className="text-xs underline" to={`/admin/orders/${encodeURIComponent(alert.orderNumber)}`}>{alert.orderNumber}</Link>}
                </div>
                <p className="mt-1 text-xs text-[var(--admin-text)]/80">{alert.message}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input className="field !border-[var(--admin-line)] !bg-[var(--admin-panel)] !text-[var(--admin-text)] sm:max-w-sm" type="search" placeholder="Search order or payment ID" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select className="field !border-[var(--admin-line)] !bg-[var(--admin-panel)] !text-[var(--admin-text)] sm:max-w-56" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All payment statuses</option>
            {['pending_payment', 'paid', 'partially_refunded', 'refunded', 'failed', 'expired'].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto rounded-[var(--radius-admin)] border border-[var(--admin-line)]">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-[var(--admin-panel-soft)] text-[10px] uppercase tracking-[0.1em] text-[var(--admin-muted)]">
              <tr><th className="p-3">Order</th><th className="p-3">Placed</th><th className="p-3">Payment</th><th className="p-3">Amount</th><th className="p-3">Refund</th><th className="p-3">Pancake</th><th className="p-3">Provider IDs</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--admin-line)] bg-[var(--admin-panel)]">
              {operations.map((operation) => (
                <tr key={operation.orderNumber}>
                  <td className="p-3"><Link className="font-semibold text-[var(--admin-orange)] hover:underline" to={`/admin/orders/${encodeURIComponent(operation.orderNumber)}`}>{operation.orderNumber}</Link></td>
                  <td className="p-3 text-xs text-[var(--admin-muted)]">{operation.placedAt ? new Date(operation.placedAt).toLocaleString('en-PH') : 'Unavailable'}</td>
                  <td className="p-3"><span className={`inline-flex rounded-[var(--radius-admin)] border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${statusTone(operation.paymentStatus)}`}>{titleCase(operation.paymentStatus)}</span></td>
                  <td className="p-3 font-semibold">{formatMoney(operation.totalCents)}</td>
                  <td className="p-3 text-xs"><p>{formatMoney(operation.refundedAmountCents || 0)}</p><p className="mt-1 text-[var(--admin-muted)]">{titleCase(operation.latestRefundStatus || 'none')}</p></td>
                  <td className="p-3 text-xs"><p>{operation.pancakeOrderId || 'Not linked'}</p><p className="mt-1 text-[var(--admin-muted)]">{titleCase(operation.pancakeSyncStatus)}</p></td>
                  <td className="max-w-64 p-3 text-[10px] text-[var(--admin-muted)]"><p className="break-all">{operation.paymentId || 'No payment ID'}</p><p className="mt-1 break-all">{operation.checkoutSessionId || 'No session ID'}</p></td>
                </tr>
              ))}
              {!operations.length && <tr><td colSpan="7" className="p-8 text-center text-sm text-[var(--admin-muted)]">No PayMongo payments match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
