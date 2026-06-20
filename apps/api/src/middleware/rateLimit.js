// Tiny dependency-free fixed-window rate limiter.
//
// State is an in-memory Map keyed by `<keyPrefix>:<client>`, so it resets when
// the process restarts. That is sufficient for a single-instance COD store; a
// multi-instance deployment would move this to a shared store (e.g. Redis).
//
// Limits are read from process.env at request time (matching the repo
// convention), so tests can tune them per test without re-importing modules.

const buckets = new Map();

function positiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// rateLimit returns an Express middleware. Options:
// - keyPrefix: namespace so different limiters never share buckets
// - maxEnv / windowEnv: env var names read at request time
// - defaultMax / defaultWindowMs: fallback limits
// - message: the error string returned with a 429
// A resolved max of 0 disables the limiter entirely.
function rateLimit({ keyPrefix, maxEnv, windowEnv, defaultMax, defaultWindowMs, message }) {
  return function rateLimitMiddleware(req, res, next) {
    const max = positiveIntEnv(maxEnv, defaultMax);
    const windowMs = positiveIntEnv(windowEnv, defaultWindowMs);
    if (max <= 0 || windowMs <= 0) return next();

    const key = `${keyPrefix}:${clientKey(req)}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.start >= windowMs) {
      buckets.set(key, { start: now, count: 1 });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.start + windowMs - now) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: message });
    }

    return next();
  };
}

// Only POST requests should count against an action limiter (e.g. checkout),
// leaving GET reads (order confirmation lookups) unthrottled.
function postOnly(middleware) {
  return function postOnlyRateLimit(req, res, next) {
    if (req.method !== 'POST') return next();
    return middleware(req, res, next);
  };
}

function resetRateLimits() {
  buckets.clear();
}

module.exports = { postOnly, rateLimit, resetRateLimits };
