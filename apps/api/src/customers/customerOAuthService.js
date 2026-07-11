const crypto = require('node:crypto');

const PROVIDERS = new Set(['google', 'facebook']);

function sanitizeReturnPath(value) {
  const path = String(value || '/account').trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/admin')) return '/account';
  try {
    const parsed = new URL(path, 'https://local.invalid');
    if (parsed.origin !== 'https://local.invalid') return '/account';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (_error) {
    return '/account';
  }
}

function providerConfig(config, provider) {
  if (!PROVIDERS.has(provider)) return null;
  return config[provider];
}

function callbackUrl(config, provider) {
  return `${config.callbackBaseUrl}/${provider}/callback`;
}

function authorizationUrl(config, provider, state) {
  const providerSettings = providerConfig(config, provider);
  if (!providerSettings?.configured) return null;
  if (provider === 'google') {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: providerSettings.clientId,
      redirect_uri: callbackUrl(config, provider),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account'
    }).toString();
    return url.toString();
  }
  const url = new URL('https://www.facebook.com/v25.0/dialog/oauth');
  url.search = new URLSearchParams({
    client_id: providerSettings.clientId,
    redirect_uri: callbackUrl(config, provider),
    response_type: 'code',
    scope: 'email,public_profile',
    state
  }).toString();
  return url.toString();
}

async function fetchJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('OAuth provider request failed');
    error.status = 502;
    error.providerStatus = response.status;
    throw error;
  }
  return body;
}

async function googleProfile(config, code, fetchImpl) {
  const provider = config.google;
  const token = await fetchJson(fetchImpl, 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      redirect_uri: callbackUrl(config, 'google'),
      grant_type: 'authorization_code'
    })
  });
  if (!token.access_token) throw new Error('Google did not return an access token');
  const profile = await fetchJson(fetchImpl, 'https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  if (!profile.sub || !profile.email || profile.email_verified !== true) {
    const error = new Error('Google account must provide a verified email address');
    error.status = 400;
    throw error;
  }
  return { provider: 'google', providerUserId: String(profile.sub), email: profile.email, fullName: profile.name || '' };
}

async function facebookProfile(config, code, fetchImpl) {
  const provider = config.facebook;
  const tokenUrl = new URL('https://graph.facebook.com/v25.0/oauth/access_token');
  tokenUrl.search = new URLSearchParams({
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    redirect_uri: callbackUrl(config, 'facebook'),
    code
  }).toString();
  const token = await fetchJson(fetchImpl, tokenUrl);
  if (!token.access_token) throw new Error('Facebook did not return an access token');
  const profileUrl = new URL('https://graph.facebook.com/v25.0/me');
  profileUrl.search = new URLSearchParams({
    fields: 'id,name,email',
    access_token: token.access_token,
    appsecret_proof: crypto.createHmac('sha256', provider.clientSecret).update(token.access_token).digest('hex')
  }).toString();
  const profile = await fetchJson(fetchImpl, profileUrl);
  if (!profile.id || !profile.email) {
    const error = new Error('Facebook account must provide an email address');
    error.status = 400;
    throw error;
  }
  return { provider: 'facebook', providerUserId: String(profile.id), email: profile.email, fullName: profile.name || '' };
}

function exchangeOAuthCode(config, provider, code, fetchImpl = fetch) {
  if (!providerConfig(config, provider)?.configured || !String(code || '').trim()) {
    const error = new Error('OAuth callback is incomplete');
    error.status = 400;
    throw error;
  }
  return provider === 'google'
    ? googleProfile(config, code, fetchImpl)
    : facebookProfile(config, code, fetchImpl);
}

function safeStateEqual(expected, actual) {
  const left = Buffer.from(String(expected || ''));
  const right = Buffer.from(String(actual || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

module.exports = {
  authorizationUrl,
  callbackUrl,
  exchangeOAuthCode,
  providerConfig,
  safeStateEqual,
  sanitizeReturnPath
};
