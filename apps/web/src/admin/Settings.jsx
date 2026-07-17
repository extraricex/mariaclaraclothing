import { useEffect, useState } from 'react';
import { adminJson, adminSend } from '../lib/adminApi.js';

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
        <Field label="Messenger chat link">
          <input
            className="field mt-1"
            type="url"
            placeholder="https://m.me/your-page"
            value={form.messengerUrl || ''}
            onChange={(e) => set('messengerUrl', e.target.value)}
          />
        </Field>
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

function PaymentsCard({ initial, providers = {} }) {
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
    <SectionCard title="Payments" hint="Enabled and configured methods appear at checkout.">
      <p className="mt-3 text-xs text-clay">PayMongo: {providers.paymongo?.configured ? `${providers.paymongo.mode} mode configured` : 'not configured'}{providers.paymongo?.publicKey ? ` · Public key ${providers.paymongo.publicKey}` : ''}. Secret keys are never displayed.</p>
      <div className="mt-4 space-y-4">
        {methods.map((method) => (
          <div key={method.id} className="border-b border-line/60 pb-4 last:border-0">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={method.enabled}
                disabled={method.id === 'cash_on_delivery' || (method.id === 'paymongo' && !providers.paymongo?.configured)}
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

function OrderNotificationsCard({ initial, provider = {} }) {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - (30 * 86_400_000)).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    enabled: initial?.enabled !== false,
    primaryRecipientEmail: initial?.primaryRecipientEmail || '',
    additionalRecipientEmails: Array.isArray(initial?.additionalRecipientEmails)
      ? initial.additionalRecipientEmails.join(', ')
      : '',
    sendPaymongoPaymentConfirmation: Boolean(initial?.sendPaymongoPaymentConfirmation),
    maximumRetryAttempts: Number(initial?.maximumRetryAttempts || 8)
  });
  const [status, setStatus] = useState(null);
  const [working, setWorking] = useState('');
  const [range, setRange] = useState({ from: thirtyDaysAgo, to: today });
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [confirmed, setConfirmed] = useState(false);

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setWorking('save');
    setStatus(null);
    try {
      const body = await adminSend('PUT', '/api/admin/settings/orderNotifications', {
        ...form,
        additionalRecipientEmails: form.additionalRecipientEmails
          .split(',').map((email) => email.trim()).filter(Boolean),
        maximumRetryAttempts: Number(form.maximumRetryAttempts)
      });
      const saved = body.settings.orderNotifications;
      setForm({
        ...saved,
        additionalRecipientEmails: (saved.additionalRecipientEmails || []).join(', ')
      });
      setStatus({ tone: 'ok', message: 'Order notification settings saved.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setWorking('');
    }
  }

  async function sendTest() {
    setWorking('test');
    setStatus(null);
    try {
      const body = await adminSend('POST', '/api/admin/order-notifications/test', {});
      setStatus({ tone: 'ok', message: `Test email accepted for ${body.test.recipient}.` });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setWorking('');
    }
  }

  async function previewBackfill() {
    setWorking('preview');
    setStatus(null);
    setConfirmed(false);
    try {
      const body = await adminSend('POST', '/api/admin/order-notifications/backfill/preview', range);
      setPreview(body.preview);
      setSelected(new Set((body.preview.records || []).map((record) => record.orderNumber)));
      setStatus({
        tone: 'ok',
        message: `Checked ${body.preview.ordersChecked} real orders; found ${body.preview.records.length} missing or failed notifications.`
      });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setWorking('');
    }
  }

  async function queueBackfill() {
    if (!confirmed || !selected.size) return;
    setWorking('backfill');
    setStatus(null);
    try {
      const body = await adminSend('POST', '/api/admin/order-notifications/backfill', {
        ...range,
        confirm: true,
        orderNumbers: [...selected]
      });
      const queuedMessage = `${body.result.queued} delayed notifications queued; ${body.result.skipped} skipped.`;
      setConfirmed(false);
      await previewBackfill();
      setStatus({ tone: 'ok', message: queuedMessage });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setWorking('');
    }
  }

  function toggle(orderNumber) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(orderNumber)) next.delete(orderNumber); else next.add(orderNumber);
      return next;
    });
  }

  return (
    <SectionCard title="Order notifications" hint="Durable New Order email delivery, retries, and missed-order backfill.">
      <div className="mt-4 rounded-xl border border-line bg-paper/60 p-3 text-xs text-clay">
        SMTP service: <strong>{provider.smtpConfigured ? 'Configured' : 'Not configured'}</strong>. Secrets are never displayed.
      </div>
      <div className="mt-4 space-y-3">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={form.enabled} onChange={(event) => set('enabled', event.target.checked)} />
          Enable New Order emails
        </label>
        <Field label="Primary recipient email">
          <input className="field mt-1" type="email" value={form.primaryRecipientEmail} onChange={(event) => set('primaryRecipientEmail', event.target.value)} />
        </Field>
        <Field label="Additional recipients (comma-separated)">
          <input className="field mt-1" type="text" value={form.additionalRecipientEmails} onChange={(event) => set('additionalRecipientEmails', event.target.value)} />
        </Field>
        <Field label="Maximum retry attempts">
          <input className="field mt-1 max-w-32" type="number" min="1" max="20" value={form.maximumRetryAttempts} onChange={(event) => set('maximumRetryAttempts', event.target.value)} />
        </Field>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={form.sendPaymongoPaymentConfirmation} onChange={(event) => set('sendPaymongoPaymentConfirmation', event.target.checked)} />
          Send a separate PayMongo Payment Confirmed email
        </label>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn-ink" disabled={Boolean(working)} onClick={save}>{working === 'save' ? 'Saving…' : 'Save notification settings'}</button>
        <button type="button" className="btn-ghost" disabled={Boolean(working) || !provider.smtpConfigured} onClick={sendTest}>{working === 'test' ? 'Sending…' : 'Send test email'}</button>
      </div>

      <div className="mt-7 border-t border-line pt-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.1em]">Missed email audit</h3>
        <p className="mt-1 text-xs text-clay">Preview is read-only. Historical emails are never queued without selecting orders and confirming below.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Field label="From"><input className="field mt-1" type="date" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} /></Field>
          <Field label="To"><input className="field mt-1" type="date" value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} /></Field>
          <button type="button" className="btn-ghost self-end" disabled={Boolean(working)} onClick={previewBackfill}>{working === 'preview' ? 'Checking…' : 'Preview missed emails'}</button>
        </div>
        {preview && (
          <div className="mt-4 space-y-2">
            {(preview.records || []).map((record) => (
              <label key={record.orderNumber} className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm">
                <input type="checkbox" checked={selected.has(record.orderNumber)} onChange={() => toggle(record.orderNumber)} />
                <span>
                  <strong>{record.orderNumber}</strong> · {record.reason === 'failed_notification' ? 'Failed' : 'No notification record'}
                  <span className="mt-1 block text-xs text-clay">{new Date(record.placedAt).toLocaleString('en-PH')} · ₱{(Number(record.totalCents || 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  {record.lastError && <span className="mt-1 block text-xs text-accent-deep">{record.lastError}</span>}
                </span>
              </label>
            ))}
            {!preview.records?.length && <p className="text-sm text-clay">No missing or terminally failed New Order notifications were found.</p>}
            {preview.records?.length > 0 && (
              <>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                  I confirm these are real orders and delayed New Order emails should be queued.
                </label>
                <button type="button" className="btn-ink" disabled={Boolean(working) || !confirmed || !selected.size} onClick={queueBackfill}>
                  {working === 'backfill' ? 'Queueing…' : `Queue ${selected.size} delayed email${selected.size === 1 ? '' : 's'}`}
                </button>
              </>
            )}
          </div>
        )}
      </div>
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
      await adminSend('POST', '/api/admin/settings/security/password', { currentPassword, newPassword });
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
      await adminSend('POST', '/api/admin/settings/security/rotate-token', {});
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

function InventoryCard({ initial }) {
  const [threshold, setThreshold] = useState(String(initial.lowStockThreshold));
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const body = await adminSend('PUT', '/api/admin/settings/inventory', { lowStockThreshold: Number(threshold) });
      setThreshold(String(body.settings.inventory.lowStockThreshold));
      setStatus({ tone: 'ok', message: 'Changes saved successfully.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Inventory" hint="Stock thresholds used across the store.">
      <div className="mt-4">
        <Field label="Low stock threshold">
          <input className="field mt-1 max-w-32" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </Field>
        <p className="mt-2 text-xs text-clay">
          Products at or below this stock count show "Limited pieces" on the storefront and count as low stock in the admin.
        </p>
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save inventory settings'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}

function AuthenticationCard({ initial }) {
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const body = await adminSend('PUT', '/api/admin/settings/authentication', form);
      setForm(body.settings.authentication);
      setStatus({ tone: 'ok', message: 'Customer login settings saved.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Customer login" hint="Control configured Google and Facebook sign-in options.">
      <div className="mt-4 space-y-3">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={Boolean(form.googleEnabled)} onChange={(event) => setForm((current) => ({ ...current, googleEnabled: event.target.checked }))} />
          Enable Google login
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={Boolean(form.facebookEnabled)} onChange={(event) => setForm((current) => ({ ...current, facebookEnabled: event.target.checked }))} />
          Enable Facebook login
        </label>
        <p className="text-xs text-clay">A login option appears to customers only after its server credentials are configured.</p>
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save customer login settings'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}

function MarketingCard({ initial, provider = {} }) {
  const [form, setForm] = useState(initial.metaPixel);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const browserPurchaseEnabled = provider.browserPurchaseConfigured === undefined
    ? Boolean(provider.browserPurchaseEnabled)
    : Boolean(provider.browserPurchaseConfigured && form.enabled);
  const purchaseAuthority = {
    browser_and_server: 'Browser Pixel + server CAPI',
    server_capi: 'Server CAPI only',
    disabled: 'Disabled'
  }[browserPurchaseEnabled ? 'browser_and_server' : provider.conversionsApiEnabled ? 'server_capi' : provider.purchaseAuthority]
    || (browserPurchaseEnabled ? 'Browser Pixel + server CAPI' : 'Server CAPI only');

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const body = await adminSend('PUT', '/api/admin/settings/marketing', { metaPixel: form });
      setForm(body.settings.marketing.metaPixel);
      setStatus({ tone: 'ok', message: 'Meta Pixel settings saved.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Meta Pixel" hint="Customer storefront advertising and ecommerce event tracking.">
      <div className="mt-4 space-y-3">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={Boolean(form.enabled)} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />
          Enable Meta Pixel
        </label>
        <Field label="Meta Pixel ID">
          <input className="field mt-1" inputMode="numeric" value={form.pixelId || ''} disabled={Boolean(provider.pixelIdLocked)} onChange={(event) => setForm((current) => ({ ...current, pixelId: event.target.value.replace(/\D/g, '') }))} />
        </Field>
        {provider.pixelIdLocked && <p className="text-xs text-clay">Locked to the same dataset used by the server Conversions API so Purchase events can deduplicate.</p>}
        {provider.conversionsApiEnabled && (
          <div className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-3 text-xs leading-5 text-[var(--admin-muted)]">
            <p><strong className="text-[var(--admin-text)]">Purchase authority:</strong> {purchaseAuthority}</p>
            <p><strong className="text-[var(--admin-text)]">Meta Test Events code:</strong> {provider.testEventCodeActive ? 'Active — production Ads reporting is intentionally bypassed' : 'Off'}</p>
            {!browserPurchaseEnabled && <p className="mt-1">Browser Purchase remains disabled until Meta Test Events proves account-side rules are removed and browser/server IDs deduplicate.</p>}
          </div>
        )}
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={Boolean(form.requireConsent)} onChange={(event) => setForm((current) => ({ ...current, requireConsent: event.target.checked }))} />
          <span>
            <span className="font-semibold">Require consent before Meta Pixel events</span>
            <span className="mt-1 block text-xs text-clay">Enable this if your privacy requirements must block tracking until the customer opts in.</span>
          </span>
        </label>
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save Meta Pixel settings'}
      </button>
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

function SizeChartCard({ initial }) {
  const [form, setForm] = useState(initial || { imageUrl: '', altText: '' });
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const body = await adminSend('PUT', '/api/admin/settings/website', { sizeChart: form });
      setForm(body.settings.website.sizeChart);
      setStatus({ tone: 'ok', message: 'Size chart settings saved.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Size chart" hint="Global sizing image used on product pages and the size chart page.">
      <div className="mt-4 space-y-3">
        <Field label="Size chart image URL">
          <input
            className="field mt-1"
            placeholder="https://… or /uploads/size-chart.jpg"
            value={form.imageUrl || ''}
            onChange={(e) => set('imageUrl', e.target.value)}
          />
        </Field>
        <Field label="Image alt text">
          <input className="field mt-1" value={form.altText || ''} onChange={(e) => set('altText', e.target.value)} />
        </Field>
        {form.imageUrl && (
          <img src={form.imageUrl} alt={form.altText || 'Size chart preview'} className="max-h-80 w-full border border-line bg-white object-contain" loading="lazy" />
        )}
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save size chart'}
      </button>
      <Status status={status} />
    </SectionCard>
  );
}

function ReportIssueCard({ initial }) {
  const [form, setForm] = useState(initial || {
    enabled: true,
    buttonLabel: 'Report Issue',
    mobileButtonLabel: 'Issue?',
    position: 'bottom-right',
    notificationEmail: '',
    webhookUrl: '',
    pushNotificationsEnabled: false
  });
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const body = await adminSend('PUT', '/api/admin/settings/website', { reportIssue: form });
      setForm(body.settings.website.reportIssue);
      setStatus({ tone: 'ok', message: 'Report Issue settings saved.' });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Report issue" hint="Customer issue report button and admin notification settings.">
      <div className="mt-4 space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(form.enabled)} onChange={(e) => set('enabled', e.target.checked)} />
          Show the Report Issue button on the customer website
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Desktop button label"><input className="field mt-1" value={form.buttonLabel || ''} onChange={(e) => set('buttonLabel', e.target.value)} /></Field>
          <Field label="Mobile button label"><input className="field mt-1" value={form.mobileButtonLabel || ''} onChange={(e) => set('mobileButtonLabel', e.target.value)} /></Field>
        </div>
        <Field label="Button position">
          <select className="field mt-1" value={form.position || 'bottom-right'} onChange={(e) => set('position', e.target.value)}>
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
          </select>
        </Field>
        <Field label="Notification email">
          <input className="field mt-1" type="email" placeholder="admin@example.com" value={form.notificationEmail || ''} onChange={(e) => set('notificationEmail', e.target.value)} />
        </Field>
        <Field label="Optional webhook URL">
          <input className="field mt-1" type="url" placeholder="https://…" value={form.webhookUrl || ''} onChange={(e) => set('webhookUrl', e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(form.pushNotificationsEnabled)} onChange={(e) => set('pushNotificationsEnabled', e.target.checked)} />
          Enable admin push notifications when browser push is configured
        </label>
      </div>
      <button type="button" className="btn-ink mt-5" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save report issue settings'}
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
      .then((body) => setSettings({
        ...body.settings,
        paymentProviders: body.paymentProviders || {},
        metaProvider: body.metaProvider || {},
        notificationProvider: body.notificationProvider || {}
      }))
      .catch((loadError) => setError(loadError.message));
  }, []);

  if (error) return <p className="text-sm text-accent-deep">{error}</p>;
  if (!settings) return <p className="text-sm text-clay">Loading settings…</p>;

  return (
    <div className="admin-content-shell">
      <p className="eyebrow">Settings</p>
      <h1 className="display mt-1 text-3xl">Store settings</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Saved changes apply to the customer website immediately.
      </p>
      <div className="mt-8 space-y-4">
        <GeneralCard initial={settings.general} />
        <ShippingCard initial={settings.shipping} />
        <PaymentsCard initial={settings.payments} providers={settings.paymentProviders || {}} />
        <OrderNotificationsCard initial={settings.orderNotifications} provider={settings.notificationProvider} />
        <InventoryCard initial={settings.inventory} />
        <AuthenticationCard initial={settings.authentication} />
        <MarketingCard initial={settings.marketing} provider={settings.metaProvider} />
        <SeoCard initial={settings.website.seo} />
        <SizeChartCard initial={settings.website.sizeChart} />
        <ReportIssueCard initial={settings.website.reportIssue} />
        <MaintenanceCard initial={settings.website.maintenanceMode} />
        <SecurityCard />
      </div>
    </div>
  );
}
