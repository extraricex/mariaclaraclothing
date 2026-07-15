import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { adminDownloadGet, adminFetch, adminJson, adminSend } from '../lib/adminApi.js';

const STATUSES = ['pending', 'published', 'hidden', 'archived', 'spam', 'rejected'];
const SOURCES = ['customer_submitted', 'verified_order', 'imported', 'admin_created'];
const MODERATION_REASONS = [
  'Spam', 'Fake review', 'Duplicate', 'Abusive content', 'Irrelevant content', 'Personal information',
  'Prohibited content', 'Wrong product', 'Customer requested removal'
];

function formatDate(value) {
  return value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function reviewDateInput(value) {
  const parsed = new Date(value || '');
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
}

function statusClass(status) {
  if (status === 'published') return 'bg-emerald-100 text-emerald-800';
  if (status === 'pending') return 'bg-amber-100 text-amber-900';
  if (status === 'spam' || status === 'rejected') return 'bg-red-100 text-red-800';
  return 'bg-slate-200 text-slate-700';
}

function AdminReviewTabs() {
  return (
    <nav className="mt-6 flex max-w-full gap-2 overflow-x-auto border-b border-[var(--admin-line)] pb-2" aria-label="Review administration">
      <Link className="btn-secondary whitespace-nowrap" to="/admin/reviews">All reviews</Link>
      <Link className="btn-secondary whitespace-nowrap" to="/admin/reviews/import">Import reviews</Link>
      <Link className="btn-secondary whitespace-nowrap" to="/admin/reviews/settings">Settings</Link>
    </nav>
  );
}

function ReviewSettings() {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { adminJson('/api/admin/reviews/settings').then((body) => setForm(body.settings)).catch((error) => setMessage(error.message)); }, []);
  if (!form) return <p className="mt-6 text-sm text-[var(--admin-muted)]">{message || 'Loading review settings…'}</p>;
  const fields = [
    ['enabled', 'Enable Reviews', 'Master switch. Review records remain stored when disabled.'],
    ['showOnProductPages', 'Show Reviews on Product Pages', 'Show the full customer review section.'],
    ['showRatingsOnProductCards', 'Show Ratings on Product Cards', 'Show real published averages on product grids.'],
    ['allowCustomerSubmissions', 'Allow Customers to Submit Reviews', 'Enable the Write a Review form.'],
    ['autoPublishVerified', 'Auto-publish Verified Reviews', 'Publish a verified review only when admin approval is not required.'],
    ['requireAdminApproval', 'Require Admin Approval', 'Keep new reviews Pending until moderated.'],
    ['showStoreReviews', 'Show Store Reviews', 'Display the Store Reviews tab only when published store reviews exist.'],
    ['allowReviewPhotos', 'Allow Review Photos', 'Permit optimized JPG, PNG, and WebP customer uploads.']
  ];
  async function save() {
    setSaving(true); setMessage('');
    try {
      const body = await adminSend('PUT', '/api/admin/reviews/settings', form);
      setForm(body.settings); setMessage('Review visibility settings saved.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }
  return (
    <section className="mt-6 max-w-3xl border border-[var(--admin-line)] bg-[var(--admin-panel)] p-5 sm:p-7">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--admin-text)]">Global review visibility</h2>
      <div className="mt-5 divide-y divide-[var(--admin-line)]">
        {fields.map(([key, label, hint]) => (
          <label key={key} className="flex items-start justify-between gap-5 py-4 text-sm text-[var(--admin-text)]">
            <span><strong className="block">{label}</strong><span className="mt-1 block text-xs text-[var(--admin-muted)]">{hint}</span></span>
            <input type="checkbox" className="mt-1" checked={Boolean(form[key])} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))} />
          </label>
        ))}
      </div>
      <button type="button" className="btn-primary mt-6" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save review settings'}</button>
      {message && <p className="mt-3 text-sm text-[var(--admin-muted)]" role="status">{message}</p>}
    </section>
  );
}

function downloadText(text, filename, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

function ReviewImport() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [token, setToken] = useState('');
  const [errorCsv, setErrorCsv] = useState('');
  const [batches, setBatches] = useState([]);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  function loadBatches() {
    adminJson('/api/admin/reviews/import/batches').then((body) => setBatches(body.batches || [])).catch(() => {});
  }
  useEffect(loadBatches, []);

  async function previewFile() {
    if (!file) { setMessage('Choose an XLSX file first.'); return; }
    const data = new FormData(); data.append('file', file);
    setPending(true); setMessage('');
    try {
      const response = await adminFetch('/api/admin/reviews/import/preview', { method: 'POST', body: data });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Preview failed.');
      setPreview(body.preview); setToken(body.previewToken); setErrorCsv(body.errorReportCsv || '');
      setMessage('Preview complete. Review all matching and validation results before importing.');
    } catch (error) { setMessage(error.message); }
    finally { setPending(false); }
  }

  async function confirmImport() {
    if (!file || !token) return;
    const data = new FormData(); data.append('file', file); data.append('previewToken', token);
    setPending(true); setMessage('');
    try {
      const response = await adminFetch('/api/admin/reviews/import/confirm', { method: 'POST', body: data });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Import failed.');
      setErrorCsv(body.errorReportCsv || '');
      setMessage(`Import complete: ${body.successfulRows} Pending reviews imported, ${body.failedRows} rows failed.`);
      setPreview(null); setToken(''); loadBatches();
    } catch (error) { setMessage(error.message); }
    finally { setPending(false); }
  }

  return (
    <div className="mt-6 space-y-5">
      <section className="border border-[var(--admin-line)] bg-[var(--admin-panel)] p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Excel review import</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--admin-muted)]">Uses SheetJS CE 0.20.3 from the official CDN. Files are limited to 5 MB and 2,000 rows; formulas, unsafe URLs, invalid products, scripts, and duplicate reviews are rejected.</p></div>
          <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => adminDownloadGet('/api/admin/reviews/import/template', 'maria-clara-review-import-template.xlsx')}>Download Review Import Template</button>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-xs font-semibold uppercase tracking-[0.1em]">Review workbook (.xlsx)<input className="field mt-1" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setToken(''); }} /></label>
          <button type="button" className="btn-primary" disabled={pending || !file} onClick={previewFile}>{pending ? 'Checking…' : 'Preview import'}</button>
        </div>
        {message && <p className="mt-4 text-sm text-[var(--admin-muted)]" role="status">{message}</p>}
      </section>
      {preview && (
        <section className="border border-[var(--admin-line)] bg-[var(--admin-panel)] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Import preview</h2><p className="mt-1 text-xs text-[var(--admin-muted)]">{preview.parser} · {preview.totalRows} rows · {preview.validRows} valid · {preview.invalidRows} invalid</p></div>
            <div className="flex flex-wrap gap-2">{errorCsv && <button type="button" className="btn-secondary" onClick={() => downloadText(errorCsv, 'review-import-errors.csv')}>Download error report</button>}<button type="button" className="btn-primary" disabled={pending || preview.validRows < 1} onClick={confirmImport}>Import {preview.validRows} valid rows</button></div>
          </div>
          <div className="mt-5 max-w-full overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead><tr className="border-b border-[var(--admin-line)] text-[var(--admin-muted)]"><th className="p-2">Row</th><th className="p-2">Result</th><th className="p-2">Product match</th><th className="p-2">Reviewer</th><th className="p-2">Rating</th><th className="p-2">Title</th><th className="p-2">Errors / warnings</th></tr></thead>
              <tbody>{preview.rows.map((row) => <tr key={row.rowNumber} className="border-b border-[var(--admin-line)] align-top"><td className="p-2">{row.rowNumber}</td><td className="p-2 font-semibold">{row.valid ? 'Valid' : 'Invalid'}</td><td className="p-2">{row.productMatch.productName || 'Unmatched'}<span className="block text-[var(--admin-muted)]">{row.productMatch.method}</span></td><td className="p-2">{row.reviewerName}</td><td className="p-2">{row.rating}</td><td className="max-w-48 break-words p-2">{row.title}</td><td className="max-w-md p-2 text-red-300">{[...(row.errors || []), ...(row.warnings || [])].join(' · ') || '—'}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
      <section className="border border-[var(--admin-line)] bg-[var(--admin-panel)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Recent import batches</h2>
        <div className="mt-4 space-y-3">{batches.length ? batches.map((batch) => <div key={batch.id} className="flex flex-col gap-2 border-b border-[var(--admin-line)] pb-3 text-xs sm:flex-row sm:items-center sm:justify-between"><span><strong>{batch.filename}</strong><span className="mt-1 block text-[var(--admin-muted)]">{formatDate(batch.createdAt)} · {batch.successfulRows} imported · {batch.failedRows} failed</span></span>{batch.failedRows > 0 && <button type="button" className="text-left text-[var(--admin-orange)] underline" onClick={() => adminDownloadGet(`/api/admin/reviews/import/batches/${encodeURIComponent(batch.id)}/errors.csv`, `review-import-errors-${batch.id}.csv`)}>Error report</button>}</div>) : <p className="text-xs text-[var(--admin-muted)]">No review imports yet.</p>}</div>
      </section>
    </div>
  );
}

function ReviewEditor({ reviewId, products, onClose, onSaved }) {
  const [review, setReview] = useState(null);
  const [audit, setAudit] = useState([]);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (reviewId === 'new') {
      setReview({ productSlug: products[0]?.slug || '', reviewerName: '', reviewerEmail: '', rating: 5, title: '', body: '', variant: '', size: '', orderNumber: '', status: 'pending', verifiedPurchase: false, adminReply: '', concernResolved: false, images: [], moderationReason: '', createdAt: new Date().toISOString() });
      return;
    }
    adminJson(`/api/admin/reviews/${encodeURIComponent(reviewId)}`).then((body) => { setReview(body.review); setAudit(body.audit || []); }).catch((error) => setMessage(error.message));
  }, [reviewId, products]);
  if (!review) return <div className="fixed inset-0 z-[90] bg-black/60 p-6"><div className="mx-auto max-w-3xl bg-[var(--admin-panel)] p-8 text-sm">{message || 'Loading review…'}</div></div>;
  const set = (field, value) => setReview((current) => ({ ...current, [field]: value }));
  async function save() {
    setPending(true); setMessage('');
    try {
      const payload = { ...review, imageUrls: (review.images || []).map((image) => image.imageUrl) };
      const body = reviewId === 'new'
        ? await adminSend('POST', '/api/admin/reviews', payload)
        : await adminSend('PUT', `/api/admin/reviews/${encodeURIComponent(review.id)}`, payload);
      setReview(body.review); setMessage('Review saved with an audit entry.'); onSaved();
    } catch (error) { setMessage(error.message); }
    finally { setPending(false); }
  }
  async function moderate(action) {
    const needsReason = ['hide', 'archive', 'spam', 'reject'].includes(action);
    const reason = needsReason ? window.prompt(`Moderation reason (${MODERATION_REASONS.join(', ')}):`, review.moderationReason || '') : '';
    if (needsReason && !reason) return;
    setPending(true);
    try {
      const body = await adminSend('POST', `/api/admin/reviews/${encodeURIComponent(review.id)}/moderate`, { action, reason });
      setReview(body.review); setMessage(`Review ${action} action saved.`); onSaved();
    } catch (error) { setMessage(error.message); }
    finally { setPending(false); }
  }
  async function remove(permanent = false) {
    const reason = window.prompt(`Reason required (${MODERATION_REASONS.join(', ')}):`, review.moderationReason || '');
    if (!reason) return;
    const confirmation = permanent ? window.prompt('Type PERMANENTLY DELETE to continue:') : '';
    if (permanent && confirmation !== 'PERMANENTLY DELETE') return;
    setPending(true);
    try {
      await adminJson(`/api/admin/reviews/${encodeURIComponent(review.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, permanent, confirmation }) });
      onSaved(); onClose();
    } catch (error) { setMessage(error.message); setPending(false); }
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 sm:items-center sm:p-5" role="presentation">
      <div className="max-h-[94svh] w-full max-w-4xl overflow-y-auto bg-[var(--admin-panel)] p-5 text-[var(--admin-text)] shadow-2xl sm:rounded sm:p-7" role="dialog" aria-modal="true" aria-label="Review editor">
        <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">{reviewId === 'new' ? 'Admin created' : `Review ${review.id}`}</p><h2 className="display mt-1 text-2xl">{reviewId === 'new' ? 'Create review' : review.productName}</h2></div><button type="button" className="min-h-11 min-w-11 text-2xl" onClick={onClose} aria-label="Close review editor">×</button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-[0.1em]">Product<select className="field mt-1" value={review.productSlug} onChange={(e) => set('productSlug', e.target.value)}>{products.map((product) => <option key={product.slug} value={product.slug}>{product.name}</option>)}</select></label>
          <label className="text-xs font-semibold uppercase tracking-[0.1em]">Status<select className="field mt-1" value={review.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label className="text-xs font-semibold uppercase tracking-[0.1em]">Customer display name<input className="field mt-1" value={review.reviewerName || ''} onChange={(e) => set('reviewerName', e.target.value)} /></label>
          <label className="text-xs font-semibold uppercase tracking-[0.1em]">Private email<input className="field mt-1" type="email" value={review.reviewerEmail || ''} onChange={(e) => set('reviewerEmail', e.target.value)} /></label>
          <label className="text-xs font-semibold uppercase tracking-[0.1em]">Rating<select className="field mt-1" value={review.rating} onChange={(e) => set('rating', Number(e.target.value))}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating}</option>)}</select></label>
          <label className="text-xs font-semibold uppercase tracking-[0.1em]">Review date<input className="field mt-1" type="date" value={reviewDateInput(review.createdAt)} onChange={(e) => set('createdAt', e.target.value ? `${e.target.value}T00:00:00.000Z` : review.createdAt)} /></label>
          <label className="text-xs font-semibold uppercase tracking-[0.1em]">Private order number<input className="field mt-1" value={review.orderNumber || ''} onChange={(e) => set('orderNumber', e.target.value)} /></label>
          <label className="text-xs font-semibold uppercase tracking-[0.1em]">Variant<input className="field mt-1" value={review.variant || ''} onChange={(e) => set('variant', e.target.value)} /></label>
          <label className="text-xs font-semibold uppercase tracking-[0.1em]">Size<input className="field mt-1" value={review.size || ''} onChange={(e) => set('size', e.target.value)} /></label>
        </div>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.1em]">Review title<input className="field mt-1" value={review.title || ''} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.1em]">Review message<textarea className="field mt-1 min-h-32" value={review.body || ''} onChange={(e) => set('body', e.target.value)} /></label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.1em]">Public store reply<textarea className="field mt-1 min-h-24" value={review.adminReply || ''} onChange={(e) => set('adminReply', e.target.value)} /></label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.1em]">Photo URLs (one per line)<textarea className="field mt-1 min-h-20" value={(review.images || []).map((image) => image.imageUrl).join('\n')} onChange={(e) => set('images', e.target.value.split('\n').map((imageUrl) => ({ imageUrl: imageUrl.trim() })).filter((image) => image.imageUrl))} /></label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={Boolean(review.verifiedPurchase)} onChange={(e) => set('verifiedPurchase', e.target.checked)} /> Verified Purchase (requires live order match)</label>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={Boolean(review.concernResolved)} onChange={(e) => set('concernResolved', e.target.checked)} /> Concern resolved</label>
        </div>
        {['hidden', 'archived', 'spam', 'rejected'].includes(review.status) && <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.1em]">Moderation reason<select className="field mt-1" value={review.moderationReason || ''} onChange={(e) => set('moderationReason', e.target.value)}><option value="">Select reason</option>{MODERATION_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label>}
        {message && <p className="mt-4 text-sm text-[var(--admin-muted)]" role="status">{message}</p>}
        <div className="mt-6 flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save review'}</button>{reviewId !== 'new' && <><button type="button" className="btn-secondary" onClick={() => moderate('publish')}>Publish</button><button type="button" className="btn-secondary" onClick={() => moderate('hide')}>Hide</button><button type="button" className="btn-secondary" onClick={() => moderate('archive')}>Archive</button><button type="button" className="btn-secondary" onClick={() => moderate('spam')}>Spam</button><button type="button" className="btn-secondary" onClick={() => moderate('restore')}>Restore</button><button type="button" className="btn-secondary !text-red-300" onClick={() => remove(false)}>Soft delete</button><button type="button" className="btn-secondary !text-red-300" onClick={() => remove(true)}>Permanent delete</button></>}</div>
        {audit.length > 0 && <details className="mt-7 border-t border-[var(--admin-line)] pt-4"><summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.1em]">Audit history ({audit.length})</summary><div className="mt-3 space-y-2">{audit.map((event) => <div key={event.id} className="text-xs text-[var(--admin-muted)]"><strong className="text-[var(--admin-text)]">{event.action.replaceAll('_', ' ')}</strong> · {formatDate(event.createdAt)} · {event.actor}{event.reason ? ` · ${event.reason}` : ''}</div>)}</div></details>}
      </div>
    </div>
  );
}

function ReviewList() {
  const [filters, setFilters] = useState({ search: '', productSlug: '', status: '', rating: '', source: '', verified: false, withPhotos: false, includeDeleted: false, dateFrom: '', dateTo: '', page: 1 });
  const [data, setData] = useState({ reviews: [], counts: {}, pagination: { total: 0 } });
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [editor, setEditor] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== '' && value !== false) params.set(key, String(value)); });
    params.set('pageSize', '25');
    return params.toString();
  }, [filters]);
  useEffect(() => { adminJson('/api/admin/reviews/products').then((body) => setProducts(body.products || [])).catch(() => {}); }, []);
  useEffect(() => { adminJson(`/api/admin/reviews?${query}`).then(setData).catch((error) => setMessage(error.message)); }, [query, refresh]);
  const setFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value, page: 1 }));
  async function bulk(action) {
    if (!selected.length) { setMessage('Select at least one review.'); return; }
    const reason = ['hide', 'archive', 'spam'].includes(action) ? window.prompt(`Reason required (${MODERATION_REASONS.join(', ')}):`) : '';
    if (['hide', 'archive', 'spam'].includes(action) && !reason) return;
    try { await adminSend('POST', '/api/admin/reviews/bulk', { ids: selected, action, reason }); setSelected([]); setRefresh((value) => value + 1); setMessage('Bulk moderation action saved.'); } catch (error) { setMessage(error.message); }
  }
  return (
    <div className="mt-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{STATUSES.map((status) => <button key={status} type="button" className="border border-[var(--admin-line)] bg-[var(--admin-panel)] p-3 text-left" onClick={() => setFilter('status', status)}><span className="block text-xl font-semibold">{data.counts?.[status] || 0}</span><span className="text-[10px] uppercase tracking-[0.1em] text-[var(--admin-muted)]">{status}</span></button>)}</div>
      <div className="mt-5 grid gap-3 border border-[var(--admin-line)] bg-[var(--admin-panel)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input className="field" placeholder="Search reviews" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
        <select className="field" value={filters.productSlug} onChange={(e) => setFilter('productSlug', e.target.value)}><option value="">All products</option>{products.map((product) => <option key={product.slug} value={product.slug}>{product.name}</option>)}</select>
        <select className="field" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}><option value="">All statuses</option>{STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select>
        <select className="field" value={filters.rating} onChange={(e) => setFilter('rating', e.target.value)}><option value="">All ratings</option>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}</select>
        <select className="field" value={filters.source} onChange={(e) => setFilter('source', e.target.value)}><option value="">All sources</option>{SOURCES.map((source) => <option key={source} value={source}>{source.replaceAll('_', ' ')}</option>)}</select>
        <input className="field" type="date" value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} aria-label="Review date from" />
        <input className="field" type="date" value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} aria-label="Review date to" />
        <div className="flex flex-wrap items-center gap-4 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={filters.verified} onChange={(e) => setFilter('verified', e.target.checked)} /> Verified</label><label className="flex items-center gap-2"><input type="checkbox" checked={filters.withPhotos} onChange={(e) => setFilter('withPhotos', e.target.checked)} /> With photos</label><label className="flex items-center gap-2"><input type="checkbox" checked={filters.includeDeleted} onChange={(e) => setFilter('includeDeleted', e.target.checked)} /> Deleted</label></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" className="btn-primary" onClick={() => setEditor('new')}>Create review</button>{['publish', 'hide', 'spam', 'archive', 'restore'].map((action) => <button key={action} type="button" className="btn-secondary" onClick={() => bulk(action)}>{action}</button>)}<span className="text-xs text-[var(--admin-muted)]">{selected.length} selected · {data.pagination?.total || 0} results</span></div>
      {message && <p className="mt-3 text-sm text-[var(--admin-muted)]" role="status">{message}</p>}
      <div className="mt-5 grid gap-3">
        {data.reviews?.map((review) => (
          <article key={review.id} className="min-w-0 border border-[var(--admin-line)] bg-[var(--admin-panel)] p-4">
            <div className="flex min-w-0 items-start gap-3">
              <input type="checkbox" className="mt-1" checked={selected.includes(review.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, review.id] : current.filter((id) => id !== review.id))} aria-label={`Select review ${review.id}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${statusClass(review.status)}`}>{review.status}</span>{review.deletedAt && <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold uppercase text-red-800">Deleted</span>}{review.verifiedPurchase && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase text-emerald-800">Verified</span>}<strong className="break-words text-sm">{review.productName}</strong><span className="text-xs text-[var(--admin-muted)]">{'★★★★★'.slice(0, review.rating)}</span></div>
                <h3 className="mt-2 break-words text-sm font-semibold">{review.title || 'Untitled review'}</h3>
                <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-[var(--admin-muted)]">{review.body}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.08em] text-[var(--admin-muted)]"><span>ID {review.id}</span><span>{review.reviewerName}</span><span>{review.source.replaceAll('_', ' ')}</span><span>{formatDate(review.createdAt)}</span><span>{review.images?.length || 0} photos</span>{review.adminReply && <span>Store reply</span>}{review.moderationReason && <span>Reason: {review.moderationReason}</span>}</div>
              </div>
              <button type="button" className="btn-secondary shrink-0" onClick={() => setEditor(review.id)}>View / edit</button>
            </div>
          </article>
        ))}
        {!data.reviews?.length && <p className="py-10 text-center text-sm text-[var(--admin-muted)]">No reviews match these filters.</p>}
      </div>
      {Number(data.pagination?.total || 0) > 25 && <div className="mt-5 flex items-center justify-center gap-3"><button type="button" className="btn-secondary" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button><span className="text-xs text-[var(--admin-muted)]">Page {filters.page} of {Math.ceil(data.pagination.total / 25)}</span><button type="button" className="btn-secondary" disabled={filters.page >= Math.ceil(data.pagination.total / 25)} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button></div>}
      {editor && <ReviewEditor reviewId={editor} products={products} onClose={() => setEditor('')} onSaved={() => setRefresh((value) => value + 1)} />}
    </div>
  );
}

export default function Reviews() {
  const location = useLocation();
  const mode = location.pathname.endsWith('/settings') ? 'settings' : location.pathname.endsWith('/import') ? 'import' : 'list';
  return (
    <div className="admin-content-shell min-w-0">
      <p className="eyebrow">Customer feedback</p>
      <h1 className="display mt-1 text-3xl">Reviews</h1>
      <p className="mt-2 text-sm text-[var(--admin-muted)]">Moderate honestly, protect customer privacy, verify purchases against delivered orders, and publish only the records you intend to show.</p>
      <AdminReviewTabs />
      {mode === 'settings' ? <ReviewSettings /> : mode === 'import' ? <ReviewImport /> : <ReviewList />}
    </div>
  );
}
