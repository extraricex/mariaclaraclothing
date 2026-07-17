const express = require('express');
const { cartSessionSummary, upsertCartSession } = require('../cartSessions/cartSessionRepository');
const { recoveredCart } = require('../cartSessions/cartRecoveryService');

const router = express.Router();

router.get('/recovery/:token', async (req, res, next) => {
  try {
    const cart = await recoveredCart(req.params.token);
    res.set('Cache-Control', 'no-store');
    return res.json({ cart });
  } catch (error) {
    return next(error);
  }
});

router.put('/:sessionId', async (req, res, next) => {
  try {
    const session = await upsertCartSession(req.params.sessionId, req.body || {});
    return res.json({ session: cartSessionSummary(session) });
  } catch (error) {
    return next(error);
  }
});

module.exports = { cartSessionRouter: router };
