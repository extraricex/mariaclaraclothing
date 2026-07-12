const crypto = require('node:crypto');
const express = require('express');

const { env } = require('../config/env');
const { processInboundPancakeOrder } = require('../integrations/pancake/pancakeOrderSyncService');

const SECRET_HEADER = 'x-maria-clara-pancake-secret';

function secretsMatch(received, expected) {
  const receivedDigest = crypto.createHash('sha256').update(String(received || '')).digest();
  const expectedDigest = crypto.createHash('sha256').update(String(expected || '')).digest();
  return Boolean(received && expected && crypto.timingSafeEqual(receivedDigest, expectedDigest));
}

function unwrapOrderPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const candidates = [body.order, body.data?.record, body.data, body];
  return candidates.find((item) => item && typeof item === 'object' && !Array.isArray(item)
    && (item.id !== undefined || item.order_id !== undefined)) || null;
}

function createPancakeWebhookRouter({
  config = env.pancake,
  processOrder = processInboundPancakeOrder
} = {}) {
  const router = express.Router();

  router.post('/', async (req, res, next) => {
    try {
      if (!config.webhookSecret) {
        return res.status(503).json({ error: 'Pancake webhook is not configured' });
      }
      if (!secretsMatch(req.get(SECRET_HEADER), config.webhookSecret)) {
        return res.status(401).json({ error: 'Invalid webhook credentials' });
      }

      const order = unwrapOrderPayload(req.body);
      if (!order) return res.status(400).json({ error: 'Invalid Pancake order payload' });
      if (order.shop_id !== undefined && config.shopId && String(order.shop_id) !== String(config.shopId)) {
        return res.status(403).json({ error: 'Webhook shop does not match' });
      }

      const result = await processOrder({ pancakeOrder: order });
      if (result?.status === 'blocked') {
        return res.status(422).json({ error: result.safeErrorCode || 'Pancake order could not be synchronized' });
      }
      return res.json({ ok: true, status: result?.status || 'accepted' });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

const pancakeWebhookRouter = createPancakeWebhookRouter();

module.exports = {
  SECRET_HEADER,
  createPancakeWebhookRouter,
  pancakeWebhookRouter,
  secretsMatch,
  unwrapOrderPayload
};
