import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminJson, adminSend } from '../lib/adminApi.js';
import { formatPeso, pesoToCents } from '../lib/money.js';

const EMPTY_FORM = { code: '', type: 'percentage', value: '', endsAt: '', usageLimit: '', minimumPeso: '' };
const DISCOUNT_VIEWS = [
  ['all', 'All'],
  ['active', 'Active'],
  ['scheduled', 'Scheduled'],
  ['expired', 'Expired'],
  ['disabled', 'Disabled']
];

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m14.2 14.2 3.3 3.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8.5" cy="8.5" r="5.7" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function randomDiscountCode() {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `MARIA${suffix}`;
}

function valueLabel(discount) {
  return discount.type === 'percentage' ? `${discount.value}% off` : `${formatPeso(discount.value)} off`;
}

function discountStatus(discount) {
  if (discount.status === 'disabled') return 'disabled';
  if (discount.endsAt && new Date(discount.endsAt).getTime() < Date.now()) return 'expired';
  return discount.status || 'active';
}

function statusBadgeClass(status) {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'expired') return 'border-stone-200 bg-stone-100 text-stone-700';
  if (status === 'disabled') return 'border-line bg-line text-clay';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function viewCount(view, discounts) {
  if (view === 'all') return discounts.length;
  if (view === 'scheduled') return 0;
  return discounts.filter((discount) => discountStatus(discount) === view).length;
}

export default function Discounts() {
  const [discounts, setDiscounts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState('');
  const [activeView, setActiveView] = useState('all');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDiscounts, setSelectedDiscounts] = useState(() => new Set());

  function load() {
    adminJson('/api/admin/discounts')
      .then((body) => setDiscounts(body.discounts))
      .catch((err) => setMessage(err.message));
  }

  useEffect(load, []);

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function createDiscount(event) {
    event.preventDefault();
    setMessage('');
    try {
      await adminSend('POST', '/api/admin/discounts', {
        code: form.code,
        type: form.type,
        value: form.type === 'fixed' ? pesoToCents(form.value) : Math.round(Number(form.value) || 0),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
        minimumSubtotalCents: form.minimumPeso === '' ? null : pesoToCents(form.minimumPeso)
      });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      setMessage('Discount code created.');
      load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function toggleStatus(discount) {
    try {
      await adminSend('PATCH', `/api/admin/discounts/${encodeURIComponent(discount.code)}`, {
        status: discount.status === 'active' ? 'disabled' : 'active'
      });
      load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function remove(discount) {
    if (!window.confirm(`Delete code ${discount.code}? Past orders keep their discount.`)) return;
    try {
      await adminJson(`/api/admin/discounts/${encodeURIComponent(discount.code)}`, { method: 'DELETE' });
      setSelectedDiscounts((previous) => {
        const next = new Set(previous);
        next.delete(discount.code);
        return next;
      });
      load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function exportDiscounts() {
    const rows = [
      ['Code', 'Type', 'Value', 'Status', 'Usage', 'Usage limit', 'Minimum subtotal', 'Start', 'End'],
      ...visibleDiscounts.map((discount) => [
        discount.code,
        discount.type,
        valueLabel(discount),
        discountStatus(discount),
        discount.usageCount || 0,
        discount.usageLimit ?? '',
        discount.minimumSubtotalCents !== null ? formatPeso(discount.minimumSubtotalCents) : '',
        discount.createdAt ? new Date(discount.createdAt).toLocaleDateString('en-PH') : '',
        discount.endsAt ? new Date(discount.endsAt).toLocaleDateString('en-PH') : ''
      ])
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'discounts.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function disableSelectedDiscounts() {
    const selected = discounts.filter((discount) => selectedDiscounts.has(discount.code));
    if (!selected.length) return;
    try {
      await Promise.all(selected.map((discount) => adminSend('PATCH', `/api/admin/discounts/${encodeURIComponent(discount.code)}`, { status: 'disabled' })));
      setSelectedDiscounts(new Set());
      setMessage(`${selected.length} discount${selected.length === 1 ? '' : 's'} disabled.`);
      load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function toggleDiscountSelection(code) {
    setSelectedDiscounts((previous) => {
      const next = new Set(previous);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleAllDiscounts(event) {
    if (event.target.checked) {
      setSelectedDiscounts(new Set(visibleDiscounts.map((discount) => discount.code)));
      return;
    }
    setSelectedDiscounts(new Set());
  }

  const visibleDiscounts = useMemo(() => {
    const search = query.trim().toLowerCase();
    return discounts
      .filter((discount) => activeView === 'all' || (activeView === 'scheduled' ? false : discountStatus(discount) === activeView))
      .filter((discount) => {
        if (!search) return true;
        return [
          discount.code,
          discount.type,
          discount.status,
          valueLabel(discount),
          discount.minimumSubtotalCents !== null ? formatPeso(discount.minimumSubtotalCents) : ''
        ].join(' ').toLowerCase().includes(search);
      });
  }, [activeView, discounts, query]);

  const allVisibleSelected = visibleDiscounts.length > 0 && selectedDiscounts.size === visibleDiscounts.length;
  const activeCount = discounts.filter((discount) => discountStatus(discount) === 'active').length;
  const totalUses = discounts.reduce((sum, discount) => sum + Number(discount.usageCount || 0), 0);

  return (
    <div className="discounts-shell mx-auto w-full max-w-[1280px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Discounts</p>
          <h1 className="display mt-1 text-3xl">Discounts</h1>
          <p className="mt-2 max-w-2xl text-sm text-clay">Create, search, and manage discount codes validated by checkout.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={exportDiscounts}>Export</button>
          <button type="button" className="btn-ink" onClick={() => setShowCreate((value) => !value)}>Create discount</button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-admin)] border border-line bg-paper p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-clay">Total discounts</p>
          <p className="mt-2 text-2xl font-semibold">{discounts.length}</p>
        </div>
        <div className="rounded-[var(--radius-admin)] border border-line bg-paper p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-clay">Active</p>
          <p className="mt-2 text-2xl font-semibold">{activeCount}</p>
        </div>
        <div className="rounded-[var(--radius-admin)] border border-line bg-paper p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-clay">Used</p>
          <p className="mt-2 text-2xl font-semibold">{totalUses}</p>
        </div>
      </div>

      {message && <p className="mt-3 text-sm text-accent-deep" role="status">{message}</p>}

      {showCreate && (
        <form onSubmit={createDiscount} className="mt-6 rounded-[var(--radius-admin)] border border-line bg-paper p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Create discount</h2>
              <p className="mt-1 text-sm text-clay">This first phase supports checkout-validated discount codes.</p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-[var(--radius-admin)] border border-line bg-white p-4">
              <label className="block">
                <span className="eyebrow">Discount method</span>
                <select className="field mt-1" value="code" disabled>
                  <option value="code">Discount code</option>
                </select>
              </label>
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="block">
                  <span className="eyebrow">Discount code</span>
                  <input className="field mt-1 uppercase" required value={form.code} onChange={(e) => update('code', e.target.value)} placeholder="MARIA10" />
                </label>
                <button type="button" className="btn-secondary" onClick={() => update('code', randomDiscountCode())}>Generate code</button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="eyebrow">Type</span>
                  <select className="field mt-1" value={form.type} onChange={(e) => update('type', e.target.value)}>
                    <option value="percentage">Percentage off</option>
                    <option value="fixed">Fixed amount off</option>
                  </select>
                </label>
                <label className="block">
                  <span className="eyebrow">{form.type === 'percentage' ? 'Percent (1-100)' : 'Amount (PHP)'}</span>
                  <input className="field mt-1" required inputMode="decimal" value={form.value} onChange={(e) => update('value', e.target.value)} placeholder={form.type === 'percentage' ? '10' : '100.00'} />
                </label>
              </div>
            </section>
            <section className="rounded-[var(--radius-admin)] border border-line bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Eligibility</h3>
              <label className="mt-3 block">
                <span className="eyebrow">Minimum subtotal</span>
                <input className="field mt-1" inputMode="decimal" value={form.minimumPeso} onChange={(e) => update('minimumPeso', e.target.value)} placeholder="No minimum" />
              </label>
              <label className="mt-3 block">
                <span className="eyebrow">Usage limit</span>
                <input className="field mt-1" type="number" min="1" value={form.usageLimit} onChange={(e) => update('usageLimit', e.target.value)} placeholder="Unlimited" />
              </label>
              <label className="mt-3 block">
                <span className="eyebrow">End date</span>
                <input className="field mt-1" type="date" value={form.endsAt} onChange={(e) => update('endsAt', e.target.value)} />
              </label>
            </section>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" className="btn-ink">Create discount</button>
          </div>
        </form>
      )}

      <div className="mt-6 rounded-[var(--radius-admin)] border border-line bg-paper">
        <div className="discount-view-tabs border-b border-line px-3 pt-3">
          {DISCOUNT_VIEWS.map(([key, label]) => {
            const isActive = activeView === key;
            return (
              <button
                type="button"
                key={key}
                onClick={() => {
                  setActiveView(key);
                  setSelectedDiscounts(new Set());
                }}
                className={`border-b-2 px-3 py-2 text-sm font-semibold ${isActive ? 'border-accent-deep text-accent-deep' : 'border-transparent text-clay hover:border-line hover:text-ink'}`}
              >
                {label}<span className="ml-2 text-xs font-normal text-clay">{viewCount(key, discounts)}</span>
              </button>
            );
          })}
        </div>

        <div className="discount-filter-toolbar p-3" aria-label="Discount filters">
          <label className="discount-search-field flex min-h-11 items-center gap-2 rounded-[var(--radius-admin)] border border-line bg-white px-3">
            <span className="text-clay"><SearchIcon /></span>
            <input
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-clay"
              placeholder="Search discounts by code, type, value, or status"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        {selectedDiscounts.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-cream px-3 py-2 text-sm">
            <span className="font-semibold text-accent-deep">{selectedDiscounts.size} selected</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={disableSelectedDiscounts}>Disable selected</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-clay">
                <th className="w-10 p-3">
                  <input type="checkbox" aria-label="Select all discounts" checked={allVisibleSelected} onChange={toggleAllDiscounts} />
                </th>
                <th className="p-3">Method</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Combinations</th>
                <th className="p-3">Used</th>
                <th className="p-3">Start</th>
                <th className="p-3">End</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {visibleDiscounts.map((discount) => {
                const status = discountStatus(discount);
                return (
                  <tr key={discount.code} className="border-b border-line/60 hover:bg-cream/60">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${discount.code}`}
                        checked={selectedDiscounts.has(discount.code)}
                        onChange={() => toggleDiscountSelection(discount.code)}
                      />
                    </td>
                    <td className="p-3">
                      <Link to={`/admin/discounts/${encodeURIComponent(discount.code)}`} className="font-semibold text-accent-deep underline">{discount.code}</Link>
                      <p className="text-xs text-clay">Discount code</p>
                    </td>
                    <td className="p-3">{valueLabel(discount)}</td>
                    <td className="p-3">
                      <span className={`inline-flex rounded-[var(--radius-admin)] border px-2 py-1 text-[11px] font-bold uppercase ${statusBadgeClass(status)}`}>{status}</span>
                    </td>
                    <td className="p-3 text-xs text-clay">Not combinable</td>
                    <td className="p-3">{discount.usageCount}{discount.usageLimit !== null ? ` / ${discount.usageLimit}` : ''}</td>
                    <td className="p-3 text-xs text-clay">{discount.createdAt ? new Date(discount.createdAt).toLocaleDateString('en-PH') : '-'}</td>
                    <td className="p-3 text-xs text-clay">{discount.endsAt ? new Date(discount.endsAt).toLocaleDateString('en-PH') : 'No end date'}</td>
                    <td className="p-3 text-right">
                      <button type="button" className="text-xs font-semibold text-accent underline" onClick={() => toggleStatus(discount)}>
                        {discount.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                      <button type="button" className="ml-3 text-xs font-semibold text-clay underline hover:text-accent" onClick={() => remove(discount)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!visibleDiscounts.length && (
                <tr><td colSpan="9" className="p-8 text-center text-sm text-clay">No discounts match this view.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
