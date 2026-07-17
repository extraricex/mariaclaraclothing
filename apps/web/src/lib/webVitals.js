import { trackFunnelEvent } from './funnelAnalytics.js';

function supported(type) {
  return typeof PerformanceObserver !== 'undefined'
    && (PerformanceObserver.supportedEntryTypes || []).includes(type);
}

function report(name, value) {
  const metricValue = Number(value);
  if (!Number.isFinite(metricValue) || metricValue < 0) return;
  trackFunnelEvent('web_vital', {
    metricName: name,
    metricValue: Number(metricValue.toFixed(name === 'CLS' ? 4 : 1)),
    dedupeKey: `${name}:${window.location.pathname}`,
    dedupeMilliseconds: 60_000
  });
}

export function startWebVitalsMonitoring() {
  if (typeof window === 'undefined' || typeof performance === 'undefined') return () => {};
  const observers = [];
  let largestContentfulPaint = 0;
  let cumulativeLayoutShift = 0;
  let interactionLatency = 0;
  const observe = (type, callback) => {
    if (!supported(type)) return;
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe({ type, buffered: true });
      observers.push(observer);
    } catch (_error) { /* unsupported performance entry details must never affect shopping */ }
  };

  observe('paint', (entries) => {
    const fcp = entries.find((entry) => entry.name === 'first-contentful-paint');
    if (fcp) report('FCP', fcp.startTime);
  });
  observe('largest-contentful-paint', (entries) => {
    const latest = entries.at(-1);
    if (latest) largestContentfulPaint = latest.startTime;
  });
  observe('layout-shift', (entries) => {
    cumulativeLayoutShift += entries
      .filter((entry) => !entry.hadRecentInput)
      .reduce((sum, entry) => sum + Number(entry.value || 0), 0);
  });
  observe('event', (entries) => {
    for (const entry of entries) interactionLatency = Math.max(interactionLatency, Number(entry.duration || 0));
  });

  const navigation = performance.getEntriesByType('navigation')[0];
  if (navigation?.responseStart >= 0) report('TTFB', navigation.responseStart);

  let finalized = false;
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    if (largestContentfulPaint) report('LCP', largestContentfulPaint);
    report('CLS', cumulativeLayoutShift);
    if (interactionLatency) report('INP', interactionLatency);
    observers.forEach((observer) => observer.disconnect());
  };
  const onVisibility = () => { if (document.visibilityState === 'hidden') finalize(); };
  document.addEventListener('visibilitychange', onVisibility, { once: true });
  window.addEventListener('pagehide', finalize, { once: true });
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', finalize);
    finalize();
  };
}
