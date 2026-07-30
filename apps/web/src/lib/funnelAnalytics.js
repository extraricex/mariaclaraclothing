const SESSION_KEY = 'maria-clara-anonymous-funnel-session';
const CAMPAIGN_KEY = 'maria-clara-anonymous-funnel-campaign';
const recentEvents = new Map();
const META_BROWSER_ID_PATTERN = /^fb\.\d+\.\d+\.[a-zA-Z0-9._~-]+$/;
const META_CLICK_ID_PATTERN = /^[a-zA-Z0-9._~-]{8,220}$/;

function storage() {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch (_error) { return null; }
}

function randomId(prefix = 'event') {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
}

export function createFunnelEventId(prefix = 'event') {
  return randomId(prefix);
}

export function normalizeFunnelEventId(value, fallbackPrefix = 'event') {
  return String(value || randomId(fallbackPrefix))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 100);
}

function sessionId() {
  const session = storage();
  const existing = session?.getItem(SESSION_KEY) || '';
  if (/^[a-zA-Z0-9_-]{8,120}$/.test(existing)) return existing;
  const created = randomId('session');
  try { session?.setItem(SESSION_KEY, created); } catch (_error) { /* analytics cannot interrupt shopping */ }
  return created;
}

function privacyOptOut() {
  if (typeof navigator === 'undefined') return true;
  return navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
}

function cookieValue(name, source) {
  const match = String(source || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return '';
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch (_error) {
    return match.slice(name.length + 1);
  }
}

function validMetaBrowserId(value) {
  const normalized = String(value || '').trim().slice(0, 255);
  return META_BROWSER_ID_PATTERN.test(normalized) ? normalized : '';
}

export function metaBrowserIdentifiers({
  cookieSource = typeof document !== 'undefined' ? document.cookie : '',
  search = typeof window !== 'undefined' ? window.location.search : '',
  now = Date.now()
} = {}) {
  const fbp = validMetaBrowserId(cookieValue('_fbp', cookieSource));
  let fbc = validMetaBrowserId(cookieValue('_fbc', cookieSource));
  if (!fbc) {
    const fbclid = String(new URLSearchParams(String(search || '')).get('fbclid') || '').trim();
    const timestamp = Math.trunc(Number(now));
    if (META_CLICK_ID_PATTERN.test(fbclid) && Number.isFinite(timestamp) && timestamp > 0) {
      fbc = `fb.1.${timestamp}.${fbclid}`;
    }
  }
  return {
    ...(fbp ? { fbp } : {}),
    ...(fbc ? { fbc } : {})
  };
}

function campaign() {
  const session = storage();
  try {
    const existing = JSON.parse(session?.getItem(CAMPAIGN_KEY) || 'null');
    if (existing && typeof existing === 'object') return existing;
  } catch (_error) { /* use current URL */ }
  const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const value = {
    utmSource: search.get('utm_source') || '',
    utmMedium: search.get('utm_medium') || '',
    utmCampaign: search.get('utm_campaign') || ''
  };
  try { session?.setItem(CAMPAIGN_KEY, JSON.stringify(value)); } catch (_error) { /* analytics cannot interrupt shopping */ }
  return value;
}

function recentlyRecorded(key, milliseconds) {
  const now = Date.now();
  const previous = recentEvents.get(key) || 0;
  recentEvents.set(key, now);
  if (recentEvents.size > 500) {
    for (const [candidate, time] of recentEvents) if (now - time > 60_000) recentEvents.delete(candidate);
  }
  return now - previous < milliseconds;
}

export function trackFunnelEvent(eventName, input = {}) {
  if (typeof window === 'undefined' || privacyOptOut() || window.location.pathname.startsWith('/admin')) return false;
  const path = String(input.path || window.location.pathname || '/').split('?')[0];
  const dedupeKey = String(input.dedupeKey || '');
  const guardKey = `${eventName}:${dedupeKey || path}:${input.productId || ''}:${input.variantId || ''}`;
  if (dedupeKey && recentlyRecorded(guardKey, Number(input.dedupeMilliseconds || 1500))) return false;
  const valueCents = input.valueCents === undefined || input.valueCents === null
    ? null
    : Math.round(Number(input.valueCents));
  const metaIdentifiers = input.metaBrowserSent === true ? metaBrowserIdentifiers() : {};
  const payload = {
    eventId: normalizeFunnelEventId(input.eventId),
    eventName,
    sessionId: sessionId(),
    path,
    productId: String(input.productId || ''),
    variantId: String(input.variantId || ''),
    quantity: Math.max(0, Math.trunc(Number(input.quantity || 0))),
    valueCents: Number.isFinite(valueCents) && valueCents >= 0 ? valueCents : null,
    paymentMethod: String(input.paymentMethod || ''),
    metricName: String(input.metricName || ''),
    metricValue: Number.isFinite(Number(input.metricValue)) ? Number(input.metricValue) : null,
    checkoutStep: String(input.checkoutStep || ''),
    errorCategory: String(input.errorCategory || ''),
    errorMessage: String(input.errorMessage || ''),
    reference: String(input.reference || ''),
    referrer: document.referrer || '',
    ...campaign(),
    ...(input.metaBrowserSent === true ? {
      metaBrowserSent: true,
      metaEventId: normalizeFunnelEventId(input.metaEventId || input.eventId),
      metaEventName: String(input.metaEventName || '').slice(0, 40),
      metaCustomData: input.metaCustomData && typeof input.metaCustomData === 'object'
        ? input.metaCustomData
        : undefined,
      ...(metaIdentifiers.fbp ? { metaFbp: metaIdentifiers.fbp } : {}),
      ...(metaIdentifiers.fbc ? { metaFbc: metaIdentifiers.fbc } : {})
    } : {})
  };
  fetch('/api/analytics/events', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});
  return true;
}

export function resetFunnelAnalyticsForTests() {
  recentEvents.clear();
}
