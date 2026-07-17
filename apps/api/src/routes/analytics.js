const express = require('express');
const { env } = require('../config/env');
const { recordStorefrontMetaEvent } = require('../analytics/storefrontMetaEventService');

const router = express.Router();

router.post('/events', async (req, res, next) => {
  try {
    if (req.get('Sec-GPC') === '1' || req.get('DNT') === '1') return res.status(204).end();
    const result = await recordStorefrontMetaEvent(req.body || {}, {
      userAgent: req.get('user-agent') || '',
      clientIp: req.ip,
      cookieHeader: req.headers.cookie || '',
      siteUrl: env.oauth.frontendUrl
    });
    res.set('Cache-Control', 'no-store');
    return res.status(result.recorded ? 202 : 200).json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = { analyticsRouter: router };
