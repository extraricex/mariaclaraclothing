const express = require('express');
const { getStoreSettings } = require('../settings/storeSettingsRepository');

const router = express.Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/', async (_req, res, next) => {
  try {
    const settings = await getStoreSettings();
    return res.json({
      settings: {
        storeName: settings.general.storeName,
        contactEmail: settings.general.contactEmail,
        contactNumber: settings.general.contactNumber,
        storeAddress: settings.general.storeAddress,
        socialLinks: settings.general.socialLinks,
        shipping: settings.shipping,
        paymentMethods: settings.payments.methods
          .filter((method) => method.enabled)
          .map(({ id, label, instructions }) => ({ id, label, instructions }))
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = { storeSettingsRouter: router };
