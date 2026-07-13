const express = require('express');
const { env } = require('../config/env');
const { getStoreSettings } = require('../settings/storeSettingsRepository');
const { findOrderByNumber } = require('../orders/orderRepository');
const { placeAuthoritativeCheckout } = require('../checkout/authoritativeCheckoutService');
const { parseMetaCookies } = require('../marketing/metaEvent');
const {
  defaultAuthoritativeDependencies, exportPancakeOrderNow, resolveCustomerAccountId, syncOrderInventoryNow
} = require('./orders');
const { createPayMongoClient } = require('../payments/paymongoClient');
const { attachCheckoutSession, checkoutSessionPayload, processPaidWebhook } = require('../payments/paymongoPaymentService');
const { processRefundWebhook } = require('../payments/paymongoRefundService');
const { verifyPayMongoSignature } = require('../payments/paymongoWebhookSignature');
const { createPancakeClient } = require('../integrations/pancake/pancakeClient');
const { processOutboundOrderEvents } = require('../integrations/pancake/pancakeOrderSyncService');

function sourceUrl(req) {
  try { return new URL('/checkout', String(req.get('origin') || env.oauth.frontendUrl)).toString(); }
  catch (_error) { return ''; }
}

function createPayMongoRouter(dependencies = {}) {
  const router = express.Router();
  const config = dependencies.config || env.paymongo;
  const client = dependencies.client || createPayMongoClient(config);
  const processPancakeOrderUpdates = dependencies.processPancakeOrderUpdates || (async () => {
    if (env.pancake.mode !== 'live' || !env.pancake.apiKeyConfigured) return { status: 'skipped' };
    return processOutboundOrderEvents({
      config: env.pancake,
      client: createPancakeClient(env.pancake)
    });
  });

  router.post('/create-checkout-session', async (req, res, next) => {
    try {
      if (!config.configured) {
        const error = new Error('PayMongo online payment is not configured.'); error.status = 503; error.code = 'paymongo_not_configured'; throw error;
      }
      const settings = await getStoreSettings();
      const enabled = settings.payments.methods.some((method) => method.id === 'paymongo' && method.enabled);
      if (!enabled) {
        const error = new Error('PayMongo online payment is currently disabled.'); error.status = 409; error.code = 'paymongo_disabled'; throw error;
      }
      const customerAccountId = await resolveCustomerAccountId(req);
      const cookies = parseMetaCookies(req.headers.cookie);
      const paymentExpiresAt = new Date(Date.now() + config.reservationMinutes * 60_000).toISOString();
      const result = await placeAuthoritativeCheckout({
        ...req.body, paymentMethod: 'paymongo', paymentExpiresAt, customerAccountId,
        idempotencyKey: req.get('Idempotency-Key') || '',
        requestContext: { ...cookies, clientIp: req.ip, clientUserAgent: req.get('user-agent') || '', sourceUrl: sourceUrl(req) }
      }, defaultAuthoritativeDependencies(req));
      let order = await findOrderByNumber(result.orderNumber, { includeRelated: false });
      let checkoutUrl = order.paymentMetadata?.checkoutUrl || '';
      if (!order.providerCheckoutSessionId || !checkoutUrl) {
        const session = await client.createCheckoutSession(checkoutSessionPayload(order, config));
        order = await attachCheckoutSession(order, session, config);
        checkoutUrl = session.checkoutUrl;
      }
      try {
        const pancakeExport = await exportPancakeOrderNow(order.orderNumber);
        if (Number(pancakeExport?.summary?.sentCount || 0) > 0) await syncOrderInventoryNow(order.orderNumber);
      } catch (error) {
        console.error('PayMongo order/inventory sync to Pancake failed:', error?.message || error);
      }
      return res.status(201).json({ ...result, paymentStatus: order.paymentStatus, checkoutUrl, checkoutSessionId: order.providerCheckoutSessionId });
    } catch (error) { return next(error); }
  });

  router.post('/webhook', async (req, res, next) => {
    try {
      if (!config.configured) return res.status(503).json({ error: 'PayMongo webhook is not configured.' });
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
      const valid = verifyPayMongoSignature({
        rawBody, header: req.get('Paymongo-Signature'), secret: config.webhookSecret, livemode: config.livemode
      });
      if (!valid) return res.status(401).json({ error: 'Invalid PayMongo signature.' });
      const eventType = String(req.body?.data?.attributes?.type || '');
      const result = ['payment.refunded', 'payment.refund.updated'].includes(eventType)
        ? await processRefundWebhook(req.body, { livemode: config.livemode })
        : await processPaidWebhook(req.body, { metaEnabled: env.meta.enabled });
      console.info('PayMongo webhook processed.', {
        eventType,
        orderNumber: result.orderNumber || '',
        status: result.status
      });
      if (result.status === 'paid' || (['payment.refunded', 'payment.refund.updated'].includes(eventType) && result.status === 'succeeded')) {
        try {
          const pancakeResult = await processPancakeOrderUpdates();
          if (pancakeResult?.status === 'failed') {
            console.error('Pancake payment update failed and remains queued for retry.');
          }
        } catch (error) {
          console.error('Pancake payment update remains queued for retry:', error?.message || error);
        }
      }
      return res.status(200).json({ received: true, status: result.status });
    } catch (error) { return next(error); }
  });

  return router;
}

module.exports = { createPayMongoRouter, paymongoRouter: createPayMongoRouter() };
