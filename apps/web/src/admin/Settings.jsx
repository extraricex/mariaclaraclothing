import { useEffect, useState } from 'react';
import { adminJson, adminSend, setAdminToken } from '../lib/adminApi.js';

function pesoFromCents(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function centsFromPeso(value) {
  const peso = Number.parseFloat(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(peso) && peso >= 0 ? Math.round(peso * 100) : NaN;
}

function Status({ status }) {
  if (!status?.message) return null;
  return (
    <p className={`mt-3 text-sm ${status.tone === 'error' ? 'text-accent-deep' : 'text-[#2f7d32]'}`} role="status">
      {status.message}
    </p>
  );
}

function SectionCard({ title, hint, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border border-line bg-paper">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          <span className="block text-sm font-semibold uppercase tracking-[0.12em]">{title}</span>
          {hint && <span className="mt-1 block text-xs text-clay">{hint}</span>}
        </span>
        <span className={`text-clay transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-clay">
      {label}
      {children}
    </label>
  );
}

function GeneralCard({ initial }) {
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }
  function setSocial(field, value) {
    setForm((current) => ({ ...current, socialLinks: { ...current.socialLinks, [field]: value } }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      await adminSend('PUT', '/api/admin/settings/general', form);
      setStatus({ tone: 'ok', message: 'Changes saved successfully.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="General" hint="Store identity shown to customers." defaultOpen>
      <div className="mt-4 space-y-3">
        <Field label="Store name"><input className="field mt-1" value={form.storeName} onChange={(e) => set('storeName', e.target.value)} /></Field>
        <Field label="Contact email"><input className="field mt-1" type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} /></Field>
        <Field label="Contact number"><input className="field mt-1" value={form.contactNumber} onChange={(e) => set('contactNumber', e.target.value)} /></Field>
        <Field label="Store address"><textarea className="field mt-1" rows="2" value={form.storeAddress} onChange={(e) => set('storeAddress', e.target.value)} /></Field>
        <Field label="Facebook link"><input className="field mt-1" value={form.socialLinks.facebook} onChange={(e) => setSocial('facebook', e.target.value)} /></Field>
        <Field label="Instagram link"><input className="field mt-1" value={form.socialLinks.instagram} onChange={(e) => setSocial('instagram', e.target.value)} /></Field>
        <Field label="TikTok link"><input className="field mt-1" value={form.socialLinks.tiktok} onChange={(e) => setSocial('tiktok', e.target.value)} /></Field>
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save general settings'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}

function ShippingCard({ initial }) {
  const [regions, setRegions] = useState(initial.regions.map((region) => ({ ...region, feePeso: pesoFromCents(region.feeCents) })));
  const [freeShippingEnabled, setFreeShippingEnabled] = useState(initial.freeShippingEnabled);
  const [minimumItems, setMinimumItems] = useState(String(initial.freeShippingMinimumItems));
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function setRegion(id, field, value) {
    setRegions((current) => current.map((region) => (region.id === id ? { ...region, [field]: value } : region)));
  }

  async function save() {
    setStatus(null);
    const payloadRegions = [];
    for (const region of regions) {
      const feeCents = centsFromPeso(region.feePeso);
      if (!Number.isInteger(feeCents)) {
        setStatus({ tone: 'error', message: `Enter a valid peso fee for ${region.label}.` });
        return;
      }
      payloadRegions.push({ id: region.id, label: region.label, feeCents, deliveryEstimate: region.deliveryEstimate });
    }
    setSaving(true);
    try {
      await adminSend('PUT', '/api/admin/settings/shipping', {
        regions: payloadRegions,
        freeShippingEnabled,
        freeShippingMinimumItems: Number(minimumItems)
      });
      setStatus({ tone: 'ok', message: 'Changes saved successfully.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Shipping" hint="Fees and delivery estimates applied at checkout.">
      <div className="mt-4 space-y-4">
        {regions.map((region) => (
          <div key={region.id} className="border-b border-line/60 pb-4 last:border-0">
            <p className="text-sm font-semibold">{region.label}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Fee (₱)">
                <input className="field mt-1" inputMode="decimal" value={region.feePeso} onChange={(e) => setRegion(region.id, 'feePeso', e.target.value)} />
              </Field>
              <Field label="Delivery estimate">
                <input className="field mt-1" value={region.deliveryEstimate} onChange={(e) => setRegion(region.id, 'deliveryEstimate', e.target.value)} />
              </Field>
            </div>
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={freeShippingEnabled} onChange={(e) => setFreeShippingEnabled(e.target.checked)} />
          Offer free shipping at a minimum item count
        </label>
        {freeShippingEnabled && (
          <Field label="Free shipping minimum items">
            <input className="field mt-1 max-w-32" inputMode="numeric" value={minimumItems} onChange={(e) => setMinimumItems(e.target.value)} />
          </Field>
        )}
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save shipping settings'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}

function PaymentsCard({ initial }) {
  const [methods, setMethods] = useState(initial.methods);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function setMethod(id, field, value) {
    setMethods((current) => current.map((method) => (method.id === id ? { ...method, [field]: value } : method)));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      await adminSend('PUT', '/api/admin/settings/payments', { methods });
      setStatus({ tone: 'ok', message: 'Changes saved successfully.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Payments" hint="Enabled methods appear at checkout. Cash on Delivery is always on.">
      <div className="mt-4 space-y-4">
        {methods.map((method) => (
          <div key={method.id} className="border-b border-line/60 pb-4 last:border-0">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={method.enabled}
                disabled={method.id === 'cash_on_delivery'}
                onChange={(e) => setMethod(method.id, 'enabled', e.target.checked)}
              />
              {method.label}
            </label>
            <Field label="Customer instructions">
              <textarea
                className="field mt-1"
                rows="2"
                placeholder={method.id === 'gcash' ? 'e.g. Send payment to GCash 0917 000 0000 (Maria Clara).' : ''}
                value={method.instructions}
                onChange={(e) => setMethod(method.id, 'instructions', e.target.value)}
              />
            </Field>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save payment settings'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}

function SecurityCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState(false);

  async function changePassword() {
    setStatus(null);
    if (newPassword !== confirmPassword) {
      setStatus({ tone: 'error', message: 'New password and confirmation do not match.' });
      return;
    }
    setPending(true);
    try {
      const body = await adminSend('POST', '/api/admin/settings/security/password', { currentPassword, newPassword });
      setAdminToken(body.token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStatus({ tone: 'ok', message: 'Password changed. Other sessions were signed out.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setPending(false);
    }
  }

  async function rotateToken() {
    setStatus(null);
    setPending(true);
    try {
      const body = await adminSend('POST', '/api/admin/settings/security/rotate-token', {});
      setAdminToken(body.token);
      setStatus({ tone: 'ok', message: 'Admin token rotated. Other sessions were signed out.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <SectionCard title="Security" hint="Single-admin account. Changing the password signs out every other session.">
      <div className="mt-4 space-y-3">
        <Field label="Current password"><input className="field mt-1" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New password (min. 8 characters)"><input className="field mt-1" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Confirm new password"><input className="field mt-1" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" /></Field>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn-ink" disabled={pending} onClick={changePassword}>
          {pending ? 'Working…' : 'Change password'}
        </button>
        <button type="button" className="btn-ghost" disabled={pending} onClick={rotateToken}>
          Rotate admin token
        </button>
      </div>
      <Status status={status} />
    </SectionCard>
  );
}

function SeoCard({ initial }) {
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      await adminSend('PUT', '/api/admin/settings/website', { seo: form });
      setStatus({ tone: 'ok', message: 'Changes saved successfully.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="SEO" hint="Browser title, search description, and social share image.">
      <div className="mt-4 space-y-3">
        <Field label="Site title"><input className="field mt-1" value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Meta description"><textarea className="field mt-1" rows="3" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Share image URL"><input className="field mt-1" placeholder="https://… or /uploads/…" value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} /></Field>
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save SEO settings'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}

function MaintenanceCard({ initial }) {
  const [enabled, setEnabled] = useState(initial);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const body = await adminSend('PUT', '/api/admin/settings/website', { maintenanceMode: enabled });
      setEnabled(body.settings.website.maintenanceMode);
      setStatus({ tone: 'ok', message: body.settings.website.maintenanceMode ? 'Maintenance mode is ON — the storefront is hidden.' : 'Maintenance mode is off. The storefront is live.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Maintenance" hint="Take the storefront offline while you make changes.">
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>
          <span className="font-semibold">Enable maintenance mode</span>
          <span className="mt-1 block text-xs text-clay">
            Customers see a "be right back" screen and checkout is disabled. The admin dashboard stays available, so you can turn this off any time.
          </span>
        </span>
      </label>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save maintenance setting'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminJson('/api/admin/settings')
      .then((body) => setSettings(body.settings))
      .catch((loadError) => setError(loadError.message));
  }, []);

  if (error) return <p className="text-sm text-accent-deep">{error}</p>;
  if (!settings) return <p className="text-sm text-clay">Loading settings…</p>;

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Settings</p>
      <h1 className="display mt-1 text-3xl">Store settings</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Saved changes apply to the customer website immediately.
      </p>
      <div className="mt-8 space-y-4">
        <GeneralCard initial={settings.general} />
        <ShippingCard initial={settings.shipping} />
        <PaymentsCard initial={settings.payments} />
        <SeoCard initial={settings.website.seo} />
        <MaintenanceCard initial={settings.website.maintenanceMode} />
        <SecurityCard />
      </div>
    </div>
  );
}
