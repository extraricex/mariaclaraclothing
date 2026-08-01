import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminJson } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';

const TIME_ZONE = 'Asia/Manila';

function manilaDate(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function readable(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status) {
  if (status === 'correct') return 'border-[#3fbf83]/45 bg-[#3fbf83]/10 text-[#8ee0b7]';
  if (status === 'not_eligible_for_purchase') return 'border-[var(--admin-line)] bg-[var(--admin-panel-soft)] text-[var(--admin-muted)]';
  return 'border-[var(--admin-red)]/45 bg-[var(--admin-red)]/10 text-[#ffb4bd]';
}

function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusTone(status)}`}>{readable(status)}</span>;
}

function YesNo({ value, yes = 'Sent', no = 'Not sent' }) {
  return <span className={value ? 'text-[#8ee0b7]' : 'text-[var(--admin-muted)]'}>{value ? yes : no}</span>;
}

function MetaDetails({ row }) {
  return (
    <div className="space-y-1 text-xs">
      <p className="break-all"><span className="text-[var(--admin-muted)]">ID:</span> {row.metaEventId || 'Missing'}</p>
      <p><span className="text-[var(--admin-muted)]">Browser:</span> <YesNo value={row.browserPurchaseSent} /> · <span className="text-[var(--admin-muted)]">CAPI:</span> <YesNo value={row.capiPurchaseSent} /></p>
      <p><span className="text-[var(--admin-muted)]">IDs match:</span> <YesNo value={row.browserServerEventIdMatch} yes="Yes" no="No" /></p>
      <p><span className="text-[var(--admin-muted)]">Meta:</span> {row.metaValueCents === null ? 'Missing value' : formatMoney(row.metaValueCents)} · {row.metaCurrency || 'Missing currency'}</p>
    </div>
  );
}

function PancakeDetails({ row }) {
  const pancakeOrderIds = row.pancakeOrderIds?.length ? row.pancakeOrderIds : [row.pancakeOrderId].filter(Boolean);
  return (
    <div className="space-y-1 text-xs">
      <p className="break-all"><span className="text-[var(--admin-muted)]">Order{pancakeOrderIds.length === 1 ? '' : 's'}:</span> {pancakeOrderIds.length ? pancakeOrderIds.join(' · ') : 'Missing'}</p>
      <p><span className="text-[var(--admin-muted)]">Link:</span> {readable(row.pancakeSyncStatus)}</p>
      <p><span className="text-[var(--admin-muted)]">Export:</span> {readable(row.pancakeExportStatus)}</p>
      {row.pancakePayableCents !== null && <p><span className="text-[var(--admin-muted)]">Provider payable:</span> {formatMoney(row.pancakePayableCents)}</p>}
    </div>
  );
}

export default function MetaReconciliation() {
  const today = useMemo(() => manilaDate(), []);
  const earliestDate = useMemo(() => shiftDate(today, -365), [today]);
  const [form, setForm] = useState({ start: shiftDate(today, -6), end: today });
  const [request, setRequest] = useState({ start: shiftDate(today, -6), end: today, revision: 0 });
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setMessage('');
    setData(null);
    const query = new URLSearchParams({ start: request.start, end: request.end, timezone: TIME_ZONE });
    adminJson(`/api/admin/analytics/meta-reconciliation?${query}`, { signal: controller.signal })
      .then((body) => { if (active) setData(body.reconciliation); })
      .catch((error) => { if (active && error.name !== 'AbortError') setMessage(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [request]);

  const rows = (data?.rows || []).filter((row) => !status || row.reconciliationStatus === status);
  const statuses = [...new Set((data?.rows || []).map((row) => row.reconciliationStatus))].sort();
  const summary = data?.summary || {};
  const eventCoverage = data?.eventCoverage || [];
  const coverageNames = ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase'];
  const coverageCount = (eventName, source, states) => eventCoverage
    .filter((item) => item.eventName === eventName && item.source === source && states.includes(item.status))
    .reduce((total, item) => total + Number(item.count || 0), 0);
  const purchaseCapiSent = coverageCount('Purchase', 'server', ['sent']);
  const expectedPurchases = Number(summary.expectedMetaPurchaseCount || 0);
  const purchaseDeliveryRate = expectedPurchases > 0
    ? `${Math.min(100, Math.round((purchaseCapiSent / expectedPurchases) * 100))}%`
    : '—';
  const metrics = [
    ['Website orders', summary.totalWebsiteOrders || 0],
    ['Eligible purchases', summary.eligiblePurchaseOrders || 0],
    ['Pancake orders', summary.pancakeOrders || 0],
    ['Unique Meta IDs', summary.uniquePurchaseEventIds || 0],
    ['Expected count', summary.expectedMetaPurchaseCount || 0],
    ['Pancake-only', summary.pancakeOrdersMissingWebsite || 0],
    ['Duplicate warnings', summary.duplicateEventsDetected || 0],
    ['Unexpected Meta', summary.unexpectedMetaEvents || 0],
    ['Missing Meta', summary.missingEvents || 0],
    ['CAPI delivery', purchaseDeliveryRate],
    ['Order value', formatMoney(summary.totalActualOrderValueCents || 0)],
    ['Meta value', formatMoney(summary.totalMetaPurchaseValueCents || 0)]
  ];

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">Analytics · Order control</p>
          <h1 className="display mt-1 text-3xl">Meta reconciliation</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--admin-muted)]">Compare authoritative website orders, Pancake links, and saved browser/CAPI Purchase dispatches using the same exact Asia/Manila reporting period.</p>
        </div>
        <Link to="/admin/analytics" className="btn-secondary !border-[var(--admin-line)] !bg-[var(--admin-panel)] !text-[var(--admin-text)]">Back to analytics</Link>
      </div>

      <form
        className="admin-panel mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,180px)_minmax(0,180px)_minmax(0,220px)_auto] lg:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setStatus('');
          setRequest((current) => ({ ...form, revision: current.revision + 1 }));
        }}
      >
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--admin-muted)]">Start date
          <input className="field mt-1" type="date" value={form.start} min={earliestDate} max={form.end} onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))} required />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--admin-muted)]">End date
          <input className="field mt-1" type="date" value={form.end} min={form.start} max={today} onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))} required />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--admin-muted)]">Result status
          <select className="field mt-1" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All reconciliation statuses</option>
            {statuses.map((item) => <option key={item} value={item}>{readable(item)}</option>)}
          </select>
        </label>
        <button className="btn-ink justify-self-start lg:justify-self-stretch" type="submit" disabled={loading}>{loading ? 'Checking…' : 'Reconcile orders'}</button>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4" aria-label="Quick reporting periods">
          {[7, 14, 28].map((days) => (
            <button
              key={days}
              type="button"
              className="btn-secondary !px-3 !py-2 !text-xs"
              disabled={loading}
              onClick={() => {
                const next = { start: shiftDate(today, -(days - 1)), end: today };
                setForm(next);
                setStatus('');
                setRequest((current) => ({ ...next, revision: current.revision + 1 }));
              }}
            >
              Last {days} days
            </button>
          ))}
        </div>
      </form>

      {message && <p className="mt-4 rounded-[var(--radius-admin)] border border-[var(--admin-red)]/45 bg-[var(--admin-red)]/10 p-4 text-sm text-[#ffb4bd]" role="alert">{message}</p>}

      {data && (
        <>
          <p className="mt-4 text-xs text-[var(--admin-muted)]">Period: {data.dateRange.start} through {data.dateRange.end}, Asia/Manila. Database bounds: {data.dateRange.startUtc} up to but excluding {data.dateRange.endExclusiveUtc}.</p>
          <p className="mt-1 text-xs text-[var(--admin-muted)]">Order identity: <code>order_number</code> is both the immutable database primary identity and the public order number; there is no separate internal order UUID.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-10">
            {metrics.map(([label, value]) => (
              <article key={label} className="admin-metric-card">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--admin-muted)]">{label}</p>
                <p className="mt-2 break-words text-lg font-semibold text-[var(--admin-text)]">{value}</p>
              </article>
            ))}
          </div>

          <section className="admin-panel mt-5 overflow-hidden">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em]">Browser and CAPI event coverage</h2>
            <p className="mt-1 text-xs text-[var(--admin-muted)]">Counts come from the website dispatch ledger. Each browser/server pair should share one event ID; this is not an Ads attribution report. Server CAPI is intentionally authoritative for COD Purchase events, so browser Purchase remains disabled.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="border-b border-[var(--admin-line)] text-[10px] uppercase tracking-[0.08em] text-[var(--admin-muted)]">
                  <tr><th className="py-3 pr-3">Event</th><th className="p-3 text-right">Browser sent</th><th className="p-3 text-right">CAPI sent</th><th className="p-3 text-right">CAPI pending/retrying</th><th className="p-3 text-right">CAPI failed</th></tr>
                </thead>
                <tbody className="divide-y divide-[var(--admin-line)]/70">
                  {coverageNames.map((eventName) => (
                    <tr key={eventName}>
                      <td className="py-3 pr-3 font-semibold">{eventName}</td>
                      <td className="p-3 text-right">{coverageCount(eventName, 'browser', ['sent'])}</td>
                      <td className="p-3 text-right">{coverageCount(eventName, 'server', ['sent'])}</td>
                      <td className="p-3 text-right">{coverageCount(eventName, 'server', ['pending', 'sending'])}</td>
                      <td className="p-3 text-right">{coverageCount(eventName, 'server', ['failed'])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-panel mt-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em]">Meta reporting availability</h2>
            <div className={`mt-3 rounded-[var(--radius-admin)] border p-3 text-xs leading-5 ${data.livePancake?.complete ? 'border-[#3fbf83]/40 bg-[#3fbf83]/10 text-[#8ee0b7]' : 'border-[var(--admin-red)]/45 bg-[var(--admin-red)]/10 text-[#ffb4bd]'}`}>
              <strong className="block text-[var(--admin-text)]">Live Pancake comparison: {readable(data.livePancake?.status)}</strong>
              {data.dataAvailability?.pancakeLiveCompleteness?.reason}
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--admin-muted)]">This page proves what the website dispatched. It does not invent Ads Manager attribution totals. Export Meta Ads/Events data for the identical period, or grant a server integration the required <code>ads_read</code>/dataset permissions, to compare ad-account time zone, attribution windows, reporting time, filters, raw events, and automatic Event Setup rules.</p>
            <ul className="mt-3 grid gap-2 md:grid-cols-3">
              {['metaRawEvents', 'metaAdsAttributedPurchases', 'automaticEventRules'].map((key) => (
                <li key={key} className="rounded-[var(--radius-admin)] border border-[var(--admin-yellow)]/35 bg-[var(--admin-yellow)]/10 p-3 text-xs leading-5 text-[#ffd166]">
                  <strong className="block text-[var(--admin-text)]">{readable(key)}</strong>
                  {data.dataAvailability?.[key]?.reason}
                </li>
              ))}
            </ul>
          </section>

          <section className="admin-panel mt-5 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.1em]">Order-by-order evidence</h2>
                <p className="mt-1 text-xs text-[var(--admin-muted)]">{rows.length} of {data.rows.length} orders shown. Customer email, phone, and address are intentionally excluded.</p>
              </div>
              {status && <button type="button" className="btn-secondary !py-2 !text-xs" onClick={() => setStatus('')}>Clear filter</button>}
            </div>

            <div className="mt-4 hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1280px] text-left text-xs">
                <thead className="border-b border-[var(--admin-line)] text-[10px] uppercase tracking-[0.08em] text-[var(--admin-muted)]">
                  <tr><th className="py-3 pr-3">Order</th><th className="p-3">Date / customer</th><th className="p-3">Payment / status</th><th className="p-3 text-right">Actual total</th><th className="p-3">Pancake</th><th className="p-3">Meta Purchase</th><th className="p-3">Result</th></tr>
                </thead>
                <tbody className="divide-y divide-[var(--admin-line)]/70">
                  {rows.map((row) => (
                    <tr key={row.reconciliationId} className="align-top">
                      <td className="py-4 pr-3">{row.recordType === 'website_order' ? <Link className="font-semibold text-[var(--admin-orange)] hover:underline" to={`/admin/orders/${encodeURIComponent(row.orderNumber)}`}>{row.orderNumber}</Link> : <><strong>Pancake-only order</strong><p className="mt-1 break-all text-[var(--admin-muted)]">{row.orderNumber || row.pancakeOrderId}</p></>}</td>
                      <td className="p-3"><time>{formatDateTime(row.orderDateTime)}</time>{row.paidAt && <p className="mt-1 text-[var(--admin-muted)]">Paid {formatDateTime(row.paidAt)}</p>}{row.customerDisplayName && <p className="mt-1 font-semibold">{row.customerDisplayName}</p>}</td>
                      <td className="p-3"><p>{readable(row.paymentMethod)}</p><p className="mt-1 text-[var(--admin-muted)]">{readable(row.paymentStatus)} · {readable(row.orderStatus)}</p><p className="mt-1 text-[var(--admin-muted)]">Source: {readable(row.orderSource)}</p></td>
                      <td className="p-3 text-right font-semibold">{row.recordType === 'website_order' ? formatMoney(row.actualFinalTotalCents) : 'No website order'}<p className="mt-1 font-normal text-[var(--admin-muted)]">{row.recordType === 'website_order' ? (row.actualCurrency || 'Missing currency') : 'Provider-only'}</p></td>
                      <td className="p-3"><PancakeDetails row={row} /></td>
                      <td className="p-3"><MetaDetails row={row} /></td>
                      <td className="p-3"><StatusBadge status={row.reconciliationStatus} />{row.warnings.length > 0 && <p className="mt-2 max-w-48 text-[11px] leading-4 text-[var(--admin-muted)]">{row.warnings.map(readable).join(' · ')}</p>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-3 lg:hidden">
              {rows.map((row) => (
                <article key={row.reconciliationId} className="min-w-0 rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>{row.recordType === 'website_order' ? <Link className="break-all font-semibold text-[var(--admin-orange)]" to={`/admin/orders/${encodeURIComponent(row.orderNumber)}`}>{row.orderNumber}</Link> : <strong>Pancake-only · {row.orderNumber || row.pancakeOrderId}</strong>}<p className="mt-1 text-xs text-[var(--admin-muted)]">{formatDateTime(row.orderDateTime)}{row.customerDisplayName ? ` · ${row.customerDisplayName}` : ''}</p></div>
                    <StatusBadge status={row.reconciliationStatus} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div><p className="eyebrow">Order</p><p className="mt-1 text-sm">{readable(row.paymentMethod)} · {readable(row.paymentStatus)}</p><p className="mt-1 text-xs text-[var(--admin-muted)]">Source: {readable(row.orderSource)}</p>{row.paidAt && <p className="mt-1 text-xs text-[var(--admin-muted)]">Paid {formatDateTime(row.paidAt)}</p>}<p className="mt-1 font-semibold">{row.recordType === 'website_order' ? `${formatMoney(row.actualFinalTotalCents)} · ${row.actualCurrency}` : 'No matching website order'}</p></div>
                    <div><p className="eyebrow">Pancake</p><div className="mt-1"><PancakeDetails row={row} /></div></div>
                    <div className="sm:col-span-2"><p className="eyebrow">Meta</p><div className="mt-1"><MetaDetails row={row} /></div></div>
                  </div>
                  {row.warnings.length > 0 && <p className="mt-4 break-words rounded border border-[var(--admin-line)] p-2 text-xs text-[var(--admin-muted)]">{row.warnings.map(readable).join(' · ')}</p>}
                </article>
              ))}
            </div>
            {!rows.length && <p className="mt-5 text-sm text-[var(--admin-muted)]">No orders match this date range and status filter.</p>}
          </section>
        </>
      )}
    </div>
  );
}
