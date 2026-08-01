const express = require('express');
const { getStoreSettings } = require('../settings/storeSettingsRepository');
const { env } = require('../config/env');

const router = express.Router();

function storefrontMetaPixel(metaPixel, metaConfig) {
  return metaConfig?.enabled
    ? {
      ...(metaPixel || {}),
      pixelId: metaConfig.pixelId,
      browserPurchaseEnabled: Boolean(metaConfig.browserPurchaseEnabled && metaPixel?.enabled)
    }
    : metaPixel;
}

router.use((_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  next();
});

router.get('/', async (_req, res, next) => {
  try {
    const settings = await getStoreSettings();
    const metaPixel = storefrontMetaPixel(settings.marketing.metaPixel, env.meta);
    return res.json({
      settings: {
        storeName: settings.general.storeName,
        contactEmail: settings.general.contactEmail,
        contactNumber: settings.general.contactNumber,
        storeAddress: settings.general.storeAddress,
        messengerUrl: settings.general.messengerUrl,
        socialLinks: settings.general.socialLinks,
        metaPixel,
        reviews: settings.reviews,
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
        productCardSalesInformation: settings.productCardSalesInformation,
        storefrontCollections: settings.storefrontCollections,
        collectionDefinitions: settings.collectionDefinitions,
        collectionCountdowns: settings.collectionCountdowns,
        paymentMethods: settings.payments.methods
          .filter((method) => method.enabled && (method.id !== 'paymongo' || env.paymongo.configured))
          .map(({ id, label, instructions }) => ({ id, label, instructions }))
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = { storefrontMetaPixel, storeSettingsRouter: router };
