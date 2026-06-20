const express = require('express');
const {
  computeDiscountCents,
  discountValidationError,
  findDiscountByCode,
  listDiscounts
} = require('../discounts/discountRepository');
const { quoteCart } = require('../promos/promoEngine');

const router = express.Router();

function isNotificationPromoEligible(discount, now = new Date()) {
  if (!discount || discount.status !== 'active') return false;
  const currentTime = now.getTime();
  if (discount.startsAt && new Date(discount.startsAt).getTime() > currentTime) return false;
  if (discount.endsAt && new Date(discount.endsAt).getTime() < currentTime) return false;
  if (discount.usageLimit !== null && discount.usageLimit !== undefined && Number(discount.usageCount || 0) >= Number(discount.usageLimit)) return false;
  return true;
}

function notificationFromPromo(discount) {
  if (!discount) return null;
  return {
    promoId: discount.code || '',
    text: discount.bannerText || 'Buy More Save More Promo',
    name: discount.name || discount.code || 'Promo',
    type: discount.type || 'promotion',
    method: discount.method || 'code'
  };
}

function notificationPriority(discount) {
  return Math.max(0, Math.round(Number(discount?.priority) || 0));
}

function notificationUpdatedAt(discount) {
  return new Date(discount?.updatedAt || discount?.createdAt || 0).getTime() || 0;
}

router.post('/validate', async (req, res, next) => {
  try {
    const code = String(req.body?.code || '').trim();
    const subtotalCents = Math.max(0, Number(req.body?.subtotalCents || 0));

    if (!code) {
      const error = new Error('Discount code is required');
      error.status = 400;
      throw error;
    }

    const discount = await findDiscountByCode(code);
    const validationError = discountValidationError(discount, subtotalCents);

    if (validationError) {
      const error = new Error(validationError);
      error.status = 400;
      throw error;
    }

    return res.json({
      discount: {
        code: discount.code,
        type: discount.type,
        value: discount.value,
        discountTotalCents: computeDiscountCents(discount, subtotalCents)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/active-notification', async (_req, res, next) => {
  try {
    const discounts = await listDiscounts();
    const activePromo = (Array.isArray(discounts) ? discounts : [])
      .filter((discount) => isNotificationPromoEligible(discount))
      .sort((a, b) => {
        const priorityDifference = notificationPriority(b) - notificationPriority(a);
        if (priorityDifference !== 0) return priorityDifference;
        return notificationUpdatedAt(b) - notificationUpdatedAt(a);
      })[0];

    return res.json({ notification: notificationFromPromo(activePromo) });
  } catch (error) {
    return next(error);
  }
});

router.post('/quote', async (req, res, next) => {
  try {
    const quote = await quoteCart(req.body || {});
    return res.json({ quote });
  } catch (error) {
    return next(error);
  }
});

module.exports = { discountRouter: router };
