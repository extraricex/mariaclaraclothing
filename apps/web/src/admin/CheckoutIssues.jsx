import { useCallback, useEffect, useState } from 'react';
import { adminJson, adminSend } from '../lib/adminApi.js';
import AnalyticsRangeControls, { analyticsRangeQuery } from './AnalyticsRangeControls.jsx';

function displayDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila'
  }).format(new Date(value));
}

export default function CheckoutIssues() {
  const [range, setRange] = useState({ range: 'last_30_days', start: '', end: '' });
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState('');
  const [pendingCategory, setPendingCategory] = useState('');

  const load = useCallback(() => {
    setMessage('');
    return adminJson(`/api/admin/analytics/checkout-issues?${analyticsRangeQuery(range)}`)
      .then((body) => setSummary(body.checkoutIssues))
      .catch((error) => setMessage(error.message));
  }, [range]);

  useEffect(() => { load(); }, [load]);

  async function toggleResolved(issue) {
    setPendingCategory(issue.category);
    setMessage('');
    try {
      await adminSend('PATCH', `/api/admin/analytics/checkout-issues/${encodeURIComponent(issue.category)}`, {
        resolved: !issue.resolved
      });
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setPendingCategory('');
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h1 className="display mt-1 text-3xl">Checkout issues</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--admin-muted)]">
            Sanitized checkout, payment, Pancake, and notification failures. Customer names, contact details, full addresses, payment details, and credentials are never stored here.
          </p>
        </div>
        <AnalyticsRangeControls value={range} onChange={setRange} />
      </div>

      {message && <p className="mt-4 text-sm text-[#ff8b98]" role="alert">{message}</p>}
      {!summary ? <p className="mt-8 text-sm text-[var(--admin-muted)]">Loading checkout issues…</p> : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <article className="admin-metric-card"><p className="text-xs text-[var(--admin-muted)]">Failure records</p><strong className="mt-1 block text-2xl">{summary.total || 0}</strong></article>
            <article className="admin-metric-card"><p className="text-xs text-[var(--admin-muted)]">Affected website sessions</p><strong className="mt-1 block text-2xl">{summary.affectedSessions || 0}</strong></article>
            <article className="admin-metric-card"><p className="text-xs text-[var(--admin-muted)]">Date range</p><strong className="mt-1 block text-sm">{summary.rangeLabel}</strong></article>
          </div>

          <section className="admin-panel mt-6 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--admin-line)] text-[var(--admin-muted)]">
                    <th className="py-2 pr-3">Error category</th>
                    <th className="p-2">Records</th>
                    <th className="p-2">Sessions</th>
                    <th className="p-2">Device / browser</th>
                    <th className="p-2">Route</th>
                    <th className="p-2">First seen</th>
                    <th className="p-2">Last seen</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>{(summary.issues || []).map((issue) => (
                  <tr key={issue.category} className="border-b border-[var(--admin-line)]/70 align-top">
                    <td className="py-3 pr-3"><p className="font-semibold">{issue.label}</p>{issue.message && <p className="mt-1 max-w-xs text-[var(--admin-muted)]">{issue.message}</p>}</td>
                    <td className="p-2">{issue.count}</td>
                    <td className="p-2">{issue.affectedSessions ?? '—'}</td>
                    <td className="p-2">{issue.mostAffectedDevice || 'unknown'} / {issue.mostAffectedBrowser || 'unknown'}</td>
                    <td className="max-w-52 break-all p-2">{issue.mostAffectedRoute || '—'}</td>
                    <td className="p-2">{displayDate(issue.firstSeen)}</td>
                    <td className="p-2">{displayDate(issue.lastSeen)}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        className={issue.resolved ? 'btn-secondary !min-h-9 !px-3 !py-1.5' : 'btn-ink !min-h-9 !px-3 !py-1.5'}
                        disabled={pendingCategory === issue.category}
                        onClick={() => toggleResolved(issue)}
                      >
                        {pendingCategory === issue.category ? 'Saving…' : issue.resolved ? 'Resolved' : 'Open'}
                      </button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
              {!summary.issues?.length && <p className="py-5 text-sm text-[#7ee787]">No checkout issues were recorded in this period.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
