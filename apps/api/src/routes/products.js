const express = require('express');
const { listCatalogProducts, findCatalogProductBySlug } = require('../products/catalogPresenter');
const { productSalesSummaries } = require('../orders/orderRepository');
const { annotateProductsWithCommerceStats } = require('../products/productCommerceStatsService');
const { reviewSummariesByProduct } = require('../reviews/reviewRepository');
const { getStoreSettings } = require('../settings/storeSettingsRepository');

const router = express.Router();

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const EXCLUDED_SALE_STATUSES = new Set([
  'cancelled', 'canceled', 'returned', 'failed', 'expired', 'unreachable',
  'draft', 'pending_payment', 'abandoned_checkout'
]);
const EXCLUDED_PAYMENT_STATUSES = new Set([
  'unpaid', 'failed', 'expired', 'pending_payment', 'cancelled', 'canceled', 'refunded'
]);

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function successfulOrder(order) {
  if (order?.isTestOrder) return false;
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

function annotateBestSellerCounts(products, ordersOrCounts) {
  const counts = ordersOrCounts instanceof Map ? ordersOrCounts : salesCountsByProduct(ordersOrCounts);
  return products.map((product) => ({
    ...product,
    successfulOrderCount: counts.get(product.id) || counts.get(`catalog-${product.slug}`) || 0
  }));
}

function annotateReviewSummaries(products, summaries) {
  return products.map((product) => {
    const summary = summaries[product.slug] || {
      averageRating: 0,
      ratingCount: 0,
      totalReviews: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      hasRatings: false
    };
    const ratingCount = Math.max(0, Math.trunc(Number(summary.ratingCount ?? summary.totalReviews ?? 0)));
    return {
      ...product,
      averageRating: Number(summary.averageRating || 0),
      ratingCount,
      approvedReviewCount: ratingCount,
      ratingDistribution: summary.ratingDistribution,
      hasRatings: ratingCount > 0,
      reviewSummary: { ...summary, ratingCount, totalReviews: ratingCount, hasRatings: ratingCount > 0 }
    };
  });
}

router.get('/', async (_req, res, next) => {
  try {
    const [products, salesSummaries, reviewSummaries, settings] = await Promise.all([
      listCatalogProducts(), productSalesSummaries(), reviewSummariesByProduct(), getStoreSettings()
    ]);
    const salesCounts = new Map([...salesSummaries].map(([productId, summary]) => [
      productId,
      Number(summary.eligibleQuantity || 0)
    ]));
    const reviewed = annotateReviewSummaries(
      annotateBestSellerCounts(products, salesCounts),
      reviewSummaries
    );
    const annotated = await annotateProductsWithCommerceStats(reviewed, {
      settings,
      salesSummaries
    });
    res.json({ products: annotated, source: 'catalog' });
  } catch (error) {
    next(error);
  }
});

router.get('/:slug/route', async (req, res, next) => {
  try {
    const product = await findCatalogProductBySlug(req.params.slug);
    if (!product) {
      res.status(404).end();
      return;
    }

    res.set('X-Product-Canonical-Handle', product.publicHandle);
    const legacyPluralRoute = req.query.legacy_plural === '1';
    if (legacyPluralRoute || normalizeKey(req.params.slug) !== product.publicHandle) {
      const redirectQuery = { ...req.query };
      delete redirectQuery.legacy_plural;
      const query = new URLSearchParams(redirectQuery).toString();
      res.set('Cache-Control', 'public, max-age=86400');
      res.redirect(301, `/product/${encodeURIComponent(product.publicHandle)}${query ? `?${query}` : ''}`);
      return;
    }

    res.set('X-Accel-Redirect', `/index.html?seo_path=${encodeURIComponent(`/product/${product.publicHandle}`)}`);
    res.status(200).end();
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const [product, reviewSummaries, salesSummaries, settings] = await Promise.all([
      findCatalogProductBySlug(req.params.slug),
      reviewSummariesByProduct(),
      productSalesSummaries(),
      getStoreSettings()
    ]);

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    res.set('X-Product-Canonical-Handle', product.publicHandle);
    const [reviewedProduct] = annotateReviewSummaries([product], reviewSummaries);
    const [annotated] = await annotateProductsWithCommerceStats([reviewedProduct], { settings, salesSummaries });
    res.json({
      product: annotated,
      source: 'catalog'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { productRouter: router, annotateBestSellerCounts, annotateReviewSummaries, successfulOrder };
