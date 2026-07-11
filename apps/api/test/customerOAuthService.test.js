const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  authorizationUrl,
  exchangeOAuthCode,
  safeStateEqual,
  sanitizeReturnPath
} = require('../src/customers/customerOAuthService');

const config = {
  callbackBaseUrl: 'https://mariaclaraclothing.com/api/customer/oauth',
  frontendUrl: 'https://mariaclaraclothing.com',
  google: { configured: true, clientId: 'google-client', clientSecret: 'google-secret' },
  facebook: { configured: true, clientId: 'facebook-client', clientSecret: 'facebook-secret' }
};

test('OAuth authorization URLs use exact callbacks, state, and minimum profile scopes', () => {
  const google = new URL(authorizationUrl(config, 'google', 'state-value'));
  assert.equal(google.origin, 'https://accounts.google.com');
  assert.equal(google.searchParams.get('redirect_uri'), 'https://mariaclaraclothing.com/api/customer/oauth/google/callback');
  assert.equal(google.searchParams.get('state'), 'state-value');
  assert.match(google.searchParams.get('scope'), /openid email profile/);

  const facebook = new URL(authorizationUrl(config, 'facebook', 'state-value'));
  assert.equal(facebook.origin, 'https://www.facebook.com');
  assert.equal(facebook.searchParams.get('redirect_uri'), 'https://mariaclaraclothing.com/api/customer/oauth/facebook/callback');
  assert.equal(facebook.searchParams.get('scope'), 'email,public_profile');
});

test('OAuth return paths and state reject external and admin redirects', () => {
  assert.equal(sanitizeReturnPath('/checkout?step=contact'), '/checkout?step=contact');
  assert.equal(sanitizeReturnPath('//attacker.example'), '/account');
  assert.equal(sanitizeReturnPath('https://attacker.example'), '/account');
  assert.equal(sanitizeReturnPath('/admin/orders'), '/account');
  assert.equal(safeStateEqual('same', 'same'), true);
  assert.equal(safeStateEqual('same', 'different'), false);
});

test('Google code exchange returns only a verified normalized identity and does not expose tokens', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/token')) return new Response(JSON.stringify({ access_token: 'transient-token' }), { status: 200 });
    return new Response(JSON.stringify({ sub: 'google-123', email: 'Buyer@Example.com', email_verified: true, name: 'Maria Buyer' }), { status: 200 });
  };
  const profile = await exchangeOAuthCode(config, 'google', 'one-time-code', fetchImpl);
  assert.deepEqual(profile, { provider: 'google', providerUserId: 'google-123', email: 'Buyer@Example.com', fullName: 'Maria Buyer' });
  assert.equal(profile.access_token, undefined);
  assert.match(String(calls[0].options.body), /client_secret=google-secret/);
  assert.match(calls[1].options.headers.Authorization, /^Bearer /);
});

test('Facebook code exchange uses appsecret proof and returns no provider token', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/oauth/access_token')) {
      return new Response(JSON.stringify({ access_token: 'facebook-transient-token' }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: 'facebook-123', email: 'buyer@example.com', name: 'Maria Buyer' }), { status: 200 });
  };
  const profile = await exchangeOAuthCode(config, 'facebook', 'one-time-code', fetchImpl);
  assert.deepEqual(profile, { provider: 'facebook', providerUserId: 'facebook-123', email: 'buyer@example.com', fullName: 'Maria Buyer' });
  const profileUrl = new URL(calls[1]);
  assert.ok(profileUrl.searchParams.get('appsecret_proof'));
  assert.equal(profile.access_token, undefined);
});

test('OAuth identities reuse an existing email account instead of creating a duplicate', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-oauth-'));
  const previous = process.env.CUSTOMER_ACCOUNTS_DATA_FILE;
  process.env.CUSTOMER_ACCOUNTS_DATA_FILE = path.join(tempDir, 'accounts.json');
  delete require.cache[require.resolve('../src/customers/customerAccountRepository')];
  const repository = require('../src/customers/customerAccountRepository');
  try {
    const passwordAccount = await repository.createAccount({ fullName: 'Existing Buyer', email: 'buyer@example.com', phone: '09171234567', password: 'strong-password' });
    const googleAccount = await repository.findOrCreateOAuthAccount({ provider: 'google', providerUserId: 'g-1', email: 'BUYER@example.com', fullName: 'Provider Name' });
    const repeat = await repository.findOrCreateOAuthAccount({ provider: 'google', providerUserId: 'g-1', email: 'buyer@example.com', fullName: 'Provider Name' });
    assert.equal(googleAccount.id, passwordAccount.id);
    assert.equal(repeat.id, passwordAccount.id);
    assert.deepEqual(repeat.loginProviders, ['google']);
    const stored = JSON.parse(await fs.readFile(process.env.CUSTOMER_ACCOUNTS_DATA_FILE, 'utf8'));
    assert.equal(stored.customerAccounts.length, 1);
  } finally {
    if (previous === undefined) delete process.env.CUSTOMER_ACCOUNTS_DATA_FILE;
    else process.env.CUSTOMER_ACCOUNTS_DATA_FILE = previous;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
