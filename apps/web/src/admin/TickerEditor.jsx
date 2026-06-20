import { useState } from 'react';
import { adminSend } from '../lib/adminApi.js';

export default function TickerEditor({ initial }) {
  const [items, setItems] = useState(initial);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function update(index, value) {
    setItems((current) => current.map((item, i) => (i === index ? value : item)));
  }

  function move(index, delta) {
    setItems((current) => {
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
      const body = await adminSend('PUT', '/api/admin/settings/website', { ticker: items });
      setItems(body.settings.website.ticker);
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
          <p className="eyebrow">Announcement ticker</p>
          <p className="mt-1 text-sm text-ink-soft">Scrolling messages at the very top of the storefront.</p>
        </div>
        <button type="button" className="btn-ink" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save ticker'}
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <input className="field flex-1" value={item} onChange={(e) => update(index, e.target.value)} />
            <button type="button" className="border border-line px-2 py-1 text-xs hover:border-ink" onClick={() => move(index, -1)} disabled={index === 0}>↑</button>
            <button type="button" className="border border-line px-2 py-1 text-xs hover:border-ink" onClick={() => move(index, 1)} disabled={index === items.length - 1}>↓</button>
            <button type="button" className="text-xs text-clay underline hover:text-accent" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} disabled={items.length <= 1}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ghost mt-3" onClick={() => setItems((current) => [...current, ''])} disabled={items.length >= 8}>
        Add item
      </button>
      {status?.message && (
        <p className={`mt-3 text-sm ${status.tone === 'error' ? 'text-accent-deep' : 'text-[#2f7d32]'}`} role="status">{status.message}</p>
      )}
    </section>
  );
}
