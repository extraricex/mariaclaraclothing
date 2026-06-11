const express = require('express');
const { listCatalogProducts, findCatalogProductBySlug } = require('../products/catalogPresenter');

const router = express.Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/', async (_req, res, next) => {
  try {
    res.json({ products: await listCatalogProducts(), source: 'catalog' });
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const product = await findCatalogProductBySlug(req.params.slug);

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    res.json({ product, source: 'catalog' });
  } catch (error) {
    next(error);
  }
});

module.exports = { productRouter: router };
