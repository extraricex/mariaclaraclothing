const ADMIN_SESSION_COOKIE = 'mc_admin_session';
const ADMIN_CSRF_COOKIE = 'mc_admin_csrf';
const CUSTOMER_SESSION_COOKIE = 'mc_customer_session';
const CUSTOMER_CSRF_COOKIE = 'mc_customer_csrf';

function isProduction() {
  return String(process.env.APP_ENV || 'development').trim().toLowerCase() === 'production';
}

function parseCookies(header) {
  return Object.fromEntries(String(header || '').split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    return [name, decodeURIComponent(value)];
  }).filter(([name]) => name));
}

function cookieNames(actorType) {
  return actorType === 'admin'
    ? { session: ADMIN_SESSION_COOKIE, csrf: ADMIN_CSRF_COOKIE }
    : { session: CUSTOMER_SESSION_COOKIE, csrf: CUSTOMER_CSRF_COOKIE };
}

function serializeCookie(name, value, { httpOnly = false, maxAge = 0 } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`
  ];
  if (httpOnly) parts.push('HttpOnly');
  if (isProduction()) parts.push('Secure');
  return parts.join('; ');
}

function appendSetCookies(res, cookies) {
  const current = res.getHeader('Set-Cookie');
  const existing = Array.isArray(current) ? current : current ? [current] : [];
  res.setHeader('Set-Cookie', [...existing, ...cookies]);
}

function setSessionCookies(res, actorType, auth, ttlMs) {
  const names = cookieNames(actorType);
  const maxAge = Number(ttlMs) / 1000;
  appendSetCookies(res, [
    serializeCookie(names.session, auth.token, { httpOnly: true, maxAge }),
    serializeCookie(names.csrf, auth.csrfToken, { maxAge })
  ]);
}

function clearSessionCookies(res, actorType) {
  const names = cookieNames(actorType);
  appendSetCookies(res, [
    serializeCookie(names.session, '', { httpOnly: true, maxAge: 0 }),
    serializeCookie(names.csrf, '', { maxAge: 0 })
  ]);
}

function sessionTokenFromRequest(req, actorType) {
  return parseCookies(req.headers.cookie)[cookieNames(actorType).session] || '';
}

function csrfTokenFromRequest(req) {
  return String(req.get('X-CSRF-Token') || '').trim();
}

module.exports = {
  appendSetCookies,
  clearSessionCookies,
  csrfTokenFromRequest,
  isProduction,
  parseCookies,
  serializeCookie,
  sessionTokenFromRequest,
  setSessionCookies
};
