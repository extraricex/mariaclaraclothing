import { useState } from 'react';
import { adminSend } from '../lib/adminApi.js';

const FIELD_LABELS = {
  eyebrow: 'Small banner text',
  title: 'Main banner title',
  highlight: 'Highlighted banner text',
  subtitle: 'Banner subtitle',
  primaryButtonText: 'Primary Button text',
  primaryButtonLink: 'Primary Button link',
  secondaryButtonText: 'Secondary Button text',
  secondaryButtonLink: 'Secondary Button link'
};

export default function HeroTextEditor({ initial }) {
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setStatus(null);
    setSaving(true);
    try {
      const body = await adminSend('PUT', '/api/admin/settings/website', { hero: form });
      setForm(body.settings.website.hero);
      setStatus({ tone: 'ok', message: 'Homepage banner text saved.' });
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
          <p className="eyebrow">Homepage hero text</p>
          <p className="mt-1 text-sm text-ink-soft">Edit the banner copy and call-to-action buttons shown on the storefront homepage.</p>
        </div>
        <button type="button" className="btn-ink" disabled={saving} onClick={save}>
          {saving ? 'Saving...' : 'Save hero text'}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {['eyebrow', 'title', 'highlight'].map((field) => (
          <label key={field} className="block">
            <span className="eyebrow">{FIELD_LABELS[field]}</span>
            <input className="field mt-1" value={form[field] || ''} onChange={(event) => update(field, event.target.value)} />
          </label>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="eyebrow">{FIELD_LABELS.subtitle}</span>
        <textarea className="field mt-1" rows="3" value={form.subtitle || ''} onChange={(event) => update('subtitle', event.target.value)} />
      </label>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="border border-line p-3">
          <p className="eyebrow">Primary banner button</p>
          <label className="mt-3 block">
            <span className="eyebrow">Button text</span>
            <input className="field mt-1" value={form.primaryButtonText || ''} onChange={(event) => update('primaryButtonText', event.target.value)} />
          </label>
          <label className="mt-3 block">
            <span className="eyebrow">Button link</span>
            <input className="field mt-1" value={form.primaryButtonLink || ''} onChange={(event) => update('primaryButtonLink', event.target.value)} />
          </label>
        </div>

        <div className="border border-line p-3">
          <p className="eyebrow">Secondary banner button</p>
          <label className="mt-3 block">
            <span className="eyebrow">Button text</span>
            <input className="field mt-1" value={form.secondaryButtonText || ''} onChange={(event) => update('secondaryButtonText', event.target.value)} />
          </label>
          <label className="mt-3 block">
            <span className="eyebrow">Button link</span>
            <input className="field mt-1" value={form.secondaryButtonLink || ''} onChange={(event) => update('secondaryButtonLink', event.target.value)} />
          </label>
        </div>
      </div>

      {status?.message && (
        <p className={`mt-3 text-sm ${status.tone === 'error' ? 'text-accent-deep' : 'text-[#2f7d32]'}`} role="status">{status.message}</p>
      )}
    </section>
  );
}
