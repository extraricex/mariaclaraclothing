const express = require('express');
const { getSiteContent } = require('../siteContent/siteContentRepository');

const router = express.Router();

router.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ siteContent: getSiteContent() });
});

module.exports = { siteContentRouter: router };
