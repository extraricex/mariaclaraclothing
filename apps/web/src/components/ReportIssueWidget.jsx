import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

const ISSUE_TYPES = [
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

let lastFrontendError = '';

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    lastFrontendError = String(event.message || 'Website error detected.').slice(0, 1000);
  });
  window.addEventListener('unhandledrejection', (event) => {
    lastFrontendError = String(event.reason?.message || event.reason || 'Website error detected.').slice(0, 1000);
  });
}

export default function ReportIssueWidget({ settings, cartItems }) {
  const location = useLocation();
  const config = settings?.reportIssue || {};
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    issueType: 'website_display_ui_issue',
    message: '',
    screenshot: null
  });
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const orderNumber = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('order') || '';
  }, [location.search]);

  if (config.enabled === false) return null;

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function deviceInfo() {
    return {
      language: navigator.language || '',
      platform: navigator.platform || '',
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    };
  }

  async function submit(event) {
    event.preventDefault();
    setStatus(null);
    if (!form.issueType || !form.message.trim()) {
      setStatus({ tone: 'error', message: 'Choose an issue type and describe what happened.' });
      return;
    }
    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.set('name', form.name);
      payload.set('email', form.email);
      payload.set('phone', form.phone);
      payload.set('issueType', form.issueType);
      payload.set('message', form.message);
      payload.set('pageUrl', window.location.href);
      payload.set('deviceInfo', JSON.stringify(deviceInfo()));
      payload.set('browserInfo', navigator.userAgentData?.brands?.map((brand) => `${brand.brand} ${brand.version}`).join(', ') || '');
      payload.set('screenSize', `${window.screen?.width || 0}x${window.screen?.height || 0}`);
      payload.set('userAgent', navigator.userAgent || '');
      payload.set('cartSnapshot', JSON.stringify((cartItems || []).map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        size: item.size,
        quantity: item.quantity
      }))));
      payload.set('orderNumber', orderNumber);
      payload.set('errorMessage', lastFrontendError);
      if (form.screenshot) payload.set('screenshot', form.screenshot);
      const response = await fetch('/api/issue-reports', {
        method: 'POST',
        body: payload
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not submit issue report.');
      setStatus({ tone: 'ok', message: 'Report submitted. Thank you for helping us improve the site.' });
      setForm({ name: '', email: '', phone: '', issueType: 'website_display_ui_issue', message: '', screenshot: null });
    } catch (error) {
      setStatus({ tone: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  const rightSide = config.position !== 'bottom-left';

  return (
    <>
      <button
        type="button"
        className={`fixed bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+3.25rem)] z-[45] rounded-full border border-ink/10 bg-paper px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink shadow-2xl transition-transform hover:-translate-y-1 sm:bottom-[5.25rem] sm:px-4 sm:py-2.5 ${rightSide ? 'right-2 sm:right-4' : 'left-2 sm:left-4'}`}
        onClick={() => setOpen(true)}
        aria-label="Report an issue"
      >
        <span className="sm:hidden">{config.mobileButtonLabel || 'Issue?'}</span>
        <span className="hidden sm:inline">{config.buttonLabel || 'Report Issue'}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 p-3 sm:items-center sm:p-6" role="presentation">
          <form onSubmit={submit} className="max-h-[90svh] w-full max-w-xl overflow-y-auto border border-line bg-paper p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-label="Report website issue">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Website feedback</p>
                <h2 className="display mt-1 text-3xl">Report Issue</h2>
                <p className="mt-2 text-sm text-ink-soft">Tell us what went wrong. We automatically include page and device details.</p>
              </div>
              <button type="button" className="touch-target text-2xl leading-none text-ink" onClick={() => setOpen(false)} aria-label="Close report issue form">×</button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Name<input className="field mt-1" value={form.name} onChange={(event) => set('name', event.target.value)} /></label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Email<input className="field mt-1" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} /></label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Phone<input className="field mt-1" value={form.phone} onChange={(event) => set('phone', event.target.value)} /></label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">
                Issue type
                <select className="field mt-1" required value={form.issueType} onChange={(event) => set('issueType', event.target.value)}>
                  {ISSUE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-clay">
              Message
              <textarea className="field mt-1" required rows="5" value={form.message} onChange={(event) => set('message', event.target.value)} placeholder="Describe what happened and what you expected." />
            </label>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-clay">
              Screenshot optional
              <input className="field mt-1" type="file" accept="image/*" onChange={(event) => set('screenshot', event.target.files?.[0] || null)} />
              <span className="mt-1 block normal-case tracking-normal text-ink-soft">Remove passwords, payment details, and other sensitive information before uploading.</span>
            </label>
            {status?.message && (
              <p className={`mt-3 text-sm ${status.tone === 'error' ? 'text-accent-deep' : 'text-[#2f7d32]'}`} role="status">{status.message}</p>
            )}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="submit" className="btn-ink customer-compact-button flex-1" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit report'}</button>
              <button type="button" className="btn-ghost customer-compact-button flex-1" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
