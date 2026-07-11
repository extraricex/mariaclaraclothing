import { useEffect, useMemo, useState } from 'react';
import { adminFetch, adminJson, adminSend } from '../lib/adminApi.js';

const ISSUE_TYPES = [
  ['', 'All issue types'],
  ['checkout_problem', 'Checkout problem'],
  ['product_information_issue', 'Product information issue'],
  ['payment_issue', 'Payment issue'],
  ['cart_issue', 'Cart issue'],
  ['website_display_ui_issue', 'Website display/UI issue'],
  ['broken_link', 'Broken link'],
  ['wrong_price', 'Wrong price'],
  ['wrong_stock', 'Wrong stock'],
  ['other', 'Other']
];

const STATUSES = [
  ['', 'All statuses'],
  ['new', 'New'],
  ['reviewing', 'Reviewing'],
  ['fixed', 'Fixed'],
  ['closed', 'Closed'],
  ['invalid', 'Invalid / Not an issue']
];

function labelFor(options, value) {
  return options.find(([candidate]) => candidate === value)?.[1] || value || 'Unknown';
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('en-PH') : 'Date unavailable';
}

export default function IssueReports() {
  const [reports, setReports] = useState([]);
  const [counts, setCounts] = useState({ total: 0, new: 0, open: 0 });
  const [filters, setFilters] = useState({ status: '', issueType: '', search: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.issueType) params.set('issueType', filters.issueType);
    if (filters.search.trim()) params.set('search', filters.search.trim());
    const value = params.toString();
    return value ? `?${value}` : '';
  }, [filters]);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const body = await adminJson(`/api/admin/issue-reports${query}`);
      setReports(body.reports || []);
      setCounts(body.counts || { total: 0, new: 0, open: 0 });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [query]);

  async function updateReport(report, changes) {
    const body = await adminSend('PATCH', `/api/admin/issue-reports/${encodeURIComponent(report.id)}`, changes);
    setReports((current) => current.map((item) => (item.id === report.id ? body.report : item)));
    const countBody = await adminJson('/api/admin/issue-reports/counts');
    setCounts(countBody.counts || counts);
  }

  async function deleteReport(report) {
    if (!window.confirm(`Delete issue report ${report.id}?`)) return;
    const response = await adminFetch(`/api/admin/issue-reports/${encodeURIComponent(report.id)}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setMessage(body.error || 'Could not delete issue report.');
      return;
    }
    setReports((current) => current.filter((item) => item.id !== report.id));
  }

  return (
    <div className="admin-content-shell">
      <p className="eyebrow">Customer feedback</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl">Issue Reports</h1>
          <p className="mt-2 text-sm text-[var(--admin-muted)]">Customer-submitted website bugs, checkout problems, and wrong-information reports.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel)] px-3 py-2"><strong className="block text-lg text-[var(--admin-text)]">{counts.total}</strong>Total</div>
          <div className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel)] px-3 py-2"><strong className="block text-lg text-[var(--admin-orange)]">{counts.new}</strong>New</div>
          <div className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel)] px-3 py-2"><strong className="block text-lg text-[var(--admin-text)]">{counts.open}</strong>Open</div>
        </div>
      </div>

      <section className="mt-6 grid gap-3 rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel)] p-4 md:grid-cols-[1fr_1fr_1.4fr_auto]">
        <select className="field" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
          {STATUSES.map(([value, label]) => <option key={label} value={value}>{label}</option>)}
        </select>
        <select className="field" value={filters.issueType} onChange={(event) => setFilters((current) => ({ ...current, issueType: event.target.value }))}>
          {ISSUE_TYPES.map(([value, label]) => <option key={label} value={value}>{label}</option>)}
        </select>
        <input className="field" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search name, order, message, URL" />
        <button type="button" className="btn-secondary" onClick={load}>Refresh</button>
      </section>

      {message && <p className="mt-4 text-sm text-accent-deep">{message}</p>}
      {loading && <p className="mt-6 text-sm text-[var(--admin-muted)]">Loading issue reports…</p>}

      <div className="mt-6 grid gap-4">
        {!loading && !reports.length && (
          <div className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel)] p-6 text-sm text-[var(--admin-muted)]">
            No issue reports found.
          </div>
        )}
        {reports.map((report) => (
          <article key={report.id} className="rounded-[var(--radius-admin)] border border-[var(--admin-line)] bg-[var(--admin-panel)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-muted)]">{report.id}</p>
                <h2 className="mt-1 text-lg font-bold text-[var(--admin-text)]">{labelFor(ISSUE_TYPES, report.issueType)}</h2>
                <p className="mt-1 text-xs text-[var(--admin-muted)]">{formatDate(report.createdAt)} · {report.pageUrl || 'No page URL'}</p>
              </div>
              <select className="field max-w-48" value={report.status} onChange={(event) => updateReport(report, { status: event.target.value })}>
                {STATUSES.filter(([value]) => value).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--admin-text)]">{report.message}</p>

            <div className="mt-4 grid gap-3 text-xs text-[var(--admin-muted)] md:grid-cols-2 xl:grid-cols-4">
              <div><strong className="block text-[var(--admin-text)]">Customer</strong>{report.name || 'No name'}{report.email ? ` · ${report.email}` : ''}{report.phone ? ` · ${report.phone}` : ''}</div>
              <div><strong className="block text-[var(--admin-text)]">Order</strong>{report.orderNumber || 'Not linked'}</div>
              <div><strong className="block text-[var(--admin-text)]">Screen</strong>{report.screenSize || report.deviceInfo?.screen || 'Unknown'}</div>
              <div><strong className="block text-[var(--admin-text)]">Browser</strong>{report.browserInfo || report.userAgent || 'Unknown'}</div>
            </div>

            {report.errorMessage && (
              <p className="mt-3 rounded border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3 text-xs text-[var(--admin-muted)]">
                <strong className="text-[var(--admin-text)]">Frontend error:</strong> {report.errorMessage}
              </p>
            )}
            {report.screenshotUrl && (
              <a href={`/api/admin/issue-reports/${encodeURIComponent(report.id)}/screenshot`} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-[var(--admin-orange)] underline">
                View screenshot
              </a>
            )}

            <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
              Admin note
              <textarea
                className="field mt-2"
                rows="3"
                defaultValue={report.adminNote}
                onBlur={(event) => updateReport(report, { adminNote: event.target.value })}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => navigator.clipboard?.writeText(report.pageUrl || '')}>Copy page URL</button>
              <button type="button" className="btn-secondary !border-accent-deep/40 !text-accent-deep" onClick={() => deleteReport(report)}>Delete</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
