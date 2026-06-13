import { useState } from 'react';
import { adminSend } from '../lib/adminApi.js';

const PAGES = [
  { key: 'faq', label: 'FAQ' },
  { key: 'shippingReturns', label: 'Shipping & Returns' },
  { key: 'terms', label: 'Terms' }
];

export default function InfoPagesEditor({ initial }) {
  const [pages, setPages] = useState(initial);
  const [active, setActive] = useState('faq');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const rows = pages[active] || [];

  function setRows(updater) {
    setPages((current) => ({ ...current, [active]: updater(current[active] || []) }));
  }

  function updateRow(index, field, value) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function move(index, delta) {
    setRows((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setStatus(null);
    setSaving(true);
    try {
      const body = await adminSend('PUT', '/api/admin/settings/website', { infoPages: { [active]: rows } });
      setPages(body.settings.website.infoPages);
      setStatus({ tone: 'ok', message: 'Changes saved successfully.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Info pages</p>
          <p className="mt-1 text-sm text-ink-soft">FAQ, Shipping &amp; Returns, and Terms shown on the storefront.</p>
        </div>
        <button type="button" className="btn-ink" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : `Save ${PAGES.find((page) => page.key === active)?.label}`}
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        {PAGES.map((page) => (
          <button
            key={page.key}
            type="button"
            className={`border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] ${active === page.key ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'}`}
            onClick={() => { setActive(page.key); setStatus(null); }}
          >
            {page.label}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-4">
        {rows.map((row, index) => (
          <div key={index} className="border border-line p-3">
            <input className="field" placeholder="Heading" value={row.heading} onChange={(e) => updateRow(index, 'heading', e.target.value)} />
            <textarea className="field mt-2" rows="3" placeholder="Body" value={row.body} onChange={(e) => updateRow(index, 'body', e.target.value)} />
            <div className="mt-2 flex gap-3 text-xs">
              <button type="button" className="border border-line px-3 py-1 hover:border-ink" onClick={() => move(index, -1)} disabled={index === 0}>↑ Up</button>
              <button type="button" className="border border-line px-3 py-1 hover:border-ink" onClick={() => move(index, 1)} disabled={index === rows.length - 1}>↓ Down</button>
              <button type="button" className="text-clay underline hover:text-accent" onClick={() => setRows((current) => current.filter((_, i) => i !== index))} disabled={rows.length <= 1}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ghost mt-3" onClick={() => setRows((current) => [...current, { heading: '', body: '' }])} disabled={rows.length >= 30}>
        Add section
      </button>
      {status?.message && (
        <p className={`mt-3 text-sm ${status.tone === 'error' ? 'text-accent-deep' : 'text-[#2f7d32]'}`} role="status">{status.message}</p>
      )}
    </section>
  );
}
