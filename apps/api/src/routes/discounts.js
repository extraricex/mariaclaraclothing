const express = require('express');
const {
  computeDiscountCents,
  discountValidationError,
  findDiscountByCode
} = require('../discounts/discountRepository');
const { quoteCart } = require('../promos/promoEngine');

const router = express.Router();

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

router.post('/quote', async (req, res, next) => {
  try {
    const quote = await quoteCart(req.body || {});
    return res.json({ quote });
  } catch (error) {
    return next(error);
  }
});

module.exports = { discountRouter: router };
