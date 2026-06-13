const express = require('express');
const { getSiteContent } = require('../siteContent/siteContentRepository');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ siteContent: await getSiteContent() });
  } catch (error) {
    next(error);
  }
});

module.exports = { siteContentRouter: router };
