const express = require('express');
const { env } = require('../config/env');
const { getPool, hasDatabaseUrl } = require('../db/postgres');
const { buildAuthoritativeQuote } = require('../checkout/checkoutQuoteService');
const { insertCheckoutQuote } = require('../checkout/checkoutQuoteRepository');
const { CommerceError } = require('../checkout/commerceError');

const DEFAULT_DEPENDENCIES = {
  buildAuthoritativeQuote,
  getPool,
  hasDatabaseUrl,
  insertCheckoutQuote,
  quoteTtlMs: env.checkout.quoteTtlMs
};

function publicQuote(record) {
  const snapshot = record.snapshot || {};
  return {
    id: record.id,
    expiresAt: record.expiresAt,
    cartSessionId: snapshot.cartSessionId,
    items: snapshot.items || [],
    itemCount: snapshot.itemCount || 0,
    address: snapshot.address || null,
    shippingRegion: snapshot.shippingRegion || '',
    shippingRegionLabel: snapshot.shippingRegionLabel || '',
    shippingFeeCents: snapshot.shippingFeeCents ?? null,
    shippingStatus: snapshot.shippingStatus || 'pending_address',
    discountCode: snapshot.discountCode || '',
    subtotalCents: snapshot.subtotalCents || 0,
    discountTotalCents: snapshot.discountTotalCents || 0,
    totalCents: snapshot.totalCents || 0,
    freeShippingEnabled: Boolean(snapshot.freeShippingEnabled),
    freeShippingMinimumItems: Math.max(0, Number(snapshot.freeShippingMinimumItems || 0)),
    freeShippingUnlocked: Boolean(snapshot.freeShippingUnlocked),
    finalizable: Boolean(snapshot.finalizable)
  };
}

function createCheckoutRouter(dependencyOverrides = {}) {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides };
  const router = express.Router();

  router.post('/quotes', async (req, res, next) => {
    try {
      if (!dependencies.hasDatabaseUrl()) {
        throw new CommerceError('PostgreSQL is required for checkout V2.', {
          code: 'checkout_v2_unavailable',
          status: 503
        });
      }
      const snapshot = await dependencies.buildAuthoritativeQuote(req.body || {});
      const quote = await dependencies.insertCheckoutQuote(
        dependencies.getPool(),
        snapshot,
        { ttlMs: dependencies.quoteTtlMs }
      );
      res.status(201).json({ quote: publicQuote(quote) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

const checkoutRouter = createCheckoutRouter();

module.exports = { checkoutRouter, createCheckoutRouter, publicQuote };
