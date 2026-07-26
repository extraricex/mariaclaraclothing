const { productSalesSummaries } = require('../orders/orderRepository');

const NON_SELLABLE_VARIANT_STATUSES = new Set(['deleted', 'inactive', 'archived', 'damaged', 'test']);

function nonNegativeInteger(value) {
  const number = Math.trunc(Number(value || 0));
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function variantIsSellable(variant) {
  const status = String(variant?.status || '').trim().toLowerCase();
  return variant?.active !== false
    && variant?.sellable !== false
    && !variant?.deletedAt
    && !NON_SELLABLE_VARIANT_STATUSES.has(status);
}

function calculateAvailableStock(product) {
  return Math.max(0, (product?.variants || []).reduce((sum, variant) => (
    variantIsSellable(variant)
      ? sum + nonNegativeInteger(variant.stockQuantity)
      : sum
  ), 0));
}

function normalizeGlobalSettings(settings = {}) {
  const defaults = {
    showRemainingStockGlobally: true,
    showSoldCountGlobally: true,
    defaultLowStockThreshold: 10,
    hideExactStockAboveThreshold: true,
    showInStockAboveThreshold: true,
    showNewWhenSoldCountZero: true,
    newProductPeriodDays: 30,
    soldCountFormatting: 'exact',
    includeVerifiedHistoricalSales: true
  };
  return { ...defaults, ...(settings.productCardSalesInformation || settings || {}) };
}

function normalizeProductSettings(product = {}) {
  const input = product.commerceStats && typeof product.commerceStats === 'object'
    ? product.commerceStats
    : {};
  return {
    showStockStatus: input.showStockStatus === null || input.showStockStatus === undefined
      ? null
      : Boolean(input.showStockStatus),
    lowStockThreshold: Number.isInteger(Number(input.lowStockThreshold)) && Number(input.lowStockThreshold) >= 1
      ? Number(input.lowStockThreshold)
      : null,
    showExactRemainingStock: input.showExactRemainingStock === null || input.showExactRemainingStock === undefined
      ? null
      : Boolean(input.showExactRemainingStock),
    showSoldCount: input.showSoldCount === null || input.showSoldCount === undefined
      ? null
      : Boolean(input.showSoldCount)
  };
}

function productSalesKeys(product) {
  return [...new Set([
    product?.id,
    product?.slug,
    product?.slug ? `catalog-${product.slug}` : '',
    product?.publicHandle ? `catalog-${product.publicHandle}` : ''
  ].map((value) => String(value || '').trim()).filter(Boolean))];
}

function salesSummaryForProduct(product, salesSummaries) {
  return productSalesKeys(product).reduce((total, key) => {
    const summary = salesSummaries.get(key);
    if (!summary) return total;
    return {
      eligibleQuantity: total.eligibleQuantity + nonNegativeInteger(summary.eligibleQuantity),
      refundReturnDeduction: total.refundReturnDeduction + nonNegativeInteger(summary.refundReturnDeduction)
    };
  }, { eligibleQuantity: 0, refundReturnDeduction: 0 });
}

function abbreviatedNumber(value) {
  if (value < 1000) return value.toLocaleString('en-PH');
  const units = [
    [1_000_000_000, 'B'],
    [1_000_000, 'M'],
    [1_000, 'K']
  ];
  const [divisor, suffix] = units.find(([unit]) => value >= unit);
  const rounded = Math.round((value / divisor) * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${suffix}`;
}

function soldDisplayText(quantity, formatting, showNew) {
  const sold = nonNegativeInteger(quantity);
  if (sold === 0) return showNew ? 'New' : '';
  const formatted = formatting === 'abbreviated'
    ? abbreviatedNumber(sold)
    : sold.toLocaleString('en-PH');
  return `${formatted} sold`;
}

function isRecentlyPublished(product, recalculatedAt, periodDays) {
  const publishedAt = new Date(product?.createdAt || '').valueOf();
  const current = new Date(recalculatedAt).valueOf();
  if (!Number.isFinite(publishedAt) || !Number.isFinite(current) || publishedAt > current) return false;
  return current - publishedAt <= nonNegativeInteger(periodDays) * 86_400_000;
}

function annotateOne(product, salesSummaries, settings, recalculatedAt, includeAdmin) {
  const global = normalizeGlobalSettings(settings);
  const local = normalizeProductSettings(product);
  const availableStock = calculateAvailableStock(product);
  const lowStockThreshold = local.lowStockThreshold || nonNegativeInteger(global.defaultLowStockThreshold) || 10;
  const showStockStatus = Boolean(global.showRemainingStockGlobally)
    && local.showStockStatus !== false;
  const showSoldCount = Boolean(global.showSoldCountGlobally)
    && local.showSoldCount !== false;
  const showExactRemainingStock = local.showExactRemainingStock === null
    ? !global.hideExactStockAboveThreshold
    : local.showExactRemainingStock;
  const isSoldOut = availableStock === 0;
  const isLowStock = availableStock > 0 && availableStock <= lowStockThreshold;
  const sales = salesSummaryForProduct(product, salesSummaries);
  const historicalSoldQuantity = nonNegativeInteger(product.historicalSoldQuantity);
  const displayedSoldQuantity = Math.max(0,
    sales.eligibleQuantity
      + (global.includeVerifiedHistoricalSales ? historicalSoldQuantity : 0));

  let stockDisplayText = '';
  if (showStockStatus) {
    if (isSoldOut) stockDisplayText = 'Sold out';
    else if (isLowStock) stockDisplayText = `Only ${availableStock.toLocaleString('en-PH')} left`;
    else if (showExactRemainingStock) stockDisplayText = `${availableStock.toLocaleString('en-PH')} in stock`;
    else if (global.showInStockAboveThreshold) stockDisplayText = 'In stock';
  }

  const result = {
    ...product,
    availableStock,
    isSoldOut,
    isLowStock,
    stockDisplayText,
    websiteSoldQuantity: Math.max(0, sales.eligibleQuantity),
    historicalSoldQuantity,
    displayedSoldQuantity,
    soldDisplayText: showSoldCount
      ? soldDisplayText(
        displayedSoldQuantity,
        global.soldCountFormatting,
        global.showNewWhenSoldCountZero
          && isRecentlyPublished(product, recalculatedAt, global.newProductPeriodDays)
      )
      : ''
  };

  if (includeAdmin) {
    result.commerceStats = {
      ...normalizeProductSettings(product),
      historicalSoldQuantity,
      historicalSoldSource: String(product.historicalSoldSource || ''),
      historicalSoldNote: String(product.historicalSoldNote || ''),
      historicalSoldUpdatedBy: String(product.historicalSoldUpdatedBy || ''),
      historicalSoldUpdatedAt: String(product.historicalSoldUpdatedAt || '')
    };
    result.commerceStatsCalculated = {
      currentSellableStock: availableStock,
      websiteEligibleUnitsSold: result.websiteSoldQuantity,
      refundOrReturnDeduction: Math.max(0, sales.refundReturnDeduction),
      historicalVerifiedQuantity: historicalSoldQuantity,
      finalDisplayedSoldCount: displayedSoldQuantity,
      lastRecalculatedTime: recalculatedAt
    };
  }
  return result;
}

async function annotateProductsWithCommerceStats(products, {
  settings = {},
  salesSummaries,
  includeAdmin = false,
  now = () => new Date()
} = {}) {
  const records = Array.isArray(products) ? products : [];
  const summaries = salesSummaries || await productSalesSummaries();
  const recalculatedAt = now().toISOString();
  return records.map((product) => annotateOne(
    product,
    summaries,
    settings,
    recalculatedAt,
    includeAdmin
  ));
}

module.exports = {
  abbreviatedNumber,
  annotateProductsWithCommerceStats,
  calculateAvailableStock,
  isRecentlyPublished,
  normalizeGlobalSettings,
  soldDisplayText,
  variantIsSellable
};
