const {
  ParamBuilder,
  PII_DATA_TYPE,
  PlainDataObject
} = require('capi-param-builder-nodejs');

const META_COOKIE_NAMES = new Set(['_fbc', '_fbp', '_fpc', '_fbi']);
const META_BROWSER_ID_PATTERN = /^fb\.\d+\.\d+\.[a-zA-Z0-9._~-]+$/;
const META_SHA256_PATTERN = /^[a-f0-9]{64}$/;
const META_ANNOTATED_SHA256_PATTERN = /^[a-f0-9]{64}\.[a-zA-Z0-9]{8}$/;
const piiBuilder = new ParamBuilder(['mariaclaraclothing.com', 'localhost']);

function text(value, maximum = 2048) {
  return String(value || '').trim().slice(0, maximum);
}

function parseCookies(header) {
  return Object.fromEntries(String(header || '').split(';').map((part) => {
    const index = part.indexOf('=');
    if (index <= 0) return ['', ''];
    const name = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    try {
      return [decodeURIComponent(name), decodeURIComponent(raw)];
    } catch (_error) {
      return [name, raw];
    }
  }).filter(([name]) => name));
}

function safeSourceUrl(value, siteUrl) {
  try {
    const base = new URL(String(siteUrl || 'https://mariaclaraclothing.com'));
    const source = new URL(text(value) || '/', base);
    if (!['http:', 'https:'].includes(source.protocol) || source.origin !== base.origin) return base;
    source.username = '';
    source.password = '';
    source.hash = '';
    return source;
  } catch (_error) {
    return new URL('https://mariaclaraclothing.com');
  }
}

function safeReferrerUrl(value) {
  try {
    const referrer = new URL(text(value));
    if (!['http:', 'https:'].includes(referrer.protocol)) return null;
    referrer.username = '';
    referrer.password = '';
    referrer.hash = '';
    return referrer.toString();
  } catch (_error) {
    return null;
  }
}

function sourceDomains(source) {
  const hostname = source.hostname.toLowerCase();
  const primary = hostname === 'mariaclaraclothing.com' || hostname.endsWith('.mariaclaraclothing.com')
    ? 'mariaclaraclothing.com'
    : hostname;
  return [...new Set([primary, 'localhost'].filter(Boolean))];
}

function fallbackParameters(req, source, referrer, cookies) {
  const fbc = META_BROWSER_ID_PATTERN.test(text(cookies._fbc, 255)) ? text(cookies._fbc, 255) : '';
  const fbp = META_BROWSER_ID_PATTERN.test(text(cookies._fbp, 255)) ? text(cookies._fbp, 255) : '';
  return {
    fbc,
    fbp,
    clientIpAddress: text(req?.ip || req?.socket?.remoteAddress, 96),
    eventSourceUrl: source.toString(),
    referrerUrl: referrer || '',
    cookiesToSet: []
  };
}

function collectMetaParameters(req, {
  siteUrl,
  sourceUrl,
  referrerUrl,
  fallbackFbc,
  fallbackFbp
} = {}) {
  const source = safeSourceUrl(sourceUrl, siteUrl);
  const referrer = safeReferrerUrl(referrerUrl || req?.get?.('referer') || req?.headers?.referer);
  const cookies = parseCookies(req?.headers?.cookie);
  if (!cookies._fbc && META_BROWSER_ID_PATTERN.test(text(fallbackFbc, 255))) {
    cookies._fbc = text(fallbackFbc, 255);
  }
  if (!cookies._fbp && META_BROWSER_ID_PATTERN.test(text(fallbackFbp, 255))) {
    cookies._fbp = text(fallbackFbp, 255);
  }
  const fallback = fallbackParameters(req, source, referrer, cookies);

  try {
    const builder = new ParamBuilder(sourceDomains(source));
    const context = new PlainDataObject(
      source.host,
      Object.fromEntries(source.searchParams),
      cookies,
      referrer,
      text(req?.get?.('x-forwarded-for') || req?.headers?.['x-forwarded-for'], 512) || null,
      text(req?.socket?.remoteAddress, 96) || null,
      source.protocol.replace(/:$/, ''),
      `${source.pathname}${source.search}`
    );
    const cookiesToSet = builder.processRequestFromContext(context);
    return {
      fbc: text(builder.getFbc(), 255),
      fbp: text(builder.getFbp(), 255),
      clientIpAddress: text(builder.getClientIpAddress(), 96) || fallback.clientIpAddress,
      eventSourceUrl: text(builder.getEventSourceUrl()) || fallback.eventSourceUrl,
      referrerUrl: text(builder.getReferrerUrl()) || fallback.referrerUrl,
      cookiesToSet: Array.isArray(cookiesToSet) ? cookiesToSet : []
    };
  } catch (_error) {
    return fallback;
  }
}

function applyMetaParameterCookies(res, cookies, { secure = false } = {}) {
  if (typeof res?.cookie !== 'function' || !Array.isArray(cookies)) return 0;
  let applied = 0;
  for (const cookie of cookies) {
    const name = text(cookie?.name, 20);
    const value = text(cookie?.value, 512);
    const domain = text(cookie?.domain, 255).toLowerCase();
    const maxAgeSeconds = Math.trunc(Number(cookie?.maxAge));
    if (!META_COOKIE_NAMES.has(name) || !value || !/^[a-z0-9.-]+$/.test(domain)
      || !Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) continue;
    res.cookie(name, value, {
      domain,
      httpOnly: false,
      maxAge: Math.min(maxAgeSeconds, 90 * 24 * 60 * 60) * 1000,
      path: '/',
      sameSite: 'lax',
      secure: Boolean(secure)
    });
    applied += 1;
  }
  return applied;
}

function annotateMetaHashedPii(hashedValue, dataType) {
  const hash = text(hashedValue, 64).toLowerCase();
  if (!META_SHA256_PATTERN.test(hash) || !Object.values(PII_DATA_TYPE).includes(dataType)) return '';
  const annotated = text(piiBuilder.getNormalizedAndHashedPII(hash, dataType), 80);
  return META_ANNOTATED_SHA256_PATTERN.test(annotated) ? annotated : hash;
}

function buildMetaRequestContext(req, res, {
  siteUrl,
  sourceUrl,
  referrerUrl,
  fallbackFbc,
  fallbackFbp,
  consentGranted = true,
  secure = false
} = {}) {
  const source = safeSourceUrl(sourceUrl, siteUrl).toString();
  const base = {
    clientIp: text(req?.ip || req?.socket?.remoteAddress, 96),
    clientUserAgent: text(req?.get?.('user-agent') || req?.headers?.['user-agent'], 512),
    sourceUrl: source
  };
  if (consentGranted !== true) return base;
  const parameters = collectMetaParameters(req, {
    siteUrl,
    sourceUrl: source,
    referrerUrl,
    fallbackFbc,
    fallbackFbp
  });
  applyMetaParameterCookies(res, parameters.cookiesToSet, { secure });
  return {
    ...base,
    clientIp: parameters.clientIpAddress || base.clientIp,
    sourceUrl: parameters.eventSourceUrl || base.sourceUrl,
    ...(parameters.referrerUrl ? { referrerUrl: parameters.referrerUrl } : {}),
    ...(parameters.fbp ? { fbp: parameters.fbp } : {}),
    ...(parameters.fbc ? { fbc: parameters.fbc } : {})
  };
}

module.exports = {
  META_BROWSER_ID_PATTERN,
  PII_DATA_TYPE,
  annotateMetaHashedPii,
  applyMetaParameterCookies,
  buildMetaRequestContext,
  collectMetaParameters,
  parseCookies,
  safeReferrerUrl,
  safeSourceUrl
};
