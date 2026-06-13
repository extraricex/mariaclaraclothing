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

function createApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/collections/all', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'maria-clara-clothing' });
  });

  app.use('/api/products', productRouter);
  app.use('/api/site-content', siteContentRouter);
  app.use('/api/orders', orderRouter);
  app.use('/api/cart-sessions', cartSessionRouter);
  app.use('/api/discounts', discountRouter);
  app.use('/api/customer', customerRouter);
  app.use('/api/storefront-settings', storeSettingsRouter);
  app.use('/api/admin', adminRouter);

  app.use((error, _req, res, _next) => {
    if (!error.status || error.status >= 500) {
      console.error(error);
    }
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong' });
  });

  return app;
}

module.exports = { createApp };
