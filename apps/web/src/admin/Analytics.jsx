import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminJson } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function title(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Panel({ title: panelTitle, description = '', children, className = '' }) {
  return (
    <section className={`admin-panel ${className}`}>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--admin-text)]">{panelTitle}</h2>
        {description && <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{description}</p>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    setMessage('');
    Promise.all([
      adminJson(`/api/admin/analytics?days=${days}`),
      adminJson('/api/admin/content-readiness')
    ]).then(([analyticsBody, readinessBody]) => {
      if (!active) return;
      setAnalytics(analyticsBody.analytics);
      setReadiness(readinessBody.readiness);
    }).catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [days]);

  const totals = analytics?.totals || {};
  const metrics = [
    ['Sessions', totals.sessions || 0],
    ['Product views', totals.productViews || 0],
    ['Add to carts', totals.addToCarts || 0],
    ['Checkout starts', totals.checkoutStarts || 0],
    ['Payment issues', Number(totals.paymentFailures || 0) + Number(totals.paymentCancellations || 0)],
    ['Completed orders', totals.orders || 0],
    ['Revenue', formatMoney(totals.revenueCents || 0)],
    ['Average order', formatMoney(totals.averageOrderValueCents || 0)]
  ];

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">Sales & SEO</p>
          <h1 className="display mt-1 text-3xl">Conversion analytics</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--admin-muted)]">Privacy-safe storefront funnel data, authoritative completed-order revenue, product performance, and content gaps. Cancelled and marked test orders are excluded from sales.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Analytics date range">
          {[7, 30, 90].map((value) => (
            <button key={value} type="button" className={days === value ? 'btn-ink' : 'btn-secondary'} onClick={() => setDays(value)}>{value} days</button>
          ))}
        </div>
      </div>

      {message && <p className="mt-4 text-sm text-[#ff8b98]" role="alert">{message}</p>}
      {!analytics ? <p className="mt-8 text-sm text-[var(--admin-muted)]">Loading analytics…</p> : (
        <>
          {!analytics.measurementStarted && (
            <div className="mt-5 rounded-[var(--radius-admin)] border border-[var(--admin-yellow)]/45 bg-[var(--admin-yellow)]/10 p-4 text-sm text-[#ffd166]">
              First-party measurement starts after this release is deployed. Historical orders are included, but earlier page views and cart activity cannot be reconstructed.
            </div>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            {metrics.map(([label, value]) => (
              <article key={label} className="admin-metric-card">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</p>
                <p className="mt-2 text-xl font-semibold text-[var(--admin-text)]">{value}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-12">
            <Panel title="Customer funnel" description="Rates compare each step with the previous measurable step." className="xl:col-span-7">
              <div className="space-y-3">
                {(analytics.funnel || []).map((step, index) => (
                  <div key={step.name}>
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="font-semibold text-[var(--admin-text)]">{step.name}</span>
                      <span className="text-[var(--admin-muted)]">{step.count} · {index === 0 ? 'baseline' : percent(step.rateFromPrevious)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--admin-panel-soft)]">
                      <div className="h-full rounded-full bg-[var(--admin-orange)]" style={{ width: `${Math.max(2, Math.min(100, Number(step.rateFromPrevious || 0)))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Traffic context" description="Only anonymous device class and campaign tags are retained." className="xl:col-span-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--admin-muted)]">Devices</h3>
                  <dl className="mt-2 space-y-2">
                    {(analytics.devices || []).map((item) => <div key={item.name} className="flex justify-between gap-3 text-sm"><dt>{title(item.name)}</dt><dd>{item.count}</dd></div>)}
                    {!analytics.devices?.length && <p className="text-xs text-[var(--admin-muted)]">No device data yet.</p>}
                  </dl>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--admin-muted)]">Payment</h3>
                  <dl className="mt-2 space-y-2">
                    {(analytics.paymentMethods || []).map((item) => <div key={item.name} className="flex justify-between gap-3 text-sm"><dt>{title(item.name)}</dt><dd>{item.count}</dd></div>)}
                    {!analytics.paymentMethods?.length && <p className="text-xs text-[var(--admin-muted)]">No completed orders in this period.</p>}
                  </dl>
                </div>
              </div>
              <div className="mt-4 border-t border-[var(--admin-line)] pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--admin-muted)]">Campaigns</h3>
                <div className="mt-2 space-y-2">
                  {(analytics.campaigns || []).map((item) => <div key={item.name} className="flex justify-between gap-3 text-xs"><span className="break-all">{item.name}</span><strong>{item.count}</strong></div>)}
                  {!analytics.campaigns?.length && <p className="text-xs text-[var(--admin-muted)]">Add standard UTM tags to campaign links to attribute sessions here.</p>}
                </div>
              </div>
              <div className="mt-4 border-t border-[var(--admin-line)] pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--admin-muted)]">Last pages in session</h3>
                <div className="mt-2 space-y-2">
                  {(analytics.exitPages || []).map((item) => <div key={item.name} className="flex justify-between gap-3 text-xs"><span className="break-all">{item.name}</span><strong>{item.count}</strong></div>)}
                  {!analytics.exitPages?.length && <p className="text-xs text-[var(--admin-muted)]">Session exit signals will appear after storefront page views are measured.</p>}
                </div>
              </div>
            </Panel>

            <Panel title="Product performance" description="Revenue comes from saved order line items; views and carts begin after analytics deployment." className="overflow-hidden xl:col-span-8">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-xs">
                  <thead><tr className="border-b border-[var(--admin-line)] text-[var(--admin-muted)]"><th className="py-2 pr-3">Product</th><th className="p-2">Views</th><th className="p-2">Carts</th><th className="p-2">View → cart</th><th className="p-2">Qty sold</th><th className="p-2 text-right">Revenue</th></tr></thead>
                  <tbody>{(analytics.topProducts || []).map((product) => (
                    <tr key={product.productId} className="border-b border-[var(--admin-line)]/70"><td className="py-3 pr-3 font-semibold">{product.name}</td><td className="p-2">{product.views}</td><td className="p-2">{product.addToCarts}</td><td className="p-2">{percent(product.viewToCartRate)}</td><td className="p-2">{product.quantity}</td><td className="p-2 text-right">{formatMoney(product.revenueCents)}</td></tr>
                  ))}</tbody>
                </table>
                {!analytics.topProducts?.length && <p className="py-4 text-xs text-[var(--admin-muted)]">Product performance will appear as customers browse and place valid orders.</p>}
              </div>
            </Panel>

            <Panel title="Cancellation reasons" description="Every new cancellation now requires a standardized reason." className="xl:col-span-4">
              <div className="space-y-2">
                {(analytics.cancellations || []).map((item) => <div key={item.name} className="flex justify-between gap-4 border-b border-[var(--admin-line)]/70 pb-2 text-sm"><span>{title(item.name)}</span><strong>{item.count}</strong></div>)}
                {!analytics.cancellations?.length && <p className="text-xs text-[var(--admin-muted)]">No cancellations in this period.</p>}
              </div>
            </Panel>

            <Panel title="Core Web Vitals" description="Anonymous real-user p75 measurements. LCP, FCP, INP and TTFB are milliseconds; CLS is a unitless layout-shift score." className="xl:col-span-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {(analytics.webVitals || []).map((metric) => (
                  <div key={metric.name} className="admin-metric-card">
                    <p className="text-xs font-semibold">{metric.name}</p>
                    <p className="mt-1 text-lg font-bold">{metric.p75}</p>
                    <p className="text-[10px] text-[var(--admin-muted)]">p75 · {metric.samples} samples</p>
                  </div>
                ))}
                {!analytics.webVitals?.length && <p className="text-xs text-[var(--admin-muted)] sm:col-span-2">Real-user performance data begins after deployment.</p>}
              </div>
            </Panel>

            <Panel title="Payment issues" description="PayMongo checkout-session errors and customer cancellations; no payment details are stored." className="xl:col-span-6">
              <div className="space-y-2">
                {(analytics.paymentIssues || []).map((item) => <div key={item.name} className="flex justify-between gap-4 border-b border-[var(--admin-line)]/70 pb-2 text-sm"><span>{title(item.name)}</span><strong>{item.count}</strong></div>)}
                {!analytics.paymentIssues?.length && <p className="text-xs text-[var(--admin-muted)]">No payment issues measured in this period.</p>}
              </div>
            </Panel>
          </div>
        </>
      )}

      {readiness && (
        <Panel title="Product content readiness" description="These checks flag missing sales and SEO inputs; they never invent product facts or images." className="mt-6">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="admin-metric-card"><p className="text-xs text-[var(--admin-muted)]">Products checked</p><strong className="mt-1 block text-xl">{readiness.summary.total}</strong></div>
            <div className="admin-metric-card"><p className="text-xs text-[var(--admin-muted)]">Ready</p><strong className="mt-1 block text-xl text-[#7ee787]">{readiness.summary.ready}</strong></div>
            <div className="admin-metric-card"><p className="text-xs text-[var(--admin-muted)]">Needs attention</p><strong className="mt-1 block text-xl text-[#ffd166]">{readiness.summary.needsAttention}</strong></div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {(readiness.products || []).filter((product) => !product.ready).map((product) => (
              <article key={product.slug} className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><p className="text-sm font-semibold">{product.name}</p><p className="text-xs text-[var(--admin-muted)]">{product.imageCount} images · {product.issueCount} checks</p></div>
                  <Link to={`/admin/products/${encodeURIComponent(product.slug)}`} className="text-xs font-semibold text-[var(--admin-orange)] underline">Edit product</Link>
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--admin-muted)]">{product.issues.map((issue) => <li key={issue.code}>{issue.label}</li>)}</ul>
              </article>
            ))}
          </div>
          {readiness.summary.needsAttention === 0 && <p className="text-sm text-[#7ee787]">All current products pass the configured content checks.</p>}
        </Panel>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/admin/analytics/meta-reconciliation" className="admin-panel text-sm font-semibold hover:border-[var(--admin-orange)]">Reconcile website, Pancake, and Meta orders →</Link>
        <Link to="/admin/pancake" className="admin-panel text-sm font-semibold hover:border-[var(--admin-orange)]">Review Pancake POS health →</Link>
        <Link to="/admin/payments" className="admin-panel text-sm font-semibold hover:border-[var(--admin-orange)]">Review PayMongo operations →</Link>
        <Link to="/admin/settings" className="admin-panel text-sm font-semibold hover:border-[var(--admin-orange)]">Review Meta and store settings →</Link>
      </div>
    </div>
  );
}
