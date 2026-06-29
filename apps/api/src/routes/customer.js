const express = require('express');
const {
  createAccount,
  findAccountByEmail,
  findAccountById,
  normalizeEmail,
  publicCustomer,
  signCustomerToken,
  updateAccount,
  verifyCustomerToken,
  verifyPassword
} = require('../customers/customerAccountRepository');
const { listOrders } = require('../orders/orderRepository');
const { normalizePhilippinePhone } = require('../jnt/jntExport');

const router = express.Router();

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function customerTokenFromRequest(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

async function requireCustomer(req, res, next) {
  try {
    const accountId = verifyCustomerToken(customerTokenFromRequest(req));
    const account = accountId ? await findAccountById(accountId) : null;

    if (!account) {
      return res.status(401).json({ error: 'Customer authentication is required' });
    }

    req.customerAccount = account;
    return next();
  } catch (error) {
    return next(error);
  }
}

function normalizeRegistration(body) {
  const fullName = String(body.fullName || '').trim();
  const email = normalizeEmail(body.email);
  const phone = String(body.phone || '').trim();
  const password = String(body.password || '');

  if (!fullName) throw badRequest('Full name is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('A valid email address is required');
  if (!normalizePhilippinePhone(phone)) throw badRequest('A valid Philippine mobile number is required');
  if (password.length < 8) throw badRequest('Password must be at least 8 characters');

  return { fullName, email, phone, password };
}

router.post('/register', async (req, res, next) => {
  try {
    const registration = normalizeRegistration(req.body || {});
    const existing = await findAccountByEmail(registration.email);

    if (existing) {
      throw badRequest('An account with this email already exists');
    }

    const account = await createAccount(registration);
    return res.status(201).json({
      token: signCustomerToken(account.id),
      customer: publicCustomer(account)
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const account = email ? await findAccountByEmail(email) : null;

    if (!account || !verifyPassword(password, account)) {
      return res.status(401).json({ error: 'Email or password is incorrect' });
    }

    return res.json({
      token: signCustomerToken(account.id),
      customer: publicCustomer(account)
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireCustomer, (req, res) => {
  res.json({ customer: publicCustomer(req.customerAccount) });
});

router.put('/me', requireCustomer, async (req, res, next) => {
  try {
    const body = req.body || {};

    if (body.fullName !== undefined && !String(body.fullName).trim()) {
      throw badRequest('Full name is required');
    }
    if (body.phone !== undefined && !normalizePhilippinePhone(String(body.phone))) {
      throw badRequest('A valid Philippine mobile number is required');
    }

    const account = await updateAccount(req.customerAccount.id, body);
    return res.json({ customer: publicCustomer(account) });
  } catch (error) {
    return next(error);
  }
});

router.get('/orders', requireCustomer, async (req, res, next) => {
  try {
    const orders = await listOrders();
    const account = req.customerAccount;
    const customerOrders = orders
      .filter((order) => order.customerAccountId === account.id)
      .map((order) => ({
        orderNumber: order.orderNumber,
        placedAt: order.placedAt,
        status: order.status,
        fulfillmentStatus: order.fulfillmentStatus,
        deliveryStatus: order.deliveryStatus || 'pending',
        trackingNumber: order.trackingNumber || '',
        totalCents: order.totalCents,
        shippingFeeCents: order.shippingFeeCents,
        items: (order.items || []).map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          size: item.size,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents
        }))
      }));

    customerOrders.sort((a, b) => new Date(b.placedAt || 0) - new Date(a.placedAt || 0));
    return res.json({ orders: customerOrders });
  } catch (error) {
    return next(error);
  }
});

module.exports = { customerRouter: router, verifyCustomerTokenFromRequest: customerTokenFromRequest };
