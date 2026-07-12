const OVERSIZED_DESCRIPTION = 'Premium oversized shirt made with 240 GSM cotton fabric. Designed for a relaxed streetwear fit with a clean and comfortable feel. Proudly made in the Philippines.';

const OVERSIZED_DETAILS = [
  'Fit: Oversized Fit',
  'Fabric: Premium Cotton',
  'Thickness: 240 GSM',
  'Neckline: Crew Neck',
  'Quality: Premium quality cotton fabric',
  'Made in: Philippines',
  'Style: Streetwear / Everyday Wear',
  'Feel: Comfortable, breathable, and durable'
].join('\n');

const OVERSIZED_SHIPPING = [
  'Metro Manila: Delivered within 2 to 3 days',
  'Outside Metro Manila / Luzon: Delivered within 3 to 5 days',
  'Visayas and Mindanao: Delivered within 6 to 8 days',
  'Orders are prepared for packing and shipping after checkout completion'
].join('\n');

const OVERSIZED_SIZE_CHART = [
  { size: 'Small', width: '21', length: '28.5', sleeveLength: '14.5', shoulderDropLength: '7' },
  { size: 'Medium', width: '22', length: '29.5', sleeveLength: '15.5', shoulderDropLength: '8' },
  { size: 'Large', width: '23', length: '30.5', sleeveLength: '16.5', shoulderDropLength: '8' },
  { size: 'XLarge', width: '24', length: '31', sleeveLength: '17.5', shoulderDropLength: '8' },
  { size: '2XLarge', width: '25', length: '32', sleeveLength: '18.5', shoulderDropLength: '8.5' }
];

function text(value) {
  if (Array.isArray(value)) return value.map(text).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(text).join(' ');
  return String(value || '');
}

function isOversizedProduct(product) {
  const identity = [
    product?.name,
    product?.category,
    product?.productType,
    product?.tags,
    product?.collections,
    product?.productPage?.heading
  ].map(text).join(' ').toLowerCase();
  if (/\b(crop|cropped|crop box|pants?|shorts?|regular fit)\b/i.test(identity)) return false;

  const evidence = [
    identity,
    product?.description,
    product?.productPage?.intro,
    product?.productPage?.detailsText,
    product?.productPage?.sections
  ].map(text).join(' ').toLowerCase();
  if (/\b(?:crop|cropped)[ -]?(?:box|top|tee|shirt)\b|\bregular fit\b/i.test(evidence)) return false;
  return /\boversized\b|\boversize fit\b/i.test(evidence);
}

function applyOversizedProductTemplate(product) {
  if (!isOversizedProduct(product)) return product;
  const previousPage = product.productPage && typeof product.productPage === 'object' ? product.productPage : {};
  const { sizeChartImageUrl: _oldSizeChartImageUrl, ...page } = previousPage;
  return {
    ...product,
    description: OVERSIZED_DESCRIPTION,
    productPage: {
      ...page,
      heading: product.name,
      intro: OVERSIZED_DESCRIPTION,
      detailsText: OVERSIZED_DETAILS,
      shippingText: OVERSIZED_SHIPPING,
      sizeChart: OVERSIZED_SIZE_CHART.map((row) => ({ ...row })),
      sections: [
        { title: 'Product details', body: OVERSIZED_DETAILS },
        { title: 'Size Chart', items: OVERSIZED_SIZE_CHART.map((row) => `${row.size}: Width ${row.width}, Length ${row.length}, Sleeve length ${row.sleeveLength}, Shoulder drop length ${row.shoulderDropLength}`) },
        { title: 'Shipping', body: OVERSIZED_SHIPPING }
      ]
    }
  };
}

module.exports = {
  OVERSIZED_DESCRIPTION,
  OVERSIZED_DETAILS,
  OVERSIZED_SHIPPING,
  OVERSIZED_SIZE_CHART,
  applyOversizedProductTemplate,
  isOversizedProduct
};
