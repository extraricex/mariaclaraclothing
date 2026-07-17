const express = require('express');
const { listCatalogProducts } = require('../products/catalogPresenter');
const { plainText, productPath, storefrontOrigin } = require('../seo/storefrontSeo');

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
  const title = plainText(value, 140);
  if (!title || title !== title.toUpperCase()) return title;
  return title.toLowerCase().replace(/(^|[\s\-/])([a-z])/g, (_match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function firstMetafield(product, ...keys) {
  for (const key of keys) {
    const value = product?.metafields?.[key];
    const candidate = Array.isArray(value) ? value[0] : value;
    if (String(candidate || '').trim()) return String(candidate).trim();
  }
  return '';
}

function buildMerchantFeedXml({ products = [], siteUrl = '' } = {}) {
  const origin = storefrontOrigin(siteUrl);
  const items = [];
  for (const product of products) {
    const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : [{}];
    const productUrl = `${origin}${productPath(product)}`;
    const images = (product.images || []).map((image) => String(image?.url || '').trim()).filter(Boolean);
    const title = merchantTitle(product.name);
    const description = plainText(product.seo?.description || product.description || product.productPage?.intro, 5000);
    const color = firstMetafield(product, 'color', 'colour');
    const gender = firstMetafield(product, 'gender');
    const ageGroup = firstMetafield(product, 'age_group', 'ageGroup');
    for (const [index, variant] of variants.entries()) {
      const size = String(variant.size || '').trim();
      const id = String(variant.sku || variant.id || `${product.id || product.slug}-${index + 1}`).trim();
      const priceCents = Number(variant.priceCents || product.priceCents || 0);
      if (!id || !title || !description || !images[0] || !Number.isInteger(priceCents) || priceCents <= 0) continue;
      const fields = [
        `<g:id>${xmlEscape(id)}</g:id>`,
        `<g:item_group_id>${xmlEscape(product.id || product.slug)}</g:item_group_id>`,
        `<title>${xmlEscape(size ? `${title} - Size ${size.toUpperCase()}` : title)}</title>`,
        `<description>${xmlEscape(description)}</description>`,
        `<link>${xmlEscape(productUrl)}</link>`,
        `<g:image_link>${xmlEscape(new URL(images[0], `${origin}/`).toString())}</g:image_link>`,
        ...images.slice(1, 11).map((image) => `<g:additional_image_link>${xmlEscape(new URL(image, `${origin}/`).toString())}</g:additional_image_link>`),
        `<g:availability>${Number(variant.stockQuantity || 0) > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>`,
        `<g:price>${(priceCents / 100).toFixed(2)} PHP</g:price>`,
        '<g:condition>new</g:condition>',
        '<g:brand>Maria Clara Clothing</g:brand>',
        `<g:product_type>${xmlEscape(product.category || product.productType || 'Apparel & Accessories > Clothing > Shirts & Tops')}</g:product_type>`,
        '<g:google_product_category>Apparel &amp; Accessories &gt; Clothing &gt; Shirts &amp; Tops</g:google_product_category>',
        ...(size ? [`<g:size>${xmlEscape(size.toUpperCase())}</g:size>`] : []),
        ...(color ? [`<g:color>${xmlEscape(color)}</g:color>`] : []),
        ...(gender ? [`<g:gender>${xmlEscape(gender.toLowerCase())}</g:gender>`] : []),
        ...(ageGroup ? [`<g:age_group>${xmlEscape(ageGroup.toLowerCase())}</g:age_group>`] : [])
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
      'Cache-Control': 'public, max-age=900, stale-while-revalidate=3600'
    });
    return res.status(200).send(xml);
  } catch (error) {
    return next(error);
  }
});

module.exports = { buildMerchantFeedXml, merchantFeedRouter: router, merchantTitle };
