const express = require('express');
const path = require('node:path');
const { createResponsiveUploadMiddleware } = require('./images/responsiveUploadMiddleware');
const { adminRouter } = require('./routes/admin');
const { productRouter } = require('./routes/products');
const { collectionRouter } = require('./routes/collections');
const { orderRouter } = require('./routes/orders');
const { cartSessionRouter } = require('./routes/cartSessions');
const { siteContentRouter } = require('./routes/siteContent');
const { discountRouter } = require('./routes/discounts');
const { customerRouter } = require('./routes/customer');
const { storeSettingsRouter } = require('./routes/storeSettings');
const { checkoutRouter } = require('./routes/checkout');
const { issueReportsRouter } = require('./routes/issueReports');
const { pancakeWebhookRouter } = require('./routes/pancakeWebhook');
const { paymongoRouter } = require('./routes/paymongo');
const { reviewsRouter } = require('./routes/reviews');
const { sitemapRouter } = require('./routes/sitemap');
const { storefrontSeoRouter } = require('./routes/storefrontSeo');
const { merchantFeedRouter } = require('./routes/merchantFeed');
const { robotsRouter } = require('./routes/robots');
const { analyticsRouter } = require('./routes/analytics');
const { methodOnly, postOnly, rateLimit } = require('./middleware/rateLimit');

// Throttle credential-guessing on admin login and checkout abuse. Limits are
// generous by default (read from env at request time) so a single shopper or
// the admin is never blocked, while scripted floods are stopped.
const loginRateLimit = rateLimit({
  keyPrefix: 'admin-login',
  maxEnv: 'ADMIN_LOGIN_RATE_LIMIT_MAX',
  windowEnv: 'ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS',
  defaultMax: 50,
  defaultWindowMs: 15 * 60 * 1000,
  message: 'Too many login attempts. Please try again later.'
});

const checkoutRateLimit = postOnly(rateLimit({
  keyPrefix: 'checkout',
  maxEnv: 'CHECKOUT_RATE_LIMIT_MAX',
  windowEnv: 'CHECKOUT_RATE_LIMIT_WINDOW_MS',
  defaultMax: 100,
  defaultWindowMs: 10 * 60 * 1000,
  message: 'Too many checkout attempts. Please slow down and try again shortly.'
}));

const customerAuthRateLimit = postOnly(rateLimit({
  keyPrefix: 'customer-auth', maxEnv: 'CUSTOMER_AUTH_RATE_LIMIT_MAX',
  windowEnv: 'CUSTOMER_AUTH_RATE_LIMIT_WINDOW_MS', defaultMax: 30, defaultWindowMs: 15 * 60 * 1000,
  message: 'Too many account attempts. Please try again later.'
}));

const customerOAuthRateLimit = methodOnly(['GET'], rateLimit({
  keyPrefix: 'customer-oauth', maxEnv: 'CUSTOMER_OAUTH_RATE_LIMIT_MAX',
  windowEnv: 'CUSTOMER_OAUTH_RATE_LIMIT_WINDOW_MS', defaultMax: 60, defaultWindowMs: 15 * 60 * 1000,
  message: 'Too many social login attempts. Please try again later.'
}));

const passwordResetRateLimit = postOnly(rateLimit({
  keyPrefix: 'password-reset', maxEnv: 'PASSWORD_RESET_RATE_LIMIT_MAX',
  windowEnv: 'PASSWORD_RESET_RATE_LIMIT_WINDOW_MS', defaultMax: 8, defaultWindowMs: 60 * 60 * 1000,
  message: 'Too many password reset attempts. Please try again later.'
}));

const quoteRateLimit = postOnly(rateLimit({
  keyPrefix: 'checkout-quote', maxEnv: 'QUOTE_RATE_LIMIT_MAX',
  windowEnv: 'QUOTE_RATE_LIMIT_WINDOW_MS', defaultMax: 120, defaultWindowMs: 10 * 60 * 1000,
  message: 'Too many price refreshes. Please slow down and try again shortly.'
}));

const cartRateLimit = methodOnly(['PUT'], rateLimit({
  keyPrefix: 'cart-session', maxEnv: 'CART_RATE_LIMIT_MAX',
  windowEnv: 'CART_RATE_LIMIT_WINDOW_MS', defaultMax: 180, defaultWindowMs: 10 * 60 * 1000,
  message: 'Too many cart updates. Please slow down and try again shortly.'
}));

const issueReportRateLimit = postOnly(rateLimit({
  keyPrefix: 'issue-report',
  maxEnv: 'ISSUE_REPORT_RATE_LIMIT_MAX',
  windowEnv: 'ISSUE_REPORT_RATE_LIMIT_WINDOW_MS',
  defaultMax: 20,
  defaultWindowMs: 10 * 60 * 1000,
  message: 'Too many issue reports. Please try again shortly.'
}));

const reviewSubmissionRateLimit = postOnly(rateLimit({
  keyPrefix: 'review-submission',
  maxEnv: 'REVIEW_SUBMISSION_RATE_LIMIT_MAX',
  windowEnv: 'REVIEW_SUBMISSION_RATE_LIMIT_WINDOW_MS',
  defaultMax: 8,
  defaultWindowMs: 60 * 60 * 1000,
  message: 'Too many review submissions. Please try again later.'
}));

const orderLookupRateLimit = methodOnly(['GET'], rateLimit({
  keyPrefix: 'order-lookup', maxEnv: 'ORDER_LOOKUP_RATE_LIMIT_MAX',
  windowEnv: 'ORDER_LOOKUP_RATE_LIMIT_WINDOW_MS', defaultMax: 120, defaultWindowMs: 10 * 60 * 1000,
  message: 'Too many order lookups. Please try again shortly.'
}));

const analyticsRateLimit = postOnly(rateLimit({
  keyPrefix: 'storefront-analytics', maxEnv: 'ANALYTICS_RATE_LIMIT_MAX',
  windowEnv: 'ANALYTICS_RATE_LIMIT_WINDOW_MS', defaultMax: 300, defaultWindowMs: 10 * 60 * 1000,
  message: 'Too many analytics events. Please try again later.'
}));

const adminSensitiveRateLimit = postOnly(rateLimit({
  keyPrefix: 'admin-sensitive', maxEnv: 'ADMIN_SENSITIVE_RATE_LIMIT_MAX',
  windowEnv: 'ADMIN_SENSITIVE_RATE_LIMIT_WINDOW_MS', defaultMax: 40, defaultWindowMs: 15 * 60 * 1000,
  message: 'Too many sensitive admin actions. Please try again shortly.'
}));

function errorHandler(error, req, res, _next) {
  const status = error.status || (error.name === 'MulterError' ? 400 : 500);
  if (status >= 500) {
    // Structured server-error log: greppable, without request bodies or customer PII.
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      method: req?.method || '',
      path: req?.originalUrl || '',
      status,
      message: error.message,
      stack: error.stack
    }));
  }
  const body = { error: error.status ? error.message : 'Something went wrong' };
  if (error.code) body.code = error.code;
  if (error.details !== undefined) body.details = error.details;
  if (error.details?.fields && error.status) {
    body.success = false;
    body.message = error.message;
    body.fields = error.details.fields;
  }
  res.status(status).json(body);
}

function createApp() {
  const app = express();
  const publicDirectory = path.join(__dirname, '..', 'public');
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://connect.facebook.net https://www.facebook.com/signals/iwl.js; style-src 'self' 'unsafe-inline' https://api.fontshare.com; font-src 'self' data: https:; img-src 'self' data: blob: https:; connect-src 'self' https://www.facebook.com https://graph.facebook.com https://connect.facebook.net; frame-src 'self' https://www.facebook.com; upgrade-insecure-requests"
    });
    next();
  });

  // Behind a reverse proxy (the Docker nginx) set TRUST_PROXY (e.g. `1`) so
  // req.ip reflects the real client for rate limiting. Off by default so local
  // and bare deployments are not spoofable via X-Forwarded-For.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    if (trustProxy === 'true' || trustProxy === 'false') {
      app.set('trust proxy', trustProxy === 'true');
    } else {
      const numeric = Number(trustProxy);
      app.set('trust proxy', Number.isFinite(numeric) && String(numeric) === trustProxy ? numeric : trustProxy);
    }
  }

  app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buffer) => {
      if (req.originalUrl?.startsWith('/api/payments/paymongo/webhook')) req.rawBody = Buffer.from(buffer);
    }
  }));
  app.use(createResponsiveUploadMiddleware({ publicDirectory }));
  app.use(express.static(publicDirectory));

  app.get('/collections/all', (_req, res) => {
    res.redirect(301, '/shop');
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'maria-clara-clothing' });
  });

  app.use('/sitemap.xml', sitemapRouter);
  app.use('/merchant-feed.xml', merchantFeedRouter);
  app.use('/robots.txt', robotsRouter);
  app.use('/api/storefront/seo', storefrontSeoRouter);

  app.use('/api/admin/login', loginRateLimit);
  app.use('/api/orders', checkoutRateLimit);
  app.use('/api/payments/paymongo/create-checkout-session', checkoutRateLimit);
  app.use('/api/orders', orderLookupRateLimit);
  app.use('/api/checkout/quotes', quoteRateLimit);
  app.use('/api/cart-sessions', cartRateLimit);
  app.use('/api/issue-reports', issueReportRateLimit);
  app.use('/api/reviews', reviewSubmissionRateLimit);
  app.use('/api/analytics/events', analyticsRateLimit);
  app.use('/api/customer/login', customerAuthRateLimit);
  app.use('/api/customer/register', customerAuthRateLimit);
  app.use('/api/customer/password-reset', passwordResetRateLimit);
  app.use('/api/customer/oauth', customerOAuthRateLimit);
  app.use('/api/admin/settings/security', adminSensitiveRateLimit);
  app.use('/api/admin/integrations/pancake', adminSensitiveRateLimit);
  app.use('/api/admin/products', adminSensitiveRateLimit);
  app.use('/api/admin/site-content', adminSensitiveRateLimit);
  app.use('/api/admin/reviews', adminSensitiveRateLimit);

  app.use('/api/products', productRouter);
  app.use('/api/collections', collectionRouter);
  app.use('/api/site-content', siteContentRouter);
  app.use('/api/orders', orderRouter);
  app.use('/api/checkout', checkoutRouter);
  app.use('/api/cart-sessions', cartSessionRouter);
  app.use('/api/issue-reports', issueReportsRouter);
  app.use('/api/discounts', discountRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/customer', customerRouter);
  app.use('/api/storefront-settings', storeSettingsRouter);
  app.use('/api/integrations/pancake/webhook', pancakeWebhookRouter);
  app.use('/api/payments/paymongo', paymongoRouter);
  app.use('/api/admin', adminRouter);

  app.use(errorHandler);

  return app;
}

module.exports = { createApp, errorHandler };
