const {
  computeDiscountCents,
  discountValidationError,
  findDiscountByCode,
  listDiscounts
} = require('../discounts/discountRepository');

function normalizeQuoteItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      productId: String(item?.productId || '').trim(),
      variantId: String(item?.variantId || '').trim(),
      productName: String(item?.productName || '').trim(),
      size: String(item?.size || '').trim(),
      quantity: Math.max(0, Math.round(Number(item?.quantity || 0))),
      unitPriceCents: Math.max(0, Math.round(Number(item?.unitPriceCents || 0)))
    }))
    .filter((item) => item.productId && item.variantId && item.quantity > 0);
}

async function quoteCart(input = {}) {
  const items = normalizeQuoteItems(input.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const baseShippingFeeCents = Math.max(0, Math.round(Number(input.shippingFeeCents || 0)));
  const context = {
    itemCount,
    items,
    now: input.now ? new Date(input.now) : new Date(),
    shippingFeeCents: baseShippingFeeCents,
    subtotalCents
  };

  const discountCode = String(input.discountCode || '').trim();
  let applied = null;

  if (discountCode) {
    const discount = await findDiscountByCode(discountCode);
    const validationError = validatePromoForQuote(discount, context, true);
    if (validationError) {
      const error = new Error(validationError);
      error.status = 400;
      throw error;
    }
    applied = applyDiscount(discount, context);
  } else {
    const discounts = await listDiscounts();
    const automaticPromo = selectBestAutomaticPromo(discounts, context);
    applied = automaticPromo ? applyDiscount(automaticPromo, context) : null;
  }
  const discountTotalCents = applied?.discountTotalCents || 0;
  const freeShippingUnlocked = Boolean(applied?.freeShippingApplied);
  const shippingFeeCents = freeShippingUnlocked ? 0 : baseShippingFeeCents;
  const totalCents = Math.max(0, subtotalCents - discountTotalCents + shippingFeeCents);

  return {
    items,
    itemCount,
    subtotalCents,
    discountCode: applied?.discountCode || '',
    discountTotalCents,
    discountSnapshot: applied?.discountSnapshot || {},
    shippingFeeCents,
    freeShippingUnlocked,
    totalCents
  };
}

function selectBestAutomaticPromo(discounts, context) {
  const candidates = (Array.isArray(discounts) ? discounts : [])
    .filter((discount) => discount.method === 'automatic')
    .map((discount) => {
      const validationError = validatePromoForQuote(discount, context, false);
      if (validationError) return null;
      return applyDiscount(discount, context);
    })
    .filter(Boolean);

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (b.savingsCents !== a.savingsCents) return b.savingsCents - a.savingsCents;
    return Number(b.freeShippingApplied) - Number(a.freeShippingApplied);
  });

  return candidates[0].discount;
}

function applyDiscount(discount, context) {
  if (!discount) return null;

  if (discount.type === 'buy_more_save_more') {
    return applyBuyMoreSaveMore(discount, context);
  }

  const discountTotalCents = computeStandardDiscount(discount, context.subtotalCents);
  const freeShippingApplied = discount.type === 'free_shipping';
  return buildAppliedDiscount(discount, context, {
    discountTotalCents,
    freeShippingApplied,
    rulesApplied: []
  });
}

function applyBuyMoreSaveMore(discount, context) {
  const rule = selectBestRule(discount.rules, context);
  if (!rule) return null;

  const discountTotalCents = computeRuleDiscount(rule, context.subtotalCents);
  return buildAppliedDiscount(discount, context, {
    discountTotalCents,
    freeShippingApplied: Boolean(rule.freeShipping),
    rulesApplied: [rule]
  });
}

function selectBestRule(rules, context) {
  return (Array.isArray(rules) ? rules : [])
    .filter((rule) => Number(rule.minimumQuantity || 0) <= context.itemCount)
    .filter((rule) => rule.minimumSubtotalCents === null || rule.minimumSubtotalCents === undefined || Number(rule.minimumSubtotalCents) <= context.subtotalCents)
    .map((rule) => ({
      rule,
      discountTotalCents: computeRuleDiscount(rule, context.subtotalCents)
    }))
    .sort((a, b) => {
      const aSavings = a.discountTotalCents + (a.rule.freeShipping ? context.shippingFeeCents : 0);
      const bSavings = b.discountTotalCents + (b.rule.freeShipping ? context.shippingFeeCents : 0);
      if (bSavings !== aSavings) return bSavings - aSavings;
      return Number(b.rule.freeShipping) - Number(a.rule.freeShipping);
    })[0]?.rule || null;
}

function computeStandardDiscount(discount, subtotalCents) {
  if (discount.type === 'free_shipping') return 0;
  return computeDiscountCents(discount, subtotalCents);
}

function computeRuleDiscount(rule, subtotalCents) {
  if (rule.discountType === 'percentage') {
    return Math.min(subtotalCents, Math.round((subtotalCents * Number(rule.discountValue || 0)) / 100));
  }
  return Math.min(subtotalCents, Math.max(0, Math.round(Number(rule.discountValueCents || 0))));
}

function buildAppliedDiscount(discount, context, applied) {
  const discountTotalCents = Math.min(context.subtotalCents, Math.max(0, Math.round(Number(applied.discountTotalCents || 0))));
  const freeShippingApplied = Boolean(applied.freeShippingApplied);
  const savingsCents = discountTotalCents + (freeShippingApplied ? context.shippingFeeCents : 0);

  if (savingsCents <= 0) return null;

  return {
    discount,
    discountCode: discount.code || '',
    discountTotalCents,
    freeShippingApplied,
    savingsCents,
    discountSnapshot: {
      promoId: discount.code || '',
      code: discount.method === 'code' ? discount.code || '' : '',
      name: discount.name || discount.code || 'Discount',
      type: discount.type,
      method: discount.method || 'code',
      discountType: discount.type === 'buy_more_save_more' ? applied.rulesApplied?.[0]?.discountType || '' : discount.type,
      discountAmountCents: discountTotalCents,
      freeShippingApplied,
      rulesApplied: applied.rulesApplied || []
    }
  };
}

function validatePromoForQuote(discount, context, requireCodePromo) {
  const basicValidation = discountValidationError(discount, context.subtotalCents);
  if (basicValidation) return basicValidation;

  if (requireCodePromo && discount.method === 'automatic') {
    return 'Discount code is invalid';
  }

  if (!isPromoInDateWindow(discount, context.now)) {
    return 'Discount code has expired';
  }

  if (discount.minimumQuantity !== null && discount.minimumQuantity !== undefined && context.itemCount < Number(discount.minimumQuantity)) {
    return 'Cart quantity is below the minimum for this promo';
  }

  if (discount.type === 'buy_more_save_more' && !selectBestRule(discount.rules, context)) {
    return 'Cart quantity is below the minimum for this promo';
  }

  return null;
}

function isPromoInDateWindow(discount, now) {
  const currentTime = now instanceof Date ? now.getTime() : Date.now();
  if (discount.startsAt && new Date(discount.startsAt).getTime() > currentTime) return false;
  if (discount.endsAt && new Date(discount.endsAt).getTime() < currentTime) return false;
  return true;
}

module.exports = {
  applyDiscount,
  normalizeQuoteItems,
  quoteCart,
  selectBestAutomaticPromo
};
