const express = require('express');
const path = require('node:path');
const { adminRouter } = require('./routes/admin');
const { productRouter } = require('./routes/products');
const { orderRouter } = require('./routes/orders');
const { cartSessionRouter } = require('./routes/cartSessions');
const { siteContentRouter } = require('./routes/siteContent');
const { discountRouter } = require('./routes/discounts');
const { customerRouter } = require('./routes/customer');
const { storeSettingsRouter } = require('./routes/storeSettings');
const { postOnly, rateLimit } = require('./middleware/rateLimit');

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

function errorHandler(error, req, res, _next) {
  const status = error.status || 500;
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
  res.status(status).json(body);
}

function createApp() {
  const app = express();

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

  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/collections/all', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'maria-clara-clothing' });
  });

  app.use('/api/admin/login', loginRateLimit);
  app.use('/api/orders', checkoutRateLimit);

  app.use('/api/products', productRouter);
  app.use('/api/site-content', siteContentRouter);
  app.use('/api/orders', orderRouter);
  app.use('/api/cart-sessions', cartSessionRouter);
  app.use('/api/discounts', discountRouter);
  app.use('/api/customer', customerRouter);
  app.use('/api/storefront-settings', storeSettingsRouter);
  app.use('/api/admin', adminRouter);

  app.use(errorHandler);

  return app;
}

module.exports = { createApp, errorHandler };
