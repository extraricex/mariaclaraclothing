const express = require('express');
const { cartSessionSummary, upsertCartSession } = require('../cartSessions/cartSessionRepository');

const router = express.Router();

router.put('/:sessionId', async (req, res, next) => {
  try {
    const session = await upsertCartSession(req.params.sessionId, req.body || {});
    return res.json({ session: cartSessionSummary(session) });
  } catch (error) {
    return next(error);
  }
});

module.exports = { cartSessionRouter: router };
