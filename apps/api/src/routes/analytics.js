const express = require('express');
const { recordAnalyticsEvent } = require('../analytics/storefrontAnalyticsRepository');

const router = express.Router();

router.post('/events', async (req, res, next) => {
  try {
    if (req.get('Sec-GPC') === '1' || req.get('DNT') === '1') return res.status(204).end();
    const result = await recordAnalyticsEvent(req.body || {}, { userAgent: req.get('user-agent') || '' });
    res.set('Cache-Control', 'no-store');
    return res.status(result.recorded ? 202 : 200).json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = { analyticsRouter: router };
