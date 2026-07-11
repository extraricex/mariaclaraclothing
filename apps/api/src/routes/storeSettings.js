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
        messengerUrl: settings.general.messengerUrl,
        socialLinks: settings.general.socialLinks,
        shipping: settings.shipping,
        ticker: settings.website.ticker,
        seo: settings.website.seo,
        hero: settings.website.hero,
        maintenanceMode: settings.website.maintenanceMode,
        infoPages: settings.website.infoPages,
        sizeChart: settings.website.sizeChart,
        reportIssue: {
          enabled: settings.website.reportIssue.enabled,
          buttonLabel: settings.website.reportIssue.buttonLabel,
          mobileButtonLabel: settings.website.reportIssue.mobileButtonLabel,
          position: settings.website.reportIssue.position
        },
        inventory: settings.inventory,
        storefrontCollections: settings.storefrontCollections,
        collectionCountdowns: settings.collectionCountdowns,
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
