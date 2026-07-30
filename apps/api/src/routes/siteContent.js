const express = require('express');
const { getSiteContent } = require('../siteContent/siteContentRepository');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    res.json({ siteContent: await getSiteContent() });
  } catch (error) {
    next(error);
  }
});

module.exports = { siteContentRouter: router };
