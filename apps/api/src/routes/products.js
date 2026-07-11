const express = require('express');
const { listCatalogProducts, findCatalogProductBySlug } = require('../products/catalogPresenter');
const { listOrders } = require('../orders/orderRepository');

const router = express.Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const EXCLUDED_SALE_STATUSES = new Set(['cancelled', 'canceled', 'returned', 'failed', 'unreachable', 'draft', 'abandoned_checkout']);
const EXCLUDED_PAYMENT_STATUSES = new Set(['unpaid', 'failed', 'cancelled', 'canceled', 'refunded']);

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function successfulOrder(order) {
  const status = normalizeKey(order.status);
  const paymentStatus = normalizeKey(order.paymentStatus);
  if (EXCLUDED_SALE_STATUSES.has(status)) return false;
  if (EXCLUDED_PAYMENT_STATUSES.has(paymentStatus)) return false;
  return Array.isArray(order.items) && order.items.length > 0;
}

function salesCountsByProduct(orders) {
  const counts = new Map();
  for (const order of orders || []) {
    if (!successfulOrder(order)) continue;
    for (const item of order.items || []) {
      const productId = String(item.productId || item.slug || '').trim();
      if (!productId) continue;
      const catalogId = productId.startsWith('catalog-') ? productId : `catalog-${productId}`;
      const quantity = Math.max(0, Math.trunc(Number(item.quantity || 0)));
      counts.set(catalogId, (counts.get(catalogId) || 0) + quantity);
    }
  }
  return counts;
}

function annotateBestSellerCounts(products, orders) {
  const counts = salesCountsByProduct(orders);
  return products.map((product) => ({
    ...product,
    successfulOrderCount: counts.get(product.id) || counts.get(`catalog-${product.slug}`) || 0
  }));
}

router.get('/', async (_req, res, next) => {
  try {
    const [products, orders] = await Promise.all([listCatalogProducts(), listOrders()]);
    res.json({ products: annotateBestSellerCounts(products, orders), source: 'catalog' });
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

module.exports = { productRouter: router, annotateBestSellerCounts, successfulOrder };
