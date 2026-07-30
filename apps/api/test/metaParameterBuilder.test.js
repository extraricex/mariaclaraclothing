const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PII_DATA_TYPE,
  applyMetaParameterCookies,
  annotateMetaHashedPii,
  buildMetaRequestContext,
  collectMetaParameters,
  parseCookies,
  safeReferrerUrl,
  safeSourceUrl
} = require('../src/marketing/metaParameterBuilder');
const { sha256 } = require('../src/marketing/metaEvent');

function request(overrides = {}) {
  const headers = {
    cookie: '_fbp=fb.1.1785332985000.browser; _fbc=fb.1.1785332985000.MetaClick_ABC-123',
    referer: 'https://www.facebook.com/ad?campaign=summer',
    'user-agent': 'Mozilla/5.0 Test',
    'x-forwarded-for': '2001:db8::1',
    ...(overrides.headers || {})
  };
  return {
    ip: overrides.ip || '203.0.113.8',
    socket: { remoteAddress: overrides.remoteAddress || '2001:db8::2' },
    headers,
    get(name) {
      return headers[String(name).toLowerCase()] || '';
    }
  };
}

test('official Meta parameter builder enriches matching parameters for the actual storefront URL', () => {
  const result = collectMetaParameters(request(), {
    siteUrl: 'https://mariaclaraclothing.com',
    sourceUrl: 'https://mariaclaraclothing.com/product/mandala?utm_source=meta'
  });

  assert.match(result.fbp, /^fb\.1\.1785332985000\.browser\.[a-zA-Z0-9]{8}$/);
  assert.match(result.fbc, /^fb\.1\.1785332985000\.MetaClick_ABC-123\.[a-zA-Z0-9]{8}$/);
  assert.match(result.clientIpAddress, /^2001:db8::1\.[a-zA-Z0-9]{8}$/);
  assert.match(
    result.eventSourceUrl,
    /^https:\/\/mariaclaraclothing\.com\/product\/mandala\?utm_source=meta\.[a-zA-Z0-9]{8}$/
  );
  assert.match(result.referrerUrl, /^https:\/\/www\.facebook\.com\/ad\?campaign=summer\.[a-zA-Z0-9]{8}$/);
  assert.deepEqual(result.cookiesToSet.map((cookie) => cookie.name).sort(), ['_fbc', '_fbp']);
  assert.equal(result.eventSourceUrl.includes('/api/analytics/events'), false);
});

test('official builder creates one browser identifier and accepts consented browser fallbacks', () => {
  const withoutCookies = request({ headers: { cookie: '', referer: '', 'x-forwarded-for': '' } });
  const generated = collectMetaParameters(withoutCookies, {
    siteUrl: 'https://mariaclaraclothing.com',
    sourceUrl: '/checkout'
  });
  assert.match(generated.fbp, /^fb\.1\.\d+\.\d+\.[a-zA-Z0-9]{8}$/);
  assert.equal(generated.fbc, '');

  const fallback = collectMetaParameters(withoutCookies, {
    siteUrl: 'https://mariaclaraclothing.com',
    sourceUrl: '/checkout',
    fallbackFbp: 'fb.1.1785332985000.browser',
    fallbackFbc: 'fb.1.1785332985000.MetaClick_ABC-123'
  });
  assert.match(fallback.fbp, /^fb\.1\.1785332985000\.browser\.[a-zA-Z0-9]{8}$/);
  assert.match(fallback.fbc, /^fb\.1\.1785332985000\.MetaClick_ABC-123\.[a-zA-Z0-9]{8}$/);
});

test('Meta parameter cookies are allowlisted, bounded, and never HttpOnly', () => {
  const calls = [];
  const applied = applyMetaParameterCookies({
    cookie: (...args) => calls.push(args)
  }, [
    { name: '_fbp', value: 'fb.1.123.browser.AQQAAQMB', domain: 'mariaclaraclothing.com', maxAge: 7776000 },
    { name: 'session', value: 'must-not-be-set', domain: 'mariaclaraclothing.com', maxAge: 7776000 },
    { name: '_fbc', value: 'fb.1.123.click.AQQAAQMB', domain: 'bad domain', maxAge: 7776000 }
  ], { secure: true });

  assert.equal(applied, 1);
  assert.equal(calls[0][0], '_fbp');
  assert.equal(calls[0][2].httpOnly, false);
  assert.equal(calls[0][2].sameSite, 'lax');
  assert.equal(calls[0][2].secure, true);
  assert.equal(calls[0][2].maxAge, 90 * 24 * 60 * 60 * 1000);
});

test('Meta request context honors consent before building identifiers or setting cookies', () => {
  const calls = [];
  const req = request({ headers: { cookie: '', referer: '', 'x-forwarded-for': '' } });
  const withoutConsent = buildMetaRequestContext(req, {
    cookie: (...args) => calls.push(args)
  }, {
    siteUrl: 'https://mariaclaraclothing.com',
    sourceUrl: '/checkout',
    consentGranted: false,
    secure: true
  });

  assert.equal(withoutConsent.fbp, undefined);
  assert.equal(withoutConsent.fbc, undefined);
  assert.equal(calls.length, 0);

  const withConsent = buildMetaRequestContext(req, {
    cookie: (...args) => calls.push(args)
  }, {
    siteUrl: 'https://mariaclaraclothing.com',
    sourceUrl: '/checkout',
    consentGranted: true,
    secure: true
  });
  assert.match(withConsent.fbp, /^fb\.1\.\d+\.\d+\.[a-zA-Z0-9]{8}$/);
  assert.equal(calls.some(([name]) => name === '_fbp'), true);
});

test('Meta URL and cookie adapters reject unsafe input', () => {
  assert.equal(
    safeSourceUrl('https://attacker.example/checkout', 'https://mariaclaraclothing.com').toString(),
    'https://mariaclaraclothing.com/'
  );
  assert.equal(safeReferrerUrl('javascript:alert(1)'), null);
  assert.deepEqual(parseCookies('_fbp=fb.1.123.browser; encoded=hello%20world'), {
    _fbp: 'fb.1.123.browser',
    encoded: 'hello world'
  });
});

test('official builder annotates an already-normalized SHA-256 value without hashing it twice', () => {
  const hash = sha256('buyer@example.com');
  const annotated = annotateMetaHashedPii(hash, PII_DATA_TYPE.EMAIL);
  assert.match(annotated, new RegExp(`^${hash}\\.[a-zA-Z0-9]{8}$`));
  assert.equal(annotateMetaHashedPii('buyer@example.com', PII_DATA_TYPE.EMAIL), '');
  assert.equal(annotateMetaHashedPii(hash, 'unsupported'), '');
});
