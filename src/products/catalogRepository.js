const fs = require('node:fs');
const path = require('node:path');
const { hasDatabaseUrl, query, transaction } = require('../db/postgres');

const productsPath = path.join(__dirname, '..', '..', 'data', 'products.json');
const editableProducts = loadEditableProducts(productsPath);
const catalogProducts = editableProducts.map(toCatalogProduct);

function activeProductsPath() {
  return process.env.PRODUCTS_DATA_FILE || productsPath;
}

function usePostgresProducts() {
  return hasDatabaseUrl() && !process.env.PRODUCTS_DATA_FILE;
}

function loadEditableProducts(filePath = activeProductsPath()) {
  const products = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  validateProducts(products);
  return products;
}

function listEditableProducts() {
  if (usePostgresProducts()) {
    return listPostgresProducts();
  }
  return loadEditableProducts();
}

function listCatalogProducts() {
  const products = listEditableProducts();
  if (isPromise(products)) {
    return products.then(toVisibleCatalogProducts);
  }
  return toVisibleCatalogProducts(products);
}

function toVisibleCatalogProducts(products) {
  return products
    .filter((product) => !['draft', 'archived'].includes(product.status))
    .map(toCatalogProduct);
}

function findEditableProductBySlug(slug) {
  if (usePostgresProducts()) {
    return listPostgresProducts(String(slug || '').trim()).then((products) => products[0] || null);
  }
  return loadEditableProducts().find((product) => product.slug === slug) || null;
}

function findCatalogProductBySlug(slug) {
  const product = findEditableProductBySlug(slug);
  if (isPromise(product)) {
    return product.then((record) => (!record || ['draft', 'archived'].includes(record.status)) ? null : toCatalogProduct(record));
  }
  if (!product || ['draft', 'archived'].includes(product.status)) return null;
  return toCatalogProduct(product);
}

function saveEditableProduct(product, originalSlug = '') {
  const normalized = normalizeEditableProduct(product);

  if (usePostgresProducts()) {
    return transaction(async (client) => {
      await savePostgresProduct(client, normalized);
      if (originalSlug && originalSlug !== normalized.slug) {
        await client.query('DELETE FROM products WHERE slug = $1', [originalSlug]);
      }
    }).then(() => normalized);
  }

  const products = loadEditableProducts();
  const index = products.findIndex((item) => item.slug === (originalSlug || normalized.slug));

  if (index >= 0) {
    products[index] = normalized;
  } else {
    products.push(normalized);
  }

  writeEditableProducts(products);
  return normalized;
}

function deleteEditableProduct(slug) {
  if (usePostgresProducts()) {
    return Promise.resolve(findEditableProductBySlug(slug)).then(async (product) => {
      if (!product) return null;
      await query('DELETE FROM products WHERE slug = $1', [slug]);
      return product;
    });
  }

  const products = loadEditableProducts();
  const index = products.findIndex((product) => product.slug === slug);

  if (index === -1) {
    return null;
  }

  const [deletedProduct] = products.splice(index, 1);
  writeEditableProducts(products);
  return deletedProduct;
}

function replaceEditableProducts(products) {
  const normalizedProducts = products.map(normalizeEditableProduct);

  if (usePostgresProducts()) {
    return transaction(async (client) => {
      await client.query('DELETE FROM products');
      for (const product of normalizedProducts) {
        await savePostgresProduct(client, product);
      }
    }).then(() => normalizedProducts);
  }

  writeEditableProducts(normalizedProducts);
  return normalizedProducts;
}

function writeEditableProducts(products, filePath = activeProductsPath()) {
  validateProducts(products);
  fs.writeFileSync(filePath, `${JSON.stringify(products, null, 2)}\n`);
}

function isPromise(value) {
  return value && typeof value.then === 'function';
}

function normalizeEditableProduct(product) {
  const name = String(product.name || '').trim();
  const slug = String(product.slug || slugify(name)).trim();
  const collections = normalizeStringList(product.collections || product.collection || 'Uncategorized');
  const images = normalizeImages(product.images, name);
  const variants = normalizeVariants(product.variants, slug);
  const status = normalizeStatus(product.status);
  const category = String(product.category || collections[0] || 'T-Shirts').trim();

  return {
    ...product,
    slug,
    name,
    description: String(product.description || ''),
    collections,
    category,
    productType: String(product.productType || product.type || 'Tshirt').trim(),
    vendor: String(product.vendor || 'Maria Clara').trim(),
    tags: normalizeOptionalStringList(product.tags),
    seo: normalizeSeo(product.seo, name, slug, product.description),
    metafields: normalizeMetafields(product.metafields),
    themeTemplate: String(product.themeTemplate || 'Default product').trim(),
    priceCents: normalizeMoneyCents(product.priceCents),
    compareAtPriceCents: product.compareAtPriceCents === '' || product.compareAtPriceCents === undefined ? null : normalizeMoneyCents(product.compareAtPriceCents),
    merchandisingStatus: product.merchandisingStatus || (variants.some((variant) => Number(variant.stockQuantity) > 0) ? 'sale' : 'sold_out'),
    status,
    featured: Boolean(product.featured),
    images,
    variants,
    productPage: normalizeProductPage(product.productPage, name)
  };
}

function validateProducts(products) {
  if (!Array.isArray(products)) {
    throw new Error('Product catalog must be an array.');
  }

  const slugs = new Set();
  products.forEach((product, index) => {
    requireString(product.slug, `products[${index}].slug`);
    requireString(product.name, `products[${index}].name`);
    requireString(product.description, `products[${index}].description`);
    requirePositiveNumber(product.priceCents, `products[${index}].priceCents`);

    if (product.compareAtPriceCents !== null && product.compareAtPriceCents !== undefined) {
      requirePositiveNumber(product.compareAtPriceCents, `products[${index}].compareAtPriceCents`);
    }

    if (slugs.has(product.slug)) {
      throw new Error(`Duplicate product slug: ${product.slug}`);
    }
    slugs.add(product.slug);

    if (!Array.isArray(product.collections) || product.collections.length < 1) {
      throw new Error(`products[${index}].collections must include at least one collection.`);
    }

    if (!Array.isArray(product.images) || product.images.length < 1) {
      throw new Error(`products[${index}].images must include at least one image.`);
    }

    product.images.forEach((image, imageIndex) => {
      requireString(image.url, `products[${index}].images[${imageIndex}].url`);
      requireString(image.altText, `products[${index}].images[${imageIndex}].altText`);
      requireNonNegativeNumber(image.sortOrder, `products[${index}].images[${imageIndex}].sortOrder`);
    });

    if (product.productPage) {
      validateProductPage(product.productPage, `products[${index}].productPage`);
    }

    if (!Array.isArray(product.variants) || product.variants.length < 1) {
      throw new Error(`products[${index}].variants must include at least one variant.`);
    }

    product.variants.forEach((variant, variantIndex) => {
      requireString(variant.size, `products[${index}].variants[${variantIndex}].size`);
      requireString(variant.sku, `products[${index}].variants[${variantIndex}].sku`);
      requireNonNegativeNumber(variant.stockQuantity, `products[${index}].variants[${variantIndex}].stockQuantity`);
    });
  });
}

function toCatalogProduct(product) {
  const imageRecords = [...product.images]
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  const images = imageRecords.map((image) => image.url);
  const variants = product.variants.map((variant) => ({
    size: variant.size,
    sku: variant.sku,
    priceCents: variant.priceCents || null,
    available: Number(variant.stockQuantity) > 0,
    stockQuantity: Number(variant.stockQuantity),
    externalPosVariantId: variant.externalPosVariantId || ''
  }));
  const status = product.merchandisingStatus || (variants.some((variant) => variant.available) ? 'sale' : 'sold_out');

  return {
    slug: product.slug,
    name: product.name,
    collection: product.collections[0],
    collections: product.collections,
    description: product.description,
    price: product.priceCents,
    compareAtPrice: product.compareAtPriceCents,
    status,
    featured: Boolean(product.featured),
    image: images[0],
    images,
    imageRecords,
    productPage: product.productPage || null,
    variants
  };
}

async function listPostgresProducts(slug = '') {
  const values = [];
  let where = '';

  if (slug) {
    values.push(slug);
    where = 'WHERE slug = $1';
  }

  const productResult = await query(`SELECT * FROM products ${where} ORDER BY name ASC`, values);
  const products = productResult.rows.map(fromPostgresProduct);

  if (!products.length) return [];

  const slugs = products.map((product) => product.slug);
  const imageResult = await query(
    'SELECT * FROM product_images WHERE product_slug = ANY($1::text[]) ORDER BY sort_order ASC, id ASC',
    [slugs]
  );
  const variantResult = await query(
    'SELECT * FROM product_variants WHERE product_slug = ANY($1::text[]) ORDER BY id ASC',
    [slugs]
  );

  const imagesBySlug = groupByProductSlug(imageResult.rows.map(fromPostgresImage));
  const variantsBySlug = groupByProductSlug(variantResult.rows.map(fromPostgresVariant));

  return products.map((product) => ({
    ...product,
    images: imagesBySlug.get(product.slug) || [],
    variants: variantsBySlug.get(product.slug) || []
  }));
}

async function savePostgresProduct(client, product) {
  await client.query(
    `INSERT INTO products (
      slug, name, description, collections, price_cents, compare_at_price_cents,
      merchandising_status, status, featured, category, product_type, vendor, tags, seo,
      metafields, theme_template, product_page, updated_at
    ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, $16, $17::jsonb, now())
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      collections = EXCLUDED.collections,
      price_cents = EXCLUDED.price_cents,
      compare_at_price_cents = EXCLUDED.compare_at_price_cents,
      merchandising_status = EXCLUDED.merchandising_status,
      status = EXCLUDED.status,
      featured = EXCLUDED.featured,
      category = EXCLUDED.category,
      product_type = EXCLUDED.product_type,
      vendor = EXCLUDED.vendor,
      tags = EXCLUDED.tags,
      seo = EXCLUDED.seo,
      metafields = EXCLUDED.metafields,
      theme_template = EXCLUDED.theme_template,
      product_page = EXCLUDED.product_page,
      updated_at = now()`,
    [
      product.slug,
      product.name,
      product.description,
      JSON.stringify(product.collections),
      product.priceCents,
      product.compareAtPriceCents,
      product.merchandisingStatus,
      product.status,
      product.featured,
      product.category,
      product.productType,
      product.vendor,
      JSON.stringify(product.tags || []),
      JSON.stringify(product.seo || {}),
      JSON.stringify(product.metafields || {}),
      product.themeTemplate,
      JSON.stringify(product.productPage || null)
    ]
  );

  await client.query('DELETE FROM product_images WHERE product_slug = $1', [product.slug]);
  for (const image of product.images) {
    await client.query(
      'INSERT INTO product_images (product_slug, url, alt_text, sort_order) VALUES ($1, $2, $3, $4)',
      [product.slug, image.url, image.altText, image.sortOrder]
    );
  }

  await client.query('DELETE FROM product_variants WHERE product_slug = $1', [product.slug]);
  for (const variant of product.variants) {
    await client.query(
      'INSERT INTO product_variants (product_slug, size, sku, price_cents, stock_quantity, external_pos_variant_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [product.slug, variant.size, variant.sku, variant.priceCents || null, variant.stockQuantity, variant.externalPosVariantId || '']
    );
  }
}

function fromPostgresProduct(row) {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    collections: row.collections || [],
    priceCents: row.price_cents,
    compareAtPriceCents: row.compare_at_price_cents,
    merchandisingStatus: row.merchandising_status,
    status: row.status,
    featured: row.featured,
    category: row.category || 'T-Shirts',
    productType: row.product_type || 'Tshirt',
    vendor: row.vendor || 'Maria Clara',
    tags: row.tags || [],
    seo: row.seo || {},
    metafields: row.metafields || {},
    themeTemplate: row.theme_template || 'Default product',
    productPage: row.product_page || null,
    images: [],
    variants: []
  };
}

function fromPostgresImage(row) {
  return {
    productSlug: row.product_slug,
    url: row.url,
    altText: row.alt_text,
    sortOrder: row.sort_order
  };
}

function fromPostgresVariant(row) {
  return {
    productSlug: row.product_slug,
    size: row.size,
    sku: row.sku,
    priceCents: row.price_cents,
    stockQuantity: row.stock_quantity,
    externalPosVariantId: row.external_pos_variant_id || ''
  };
}

function groupByProductSlug(records) {
  const groups = new Map();
  records.forEach((record) => {
    const productSlug = record.productSlug;
    const cleanRecord = { ...record };
    delete cleanRecord.productSlug;
    groups.set(productSlug, [...(groups.get(productSlug) || []), cleanRecord]);
  });
  return groups;
}

function normalizeImages(images, productName) {
  const records = Array.isArray(images) ? images : [];
  const normalized = records
    .map((image, index) => ({
      url: String(image.url || image).trim(),
      altText: String(image.altText || productName || 'Product image').trim(),
      sortOrder: Number.isInteger(Number(image.sortOrder)) ? Number(image.sortOrder) : index
    }))
    .filter((image) => image.url);

  return normalized.length ? normalized : [{
    url: '/product/3.png',
    altText: productName || 'Product image',
    sortOrder: 0
  }];
}

function normalizeVariants(variants, slug) {
  const records = Array.isArray(variants) && variants.length ? variants : [
    { size: 'Small', sku: `${slug}-S`, stockQuantity: 0 }
  ];

  return records.map((variant, index) => {
    const size = String(variant.size || `Size ${index + 1}`).trim();
    return {
      size,
      sku: String(variant.sku || `${slug}-${size}`).trim(),
      priceCents: variant.priceCents === '' || variant.priceCents === null || variant.priceCents === undefined
        ? null
        : normalizeMoneyCents(variant.priceCents),
      stockQuantity: normalizeInventory(variant.stockQuantity),
      externalPosVariantId: String(variant.externalPosVariantId || '').trim()
    };
  });
}

function normalizeProductPage(productPage, productName) {
  if (productPage) return productPage;
  return {
    heading: productName || 'Product details',
    intro: 'Premium Maria Clara Clothing piece with everyday comfort and clean styling.',
    sections: [
      {
        title: 'Product details',
        items: ['Comfortable fit', 'Easy to style', 'Ready for everyday wear']
      }
    ]
  };
}

function normalizeStringList(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  const normalized = values.map((item) => String(item || '').trim()).filter(Boolean);
  return normalized.length ? normalized : ['Uncategorized'];
}

function normalizeOptionalStringList(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return values.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeSeo(seo, name, slug, description) {
  const record = seo && typeof seo === 'object' ? seo : {};
  return {
    title: String(record.title || name || '').trim(),
    description: String(record.description || description || '').trim(),
    handle: String(record.handle || slug || '').trim()
  };
}

function normalizeMetafields(metafields) {
  const record = metafields && typeof metafields === 'object' ? metafields : {};
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [
    key,
    normalizeOptionalStringList(value)
  ]));
}

function normalizeStatus(value) {
  const status = String(value || 'active').trim().toLowerCase();
  return ['active', 'draft', 'archived'].includes(status) ? status : 'active';
}

function normalizeMoneyCents(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 100;
}

function normalizeInventory(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function slugify(value) {
  return String(value || 'product')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'product';
}

function validateProductPage(productPage, field) {
  requireString(productPage.heading, `${field}.heading`);
  requireString(productPage.intro, `${field}.intro`);

  if (!Array.isArray(productPage.sections) || productPage.sections.length < 1) {
    throw new Error(`${field}.sections must include at least one section.`);
  }

  productPage.sections.forEach((section, index) => {
    requireString(section.title, `${field}.sections[${index}].title`);
    if (section.body !== undefined) {
      requireString(section.body, `${field}.sections[${index}].body`);
    }
    if (section.items !== undefined) {
      if (!Array.isArray(section.items) || section.items.length < 1) {
        throw new Error(`${field}.sections[${index}].items must include at least one item.`);
      }
      section.items.forEach((item, itemIndex) => {
        requireString(item, `${field}.sections[${index}].items[${itemIndex}]`);
      });
    }
  });

  if (productPage.sizeChartImageUrl !== undefined) {
    requireString(productPage.sizeChartImageUrl, `${field}.sizeChartImageUrl`);
  }

  if (productPage.mediaLimit !== undefined) {
    requirePositiveNumber(productPage.mediaLimit, `${field}.mediaLimit`);
  }

  if (productPage.soldOutText !== undefined) {
    requireString(productPage.soldOutText, `${field}.soldOutText`);
  }
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string.`);
  }
}

function requirePositiveNumber(value, field) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
}

function requireNonNegativeNumber(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
}

module.exports = {
  catalogProducts,
  editableProducts,
  deleteEditableProduct,
  findCatalogProductBySlug,
  findEditableProductBySlug,
  listCatalogProducts,
  listEditableProducts,
  loadEditableProducts,
  normalizeEditableProduct,
  productsPath,
  replaceEditableProducts,
  saveEditableProduct,
  validateProducts
};
