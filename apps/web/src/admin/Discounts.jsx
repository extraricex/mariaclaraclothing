import { useEffect, useState } from 'react';
import { adminJson, adminSend } from '../lib/adminApi.js';
import { formatPeso, pesoToCents } from '../lib/money.js';

const EMPTY_FORM = { code: '', type: 'percentage', value: '', endsAt: '', usageLimit: '', minimumPeso: '' };

export default function Discounts() {
  const [discounts, setDiscounts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState('');

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
      load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function valueLabel(discount) {
    return discount.type === 'percentage' ? `${discount.value}% off` : `${formatPeso(discount.value)} off`;
  }

  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Discounts</p>
      <h1 className="display mt-1 text-3xl">Promo codes</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Codes are validated server-side at checkout — expired, disabled, or over-limit codes are
        rejected even if someone tampers with the page.
      </p>
      {message && <p className="mt-3 text-sm text-accent-deep" role="status">{message}</p>}

      <form onSubmit={createDiscount} className="mt-6 grid gap-3 border border-line bg-paper p-5 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="eyebrow">Code</span>
          <input className="field mt-1 uppercase" required value={form.code} onChange={(e) => update('code', e.target.value)} placeholder="MARIA10" />
        </label>
        <label className="block">
          <span className="eyebrow">Type</span>
          <select className="field mt-1" value={form.type} onChange={(e) => update('type', e.target.value)}>
            <option value="percentage">Percentage off</option>
            <option value="fixed">Fixed amount off (₱)</option>
          </select>
        </label>
        <label className="block">
          <span className="eyebrow">{form.type === 'percentage' ? 'Percent (1–100)' : 'Amount (₱)'}</span>
          <input className="field mt-1" required inputMode="decimal" value={form.value} onChange={(e) => update('value', e.target.value)} placeholder={form.type === 'percentage' ? '10' : '100.00'} />
        </label>
        <label className="block">
          <span className="eyebrow">Expires (optional)</span>
          <input className="field mt-1" type="date" value={form.endsAt} onChange={(e) => update('endsAt', e.target.value)} />
        </label>
        <label className="block">
          <span className="eyebrow">Usage limit (optional)</span>
          <input className="field mt-1" type="number" min="1" value={form.usageLimit} onChange={(e) => update('usageLimit', e.target.value)} placeholder="Unlimited" />
        </label>
        <label className="block">
          <span className="eyebrow">Min. subtotal ₱ (optional)</span>
          <input className="field mt-1" inputMode="decimal" value={form.minimumPeso} onChange={(e) => update('minimumPeso', e.target.value)} placeholder="None" />
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          <button type="submit" className="btn-ink">Create promo code</button>
        </div>
      </form>

      <div className="mt-6 overflow-x-auto border border-line bg-paper">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-clay">
              <th className="p-3">Code</th>
              <th className="p-3">Discount</th>
              <th className="p-3">Usage</th>
              <th className="p-3">Min. subtotal</th>
              <th className="p-3">Expires</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {discounts.map((discount) => (
              <tr key={discount.code} className="border-b border-line/60">
                <td className="p-3 font-semibold">{discount.code}</td>
                <td className="p-3">{valueLabel(discount)}</td>
                <td className="p-3">{discount.usageCount}{discount.usageLimit !== null ? ` / ${discount.usageLimit}` : ''}</td>
                <td className="p-3">{discount.minimumSubtotalCents !== null ? formatPeso(discount.minimumSubtotalCents) : '—'}</td>
                <td className="p-3 text-xs text-clay">{discount.endsAt ? new Date(discount.endsAt).toLocaleDateString('en-PH') : 'Never'}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${discount.status === 'active' ? 'bg-[#2f7d32]/10 text-[#2f7d32]' : 'bg-line text-clay'}`}>
                    {discount.status}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <button type="button" className="text-xs text-accent underline" onClick={() => toggleStatus(discount)}>
                    {discount.status === 'active' ? 'Disable' : 'Enable'}
                  </button>
                  <button type="button" className="ml-3 text-xs text-clay underline hover:text-accent" onClick={() => remove(discount)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!discounts.length && (
              <tr><td colSpan="7" className="p-6 text-center text-sm text-clay">No promo codes yet. Create one above — try MARIA10 for your Meta ads.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
