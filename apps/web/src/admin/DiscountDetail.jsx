import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminJson, adminSend } from '../lib/adminApi.js';
import { formatPeso, pesoToCents } from '../lib/money.js';

function centsToPeso(cents) {
  return cents === null || cents === undefined || cents === '' ? '' : (Number(cents || 0) / 100).toFixed(2);
}

function dateInputValue(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function normalizedRules(discount) {
  const rules = Array.isArray(discount.rules) && discount.rules.length
    ? discount.rules
    : [{ minimumQuantity: 2, discountType: 'fixed', discountValue: 0, discountValueCents: 0, freeShipping: true }];
  return rules.map((rule) => ({
    minimumQuantity: String(rule.minimumQuantity || 2),
    discountType: rule.discountType === 'percentage' ? 'percentage' : 'fixed',
    discountValue: String(rule.discountValue || ''),
    discountValueCents: centsToPeso(rule.discountValueCents || 0),
    freeShipping: Boolean(rule.freeShipping)
  }));
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

function formFromDiscount(discount) {
  return {
    code: discount.code || '',
    name: discount.name || discount.code || '',
    description: discount.description || '',
    method: discount.method || 'code',
    type: discount.type || 'percentage',
    value: discount.type === 'fixed' || discount.type === 'bundle' ? centsToPeso(discount.value) : String(discount.value || ''),
    minimumPeso: centsToPeso(discount.minimumSubtotalCents),
    minimumQuantity: discount.minimumQuantity === null || discount.minimumQuantity === undefined ? '' : String(discount.minimumQuantity),
    usageLimit: discount.usageLimit === null || discount.usageLimit === undefined ? '' : String(discount.usageLimit),
    priority: discount.priority === null || discount.priority === undefined ? '0' : String(discount.priority),
    startsAt: dateInputValue(discount.startsAt),
    endsAt: dateInputValue(discount.endsAt),
    status: discount.status || 'active',
    bannerText: discount.bannerText || '',
    terms: discount.terms || '',
    rules: normalizedRules(discount)
  };
}

function valueLabel(discount) {
  if (discount.type === 'percentage') return `${discount.value}% off`;
  if (discount.type === 'fixed') return `${formatPeso(discount.value)} off`;
  if (discount.type === 'free_shipping') return 'Free shipping';
  if (discount.type === 'buy_more_save_more') return 'Buy More Save More';
  if (discount.type === 'bundle') return `Bundle discount ${discount.value ? formatPeso(discount.value) : ''}`.trim();
  return discount.type;
}

function typeLabel(type) {
  const labels = {
    percentage: 'Percentage discount',
    fixed: 'Fixed amount discount',
    buy_more_save_more: 'Buy More Save More',
    free_shipping: 'Free shipping',
    bundle: 'Bundle discount'
  };
  return labels[type] || type;
}

function valueForPayload(form) {
  if (form.type === 'fixed' || form.type === 'bundle') return pesoToCents(form.value);
  if (form.type === 'free_shipping' || form.type === 'buy_more_save_more') return 0;
  return Math.round(Number(form.value) || 0);
}

function rulesForPayload(form) {
  if (form.type !== 'buy_more_save_more') return [];
  return form.rules.map((rule) => ({
    minimumQuantity: Number(rule.minimumQuantity || 1),
    discountType: rule.discountType,
    discountValue: rule.discountType === 'percentage' ? Math.round(Number(rule.discountValue) || 0) : 0,
    discountValueCents: rule.discountType === 'fixed' ? pesoToCents(rule.discountValueCents) : 0,
    freeShipping: Boolean(rule.freeShipping)
  }));
}

export default function DiscountDetail() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [discount, setDiscount] = useState(null);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    adminJson('/api/admin/discounts')
      .then((body) => {
        const found = (body.discounts || []).find((item) => item.code === String(code || '').toUpperCase());
        if (!found) {
          setMessage('Discount not found.');
          return;
        }
        setDiscount(found);
        setForm(formFromDiscount(found));
      })
      .catch((error) => setMessage(error.message));
  }, [code]);

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function updateRule(index, field, value) {
    setForm((previous) => ({
      ...previous,
      rules: previous.rules.map((rule, i) => (i === index ? { ...rule, [field]: value } : rule))
    }));
  }

  function addRule() {
    setForm((previous) => ({
      ...previous,
      rules: [...previous.rules, { minimumQuantity: '3', discountType: 'fixed', discountValue: '', discountValueCents: '', freeShipping: false }]
    }));
  }

  function removeRule(index) {
    setForm((previous) => ({
      ...previous,
      rules: previous.rules.filter((_, i) => i !== index)
    }));
  }

  const payload = useMemo(() => {
    if (!form) return null;
    return {
      name: form.name,
      description: form.description,
      method: form.method,
      type: form.type,
      value: valueForPayload(form),
      minimumSubtotalCents: form.minimumPeso === '' ? null : pesoToCents(form.minimumPeso),
      minimumQuantity: form.minimumQuantity === '' ? null : Number(form.minimumQuantity),
      usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
      priority: Number(form.priority || 0),
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      status: form.status,
      bannerText: form.bannerText,
      terms: form.terms,
      rules: form.rules && rulesForPayload(form)
    };
  }, [form]);

  async function save() {
    setMessage('');
    try {
      if (form.code.trim().toUpperCase() !== discount.code) {
        await adminSend('POST', '/api/admin/discounts', { ...payload, code: form.code });
        await adminJson(`/api/admin/discounts/${encodeURIComponent(discount.code)}`, { method: 'DELETE' });
        setMessage('Discount code replaced.');
        navigate(`/admin/discounts/${encodeURIComponent(form.code.trim().toUpperCase())}`, { replace: true });
        return;
      }
      const body = await adminSend('PATCH', `/api/admin/discounts/${encodeURIComponent(code)}`, payload);
      setDiscount(body.discount);
      setForm(formFromDiscount(body.discount));
      setMessage('Discount saved.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function duplicateDiscount() {
    setMessage('');
    const copyCode = `${discount.code}COPY`;
    try {
      const body = await adminSend('POST', '/api/admin/discounts', { ...payload, code: copyCode });
      navigate(`/admin/discounts/${encodeURIComponent(body.discount.code)}`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function toggleStatus() {
    const nextStatus = form.status === 'active' ? 'disabled' : 'active';
    update('status', nextStatus);
    try {
      const body = await adminSend('PATCH', `/api/admin/discounts/${encodeURIComponent(code)}`, { ...payload, status: nextStatus });
      setDiscount(body.discount);
      setForm(formFromDiscount(body.discount));
      setMessage(nextStatus === 'active' ? 'Discount enabled.' : 'Discount disabled.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteDiscount() {
    if (!window.confirm(`Delete code ${discount.code}? Past orders keep their discount.`)) return;
    try {
      await adminJson(`/api/admin/discounts/${encodeURIComponent(discount.code)}`, { method: 'DELETE' });
      navigate('/admin/discounts');
    } catch (error) {
      setMessage(error.message);
    }
  }

  if (!discount || !form) {
    return <p className="text-sm text-clay">{message || 'Loading discount...'}</p>;
  }

  const status = discountStatus({ ...discount, status: form.status, endsAt: payload.endsAt });

  return (
    <div className="discount-detail-shell mx-auto w-full max-w-[1280px]">
      <Link to="/admin/discounts" className="text-xs font-semibold uppercase tracking-[0.12em] text-clay hover:text-accent">Discounts</Link>
      <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="display text-2xl sm:text-3xl">{form.code || discount.code}</h1>
            <span className={`inline-flex rounded-[var(--radius-admin)] border px-2.5 py-1 text-xs font-bold uppercase ${statusBadgeClass(status)}`}>{status}</span>
          </div>
          <p className="mt-2 text-sm text-clay">Promo editor for automatic promos and checkout-validated discount codes.</p>
        </div>
        <div className="relative flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={duplicateDiscount}>Duplicate</button>
          <button type="button" className="btn-secondary" onClick={toggleStatus}>{form.status === 'active' ? 'Disable' : 'Enable'}</button>
          <button type="button" className="btn-secondary" onClick={() => setShowActions((value) => !value)}>More actions</button>
          {showActions && (
            <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-[var(--radius-admin)] border border-line bg-paper p-2 text-sm shadow-lg">
              <button type="button" className="block w-full rounded-[var(--radius-admin)] px-3 py-2 text-left text-accent-deep hover:bg-cream" onClick={deleteDiscount}>Delete discount</button>
              <Link className="block rounded-[var(--radius-admin)] px-3 py-2 text-left hover:bg-cream" to="/admin/discounts">View all discounts</Link>
            </div>
          )}
          <button type="button" className="btn-ink" onClick={save}>Save</button>
        </div>
      </div>
      {message && <p className="mt-3 text-sm text-accent-deep" role="status">{message}</p>}

      <div className="discount-detail-grid mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="space-y-5">
          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Promo identity</h2>
            <label className="mt-4 block">
              <span className="eyebrow">Promo name</span>
              <input className="field mt-1" value={form.name} onChange={(event) => update('name', event.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Promo description</span>
              <textarea className="field mt-1" rows="2" value={form.description} onChange={(event) => update('description', event.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Discount code</span>
              <input className="field mt-1 uppercase" value={form.code} onChange={(event) => update('code', event.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Promo method</span>
              <select className="field mt-1" value={form.method} onChange={(event) => update('method', event.target.value)}>
                <option value="automatic">Automatic promo</option>
                <option value="code">Discount code</option>
              </select>
            </label>
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Discount value</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="eyebrow">Type</span>
                <select className="field mt-1" value={form.type} onChange={(event) => update('type', event.target.value)}>
                  <option value="percentage">Percentage off</option>
                  <option value="fixed">Fixed amount</option>
                  <option value="buy_more_save_more">Buy More Save More</option>
                  <option value="free_shipping">Free shipping</option>
                  <option value="bundle">Bundle discount</option>
                </select>
              </label>
              {form.type !== 'free_shipping' && form.type !== 'buy_more_save_more' && (
              <label className="block">
                <span className="eyebrow">{form.type === 'percentage' ? 'Percent' : 'Amount'}</span>
                <input className="field mt-1" inputMode="decimal" value={form.value} onChange={(event) => update('value', event.target.value)} />
              </label>
              )}
            </div>
            {form.type === 'buy_more_save_more' && (
              <div className="mt-5 rounded-[var(--radius-admin)] border border-line bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Buy More Save More tiers</h3>
                  <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={addRule}>Add tier</button>
                </div>
                <div className="mt-3 space-y-3">
                  {form.rules.map((rule, index) => (
                    <div key={index} className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="eyebrow">Minimum quantity</span>
                        <input className="field mt-1" type="number" min="1" value={rule.minimumQuantity} onChange={(event) => updateRule(index, 'minimumQuantity', event.target.value)} />
                      </label>
                      <label className="block">
                        <span className="eyebrow">Discount type</span>
                        <select className="field mt-1" value={rule.discountType} onChange={(event) => updateRule(index, 'discountType', event.target.value)}>
                          <option value="fixed">Fixed amount</option>
                          <option value="percentage">Percentage</option>
                        </select>
                      </label>
                      {rule.discountType === 'percentage' ? (
                        <label className="block">
                          <span className="eyebrow">Percent</span>
                          <input className="field mt-1" inputMode="numeric" value={rule.discountValue} onChange={(event) => updateRule(index, 'discountValue', event.target.value)} />
                        </label>
                      ) : (
                        <label className="block">
                          <span className="eyebrow">Amount</span>
                          <input className="field mt-1" inputMode="decimal" value={rule.discountValueCents} onChange={(event) => updateRule(index, 'discountValueCents', event.target.value)} />
                        </label>
                      )}
                      <div className="flex items-end justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={rule.freeShipping} onChange={(event) => updateRule(index, 'freeShipping', event.target.checked)} />
                          Free shipping
                        </label>
                        {form.rules.length > 1 && <button type="button" className="text-xs text-clay underline hover:text-accent" onClick={() => removeRule(index)}>Remove</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Eligibility</h2>
            <label className="mt-4 block">
              <span className="eyebrow">Minimum quantity</span>
              <input className="field mt-1" type="number" min="1" value={form.minimumQuantity} placeholder="No minimum" onChange={(event) => update('minimumQuantity', event.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Minimum purchase</span>
              <input className="field mt-1" inputMode="decimal" value={form.minimumPeso} placeholder="No minimum" onChange={(event) => update('minimumPeso', event.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Customers</span>
              <select className="field mt-1" value="all_customers" disabled>
                <option value="all_customers">All customers</option>
              </select>
            </label>
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Maximum discount uses</h2>
            <label className="mt-4 block">
              <span className="eyebrow">Usage limit</span>
              <input className="field mt-1" type="number" min="1" value={form.usageLimit} placeholder="No limit" onChange={(event) => update('usageLimit', event.target.value)} />
            </label>
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Active dates</h2>
            <label className="mt-4 block">
              <span className="eyebrow">Start date</span>
              <input className="field mt-1" type="date" value={form.startsAt} onChange={(event) => update('startsAt', event.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">End date</span>
              <input className="field mt-1" type="date" value={form.endsAt} onChange={(event) => update('endsAt', event.target.value)} />
            </label>
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Promo banner</h2>
            <label className="mt-4 block">
              <span className="eyebrow">Banner text</span>
              <input className="field mt-1" value={form.bannerText} onChange={(event) => update('bannerText', event.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Notification priority</span>
              <input className="field mt-1" type="number" min="0" value={form.priority} onChange={(event) => update('priority', event.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Terms or notes</span>
              <textarea className="field mt-1" rows="3" value={form.terms} onChange={(event) => update('terms', event.target.value)} />
            </label>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Summary</h2>
                <p className="mt-1 text-sm font-semibold">{form.code || discount.code}</p>
              </div>
              <span className={`inline-flex rounded-[var(--radius-admin)] border px-2 py-1 text-[11px] font-bold uppercase ${statusBadgeClass(status)}`}>{status}</span>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div><dt className="eyebrow">Method</dt><dd>{form.method === 'automatic' ? 'Automatic promo' : 'Discount code'}</dd></div>
              <div><dt className="eyebrow">Type</dt><dd>{typeLabel(form.type)}</dd></div>
              <div><dt className="eyebrow">Details</dt><dd>{valueLabel({ type: form.type, value: payload.value })}</dd></div>
              <div><dt className="eyebrow">Notification priority</dt><dd>{form.priority || 0}</dd></div>
              <div><dt className="eyebrow">Minimum purchase</dt><dd>{form.minimumPeso ? formatPeso(pesoToCents(form.minimumPeso)) : 'No minimum'}</dd></div>
              <div><dt className="eyebrow">Usage</dt><dd>{discount.usageCount || 0}{form.usageLimit ? ` / ${form.usageLimit}` : ''} used</dd></div>
            </dl>
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Performance</h2>
            <p className="mt-3 text-sm text-ink-soft">{discount.usageCount || 0} used</p>
            <p className="mt-2 text-sm text-clay">Sales by discount report is a future analytics item.</p>
          </section>

          <section className="rounded-[var(--radius-admin)] border border-line bg-paper p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Tags</h2>
            <button type="button" className="btn-secondary mt-3" disabled>Add tags</button>
          </section>
        </div>
      </div>
    </div>
  );
}
