const express = require('express');
const {
  createAccount,
  findAccountByEmail,
  findAccountById,
  findOrCreateOAuthAccount,
  normalizeEmail,
  publicCustomer,
  signCustomerToken,
  updateAccount,
  withLoginProviders,
  verifyCustomerToken,
  verifyPassword
} = require('../customers/customerAccountRepository');
const crypto = require('node:crypto');
const { listOrders } = require('../orders/orderRepository');
const { normalizePhilippinePhone } = require('../jnt/jntExport');
const {
  createAuthSession,
  findAuthSession,
  revokeAuthSession,
  verifySessionCsrf
} = require('../auth/sessionRepository');
const {
  clearSessionCookies,
  appendSetCookies,
  csrfTokenFromRequest,
  isProduction,
  parseCookies,
  serializeCookie,
  sessionTokenFromRequest,
  setSessionCookies
} = require('../auth/sessionHttp');
const { env } = require('../config/env');
const { getStoreSettings } = require('../settings/storeSettingsRepository');
const {
  authorizationUrl,
  exchangeOAuthCode,
  safeStateEqual,
  sanitizeReturnPath
} = require('../customers/customerOAuthService');

const router = express.Router();
const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_COOKIE = 'mc_oauth_state';
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function customerTokenFromRequest(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

async function requireCustomer(req, res, next) {
  try {
    const sessionToken = sessionTokenFromRequest(req, 'customer');
    const session = sessionToken ? await findAuthSession(sessionToken) : null;
    if (session?.actorType === 'customer') {
      const account = await findAccountById(session.actorId);
      if (account) {
        req.authSession = session;
        req.authSessionToken = sessionToken;
        req.customerAccount = account;
        return next();
      }
    }

    if (isProduction()) {
      return res.status(401).json({ error: 'Customer authentication is required' });
    }

    const accountId = verifyCustomerToken(customerTokenFromRequest(req));
    const account = accountId ? await findAccountById(accountId) : null;

    if (!account) {
      return res.status(401).json({ error: 'Customer authentication is required' });
    }

    req.customerAccount = account;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireCustomerCsrf(req, res, next) {
  if (!req.authSession) return next();
  if (!verifySessionCsrf(req.authSession, csrfTokenFromRequest(req))) {
    return res.status(403).json({ error: 'A valid CSRF token is required' });
  }
  return next();
}

async function startCustomerSession(res, account) {
  const auth = await createAuthSession({
    actorType: 'customer',
    actorId: account.id,
    ttlMs: CUSTOMER_SESSION_TTL_MS
  });
  setSessionCookies(res, 'customer', auth, CUSTOMER_SESSION_TTL_MS);
  return auth;
}

async function oauthAvailability() {
  const settings = await getStoreSettings();
  return {
    google: Boolean(env.oauth.google.configured && settings.authentication.googleEnabled),
    facebook: Boolean(env.oauth.facebook.configured && settings.authentication.facebookEnabled)
  };
}

function oauthStateFromRequest(req) {
  const raw = parseCookies(req.headers.cookie)[OAUTH_STATE_COOKIE];
  try {
    const state = JSON.parse(Buffer.from(raw || '', 'base64url').toString('utf8'));
    return { state: String(state.state || ''), returnTo: sanitizeReturnPath(state.returnTo) };
  } catch (_error) {
    return { state: '', returnTo: '/account' };
  }
}

function setOAuthState(res, state, returnTo) {
  const value = Buffer.from(JSON.stringify({ state, returnTo: sanitizeReturnPath(returnTo) })).toString('base64url');
  appendSetCookies(res, [serializeCookie(OAUTH_STATE_COOKIE, value, { httpOnly: true, maxAge: OAUTH_STATE_TTL_SECONDS })]);
}

function clearOAuthState(res) {
  appendSetCookies(res, [serializeCookie(OAUTH_STATE_COOKIE, '', { httpOnly: true, maxAge: 0 })]);
}

function oauthFailureRedirect(res, message) {
  const url = new URL('/login', env.oauth.frontendUrl);
  url.searchParams.set('oauthError', message);
  return res.redirect(303, url.toString());
}

router.get('/oauth/status', async (_req, res, next) => {
  try {
    return res.json({ providers: await oauthAvailability() });
  } catch (error) {
    return next(error);
  }
});

router.get('/oauth/:provider/start', async (req, res, next) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    const availability = await oauthAvailability();
    if (!availability[provider]) return res.status(404).json({ error: 'Social login provider is unavailable' });
    const state = crypto.randomBytes(32).toString('base64url');
    setOAuthState(res, state, req.query.returnTo);
    return res.redirect(302, authorizationUrl(env.oauth, provider, state));
  } catch (error) {
    return next(error);
  }
});

router.get('/oauth/:provider/callback', async (req, res, next) => {
  const provider = String(req.params.provider || '').toLowerCase();
  const stored = oauthStateFromRequest(req);
  clearOAuthState(res);
  try {
    const availability = await oauthAvailability();
    if (!availability[provider] || !safeStateEqual(stored.state, req.query.state)) {
      return oauthFailureRedirect(res, 'Social login expired or was not valid. Please try again.');
    }
    if (req.query.error || !req.query.code) {
      return oauthFailureRedirect(res, 'Social login was cancelled or could not be completed.');
    }
    const profile = await exchangeOAuthCode(env.oauth, provider, req.query.code);
    const account = await findOrCreateOAuthAccount(profile);
    await startCustomerSession(res, account);
    return res.redirect(303, new URL(stored.returnTo, env.oauth.frontendUrl).toString());
  } catch (error) {
    if (error.status && error.status < 500) return oauthFailureRedirect(res, error.message);
    return next(error);
  }
});

function normalizeRegistration(body) {
  const fullName = String(body.fullName || '').trim();
  const email = normalizeEmail(body.email);
  const phone = String(body.phone || '').trim();
  const password = String(body.password || '');

  if (!fullName) throw badRequest('Full name is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('A valid email address is required');
  if (!normalizePhilippinePhone(phone)) throw badRequest('A valid Philippine mobile number is required');
  if (password.length < 8) throw badRequest('Password must be at least 8 characters');

  return { fullName, email, phone, password };
}

router.post('/register', async (req, res, next) => {
  try {
    const registration = normalizeRegistration(req.body || {});
    const existing = await findAccountByEmail(registration.email);

    if (existing) {
      throw badRequest('An account with this email already exists');
    }

    const account = await createAccount(registration);
    const auth = await startCustomerSession(res, account);
    return res.status(201).json({
      csrfToken: auth.csrfToken,
      customer: publicCustomer(account),
      ...(!isProduction() ? { token: signCustomerToken(account.id) } : {})
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const account = email ? await findAccountByEmail(email) : null;

    if (!account || !verifyPassword(password, account)) {
      return res.status(401).json({ error: 'Email or password is incorrect' });
    }

    const accountWithProviders = await withLoginProviders(account);
    const auth = await startCustomerSession(res, accountWithProviders);
    return res.json({
      csrfToken: auth.csrfToken,
      customer: publicCustomer(accountWithProviders),
      ...(!isProduction() ? { token: signCustomerToken(account.id) } : {})
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireCustomer, async (req, res, next) => {
  try {
    return res.json({ customer: publicCustomer(await withLoginProviders(req.customerAccount)) });
  } catch (error) {
    return next(error);
  }
});

router.put('/me', requireCustomer, requireCustomerCsrf, async (req, res, next) => {
  try {
    const body = req.body || {};

    if (body.fullName !== undefined && !String(body.fullName).trim()) {
      throw badRequest('Full name is required');
    }
    if (body.phone !== undefined && !normalizePhilippinePhone(String(body.phone))) {
      throw badRequest('A valid Philippine mobile number is required');
    }

    const account = await updateAccount(req.customerAccount.id, body);
    return res.json({ customer: publicCustomer(await withLoginProviders(account)) });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', requireCustomer, requireCustomerCsrf, async (req, res, next) => {
  try {
    if (req.authSessionToken) await revokeAuthSession(req.authSessionToken);
    clearSessionCookies(res, 'customer');
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.get('/orders', requireCustomer, async (req, res, next) => {
  try {
    const orders = await listOrders();
    const account = req.customerAccount;
    const customerOrders = orders
      .filter((order) => order.customerAccountId === account.id)
      .map((order) => ({
        orderNumber: order.orderNumber,
        placedAt: order.placedAt,
        status: order.status,
        fulfillmentStatus: order.fulfillmentStatus,
        deliveryStatus: order.deliveryStatus || 'pending',
        trackingNumber: order.trackingNumber || '',
        totalCents: order.totalCents,
        shippingFeeCents: order.shippingFeeCents,
        items: (order.items || []).map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          size: item.size,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents
        }))
      }));

    customerOrders.sort((a, b) => new Date(b.placedAt || 0) - new Date(a.placedAt || 0));
    return res.json({ orders: customerOrders });
  } catch (error) {
    return next(error);
  }
});

module.exports = { customerRouter: router, verifyCustomerTokenFromRequest: customerTokenFromRequest };
