const express = require('express');
const { env } = require('../config/env');
const { recordStorefrontMetaEvent } = require('../analytics/storefrontMetaEventService');
const { findAuthSession } = require('../auth/sessionRepository');
const { sessionTokenFromRequest } = require('../auth/sessionHttp');
const { findAccountById } = require('../customers/customerAccountRepository');

const router = express.Router();

async function authenticatedMetaCustomer(req) {
  if (req.body?.metaBrowserSent !== true) return null;
  const token = sessionTokenFromRequest(req, 'customer');
  const session = token ? await findAuthSession(token) : null;
  if (session?.actorType !== 'customer') return null;
  const account = await findAccountById(session.actorId);
  if (!account) return null;
  return {
    id: account.id,
    email: account.email,
    phone: account.phone,
    firstName: account.firstName,
    lastName: account.lastName,
    savedAddress: account.savedAddress || null
  };
}

router.post('/events', async (req, res, next) => {
  try {
    if (req.get('Sec-GPC') === '1' || req.get('DNT') === '1') return res.status(204).end();
    const customer = await authenticatedMetaCustomer(req);
    const result = await recordStorefrontMetaEvent(req.body || {}, {
      userAgent: req.get('user-agent') || '',
      clientIp: req.ip,
      cookieHeader: req.headers.cookie || '',
      siteUrl: env.oauth.frontendUrl,
      customer
    });
    res.set('Cache-Control', 'no-store');
    return res.status(result.recorded ? 202 : 200).json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = { analyticsRouter: router, authenticatedMetaCustomer };
