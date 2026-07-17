const express = require('express');
const { pageDescriptor, renderSeoBody, renderSeoHead } = require('../seo/storefrontSeo');

const router = express.Router();

router.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    'Content-Type': 'text/html; charset=utf-8',
    'X-Robots-Tag': 'noindex'
  });
  next();
});

router.get('/head', async (req, res, next) => {
  try {
    const descriptor = await pageDescriptor(req.query.path);
    return res.status(200).send(renderSeoHead(descriptor, { nonce: req.query.nonce }));
  } catch (error) {
    return next(error);
  }
});

router.get('/body', async (req, res, next) => {
  try {
    const descriptor = await pageDescriptor(req.query.path);
    return res.status(200).send(renderSeoBody(descriptor));
  } catch (error) {
    return next(error);
  }
});

module.exports = { storefrontSeoRouter: router };
