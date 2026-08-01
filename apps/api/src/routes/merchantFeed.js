const express = require('express');
const { listCatalogProducts } = require('../products/catalogPresenter');
const {
  DEFAULT_BRAND_NAME,
  buildProductSeo,
  safeOrigin,
  variantLandingUrl,
  wordSafeText
} = require('../seo/productSeo');

const router = express.Router();

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function merchantTitle(value) {
  return wordSafeText(value, 140);
}

function supportedValue(value, allowed) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : '';
}

function buildMerchantFeedXml({ products = [], siteUrl = '' } = {}) {
  const origin = safeOrigin(siteUrl);
  const items = [];
  for (const product of products) {
    const seo = buildProductSeo(product, { origin, brandName: DEFAULT_BRAND_NAME });
    if (!seo.indexable) continue;
    const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : [{}];
    const productUrl = seo.canonical;
    const images = seo.images.map((image) => image.url);
    const title = merchantTitle(seo.feedTitle);
    const description = seo.schemaDescription;
    const color = seo.facts.color;
    const material = seo.facts.material;
    const gender = supportedValue(seo.facts.gender, ['male', 'female', 'unisex']);
    const ageGroup = supportedValue(seo.facts.ageGroup, ['newborn', 'infant', 'toddler', 'kids', 'adult']);
    for (const [index, variant] of variants.entries()) {
      const size = String(variant.size || '').trim();
      const id = String(variant.sku || variant.id || `${product.id || product.slug}-${index + 1}`).trim();
      const priceCents = Number(variant.priceCents || product.priceCents || 0);
      const stockQuantity = Math.max(0, Number(variant.stockQuantity || 0));
      const inventoryLabel = stockQuantity <= 0 ? 'inventory_out' : stockQuantity <= 2 ? 'inventory_critical' : 'inventory_available';
      if (!id || !title || !description || !images[0] || !Number.isInteger(priceCents) || priceCents <= 0) continue;
      const variantTitle = wordSafeText(size ? `${title} - Size ${size.toUpperCase()}` : title, 150);
      const variantUrl = variantLandingUrl(productUrl, size);
      const fields = [
        `<g:id>${xmlEscape(id)}</g:id>`,
        `<g:item_group_id>${xmlEscape(product.id || product.slug)}</g:item_group_id>`,
        `<g:title>${xmlEscape(variantTitle)}</g:title>`,
        `<g:description>${xmlEscape(description)}</g:description>`,
        `<g:link>${xmlEscape(variantUrl)}</g:link>`,
        `<g:image_link>${xmlEscape(new URL(images[0], `${origin}/`).toString())}</g:image_link>`,
        ...images.slice(1, 11).map((image) => `<g:additional_image_link>${xmlEscape(new URL(image, `${origin}/`).toString())}</g:additional_image_link>`),
        `<g:availability>${stockQuantity > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>`,
        `<g:custom_label_0>${inventoryLabel}</g:custom_label_0>`,
        ...(size ? [`<g:custom_label_1>size_${xmlEscape(size.toLowerCase().replaceAll(' ', '_'))}</g:custom_label_1>`] : []),
        `<g:price>${(priceCents / 100).toFixed(2)} PHP</g:price>`,
        '<g:condition>new</g:condition>',
        `<g:brand>${xmlEscape(seo.brandName)}</g:brand>`,
        `<g:product_type>${xmlEscape(product.category || product.productType || 'Apparel & Accessories > Clothing > Shirts & Tops')}</g:product_type>`,
        '<g:google_product_category>Apparel &amp; Accessories &gt; Clothing &gt; Shirts &amp; Tops</g:google_product_category>',
        ...(size ? [`<g:size>${xmlEscape(size.toUpperCase())}</g:size>`] : []),
        ...(color ? [`<g:color>${xmlEscape(color)}</g:color>`] : []),
        ...(material ? [`<g:material>${xmlEscape(material)}</g:material>`] : []),
        ...(gender ? [`<g:gender>${xmlEscape(gender)}</g:gender>`] : []),
        ...(ageGroup ? [`<g:age_group>${xmlEscape(ageGroup)}</g:age_group>`] : [])
      ];
      items.push(`    <item>\n      ${fields.join('\n      ')}\n    </item>`);
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">',
    '  <channel>',
    '    <title>Maria Clara Clothing Products</title>',
    `    <link>${xmlEscape(`${origin}/`)}</link>`,
    '    <description>Current Maria Clara Clothing product availability and prices.</description>',
    ...items,
    '  </channel>',
    '</rss>',
    ''
  ].join('\n');
}

router.get('/', async (_req, res, next) => {
  try {
    const products = await Promise.resolve(listCatalogProducts());
    const xml = buildMerchantFeedXml({ products, siteUrl: process.env.FRONTEND_URL });
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60, must-revalidate'
    });
    return res.status(200).send(xml);
  } catch (error) {
    return next(error);
  }
});

module.exports = { buildMerchantFeedXml, merchantFeedRouter: router, merchantTitle };
