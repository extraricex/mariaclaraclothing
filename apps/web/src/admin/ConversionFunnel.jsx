import { useEffect, useState } from 'react';
import { adminJson } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';
import AnalyticsRangeControls, { analyticsRangeQuery } from './AnalyticsRangeControls.jsx';

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export default function ConversionFunnel() {
  const [range, setRange] = useState({ range: 'last_30_days', start: '', end: '' });
  const [analytics, setAnalytics] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    setMessage('');
    adminJson(`/api/admin/analytics?${analyticsRangeQuery(range)}`)
      .then((body) => { if (active) setAnalytics(body.analytics); })
      .catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [range]);

  const totals = analytics?.totals || {};
  return (
    <div>
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h1 className="display mt-1 text-3xl">Conversion funnel</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--admin-muted)]">
            Anonymous website sessions are used for browsing steps. Successful orders and revenue come only from committed Online Store orders in the website database.
          </p>
        </div>
        <AnalyticsRangeControls value={range} onChange={setRange} />
      </div>

      {message && <p className="mt-4 text-sm text-[#ff8b98]" role="alert">{message}</p>}
      {!analytics ? <p className="mt-8 text-sm text-[var(--admin-muted)]">Loading funnel…</p> : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="admin-metric-card"><p className="text-xs text-[var(--admin-muted)]">Conversion rate</p><strong className="mt-1 block text-2xl">{percent(totals.conversionRate)}</strong></article>
            <article className="admin-metric-card"><p className="text-xs text-[var(--admin-muted)]">Successful orders</p><strong className="mt-1 block text-2xl">{totals.orders || 0}</strong></article>
            <article className="admin-metric-card"><p className="text-xs text-[var(--admin-muted)]">Revenue</p><strong className="mt-1 block text-2xl">{formatMoney(totals.revenueCents || 0)}</strong></article>
            <article className="admin-metric-card"><p className="text-xs text-[var(--admin-muted)]">Date range</p><strong className="mt-1 block text-sm">{analytics.rangeLabel}</strong></article>
          </div>

          <section className="admin-panel mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em]">Primary funnel</h2>
            <p className="mt-1 text-xs text-[var(--admin-muted)]">Drop-off compares each step with the preceding measurable step.</p>
            <div className="mt-5 space-y-4">
              {(analytics.funnel || []).map((step, index) => (
                <article key={step.name} className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{index + 1}. {step.name}</p>
                      <p className="mt-1 text-xs text-[var(--admin-muted)]">{step.count} measured</p>
                    </div>
                    <div className="text-right text-xs">
                      <p>{index === 0 ? 'Baseline' : `${percent(step.rateFromPrevious)} continued`}</p>
                      {index > 0 && <p className="mt-1 text-[#ffb4a2]">{percent(step.dropOffFromPrevious)} drop-off</p>}
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--admin-panel)]">
                    <div className="h-full rounded-full bg-[var(--admin-orange)]" style={{ width: `${Math.max(2, Math.min(100, Number(step.rateFromPrevious || 0)))}%` }} />
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="admin-panel mt-6 overflow-hidden">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em]">Detailed customer journey</h2>
            <p className="mt-1 text-xs text-[var(--admin-muted)]">New instrumentation fills the size, information, Place Order, and confirmation steps from this release onward.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead><tr className="border-b border-[var(--admin-line)] text-[var(--admin-muted)]"><th className="py-2 pr-3">Stage</th><th className="p-2">Measured</th><th className="p-2">Continued</th><th className="p-2">Drop-off</th></tr></thead>
                <tbody>{(analytics.extendedFunnel || []).map((step) => (
                  <tr key={step.name} className="border-b border-[var(--admin-line)]/70">
                    <td className="py-3 pr-3 font-semibold">{step.name}</td>
                    <td className="p-2">{step.count}</td>
                    <td className="p-2">{percent(step.rateFromPrevious)}</td>
                    <td className="p-2">{percent(step.dropOffFromPrevious)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
