const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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
  const normalized = products.map(normalizeEditableProduct);
  validateProducts(normalized);
  validateProductRoutes(normalized);
  return normalized;
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
  const identifier = normalizeRouteIdentifier(slug);
  const product = usePostgresProducts()
    ? resolvePostgresProduct(identifier)
    : loadEditableProducts().find((candidate) => productMatchesRoute(candidate, identifier)) || null;
  if (isPromise(product)) {
    return product.then((record) => (!record || ['draft', 'archived'].includes(record.status)) ? null : toCatalogProduct(record));
  }
  if (!product || ['draft', 'archived'].includes(product.status)) return null;
  return toCatalogProduct(product);
}

function saveEditableProduct(product, originalSlug = '') {
  let normalized = normalizeEditableProduct(product);
  if (originalSlug && String(originalSlug).trim() !== normalized.slug) {
    const error = new Error('Internal product IDs cannot be changed. Edit the public handle instead.');
    error.status = 400;
    throw error;
  }

  if (usePostgresProducts()) {
    return transaction(async (client) => {
      await savePostgresProduct(client, normalized);
    }).then(() => findEditableProductBySlug(normalized.slug));
  }

  const products = loadEditableProducts();
  const index = products.findIndex((item) => item.slug === (originalSlug || normalized.slug));
  if (index < 0 && !normalized.createdAt) {
    normalized = normalizeEditableProduct({ ...normalized, createdAt: new Date().toISOString() });
  }

  if (index >= 0) {
    const previous = products[index];
    products[index] = normalizeEditableProduct({
      ...normalized,
      urlAliases: [
        ...(previous.urlAliases || []),
        previous.publicHandle,
        previous.slug,
        ...(normalized.urlAliases || [])
      ]
    });
  } else {
    products.push(normalized);
  }

  validateProductRoutes(products);
  writeEditableProducts(products);
  return products[index >= 0 ? index : products.length - 1];
}

function deleteEditableProduct(slug) {
  return archiveEditableProduct(slug);
}

async function archiveEditableProduct(slug) {
  const product = await Promise.resolve(findEditableProductBySlug(slug));
  if (!product) return null;
  return saveEditableProduct({ ...product, status: 'archived', featured: false }, slug);
}

async function restoreEditableProduct(slug) {
  const product = await Promise.resolve(findEditableProductBySlug(slug));
  if (!product) return null;
  return saveEditableProduct({ ...product, status: 'draft', featured: false }, slug);
}

async function saveEditableProductsBatch(products) {
  const normalizedProducts = products.map(normalizeEditableProduct);
  const catalog = await Promise.resolve(listEditableProducts());
  const bySlug = new Map(catalog.map((product) => [product.slug, product]));
  normalizedProducts.forEach((product) => {
    const previous = bySlug.get(product.slug);
    bySlug.set(product.slug, normalizeEditableProduct({
      ...product,
      urlAliases: previous ? [
        ...(previous.urlAliases || []),
        previous.publicHandle,
        previous.slug,
        ...(product.urlAliases || [])
      ] : product.urlAliases
    }));
  });
  const nextCatalog = [...bySlug.values()];
  validateProducts(nextCatalog);
  validateProductRoutes(nextCatalog);
  const changedProducts = normalizedProducts.map((product) => bySlug.get(product.slug));

  if (usePostgresProducts()) {
    await transaction(async (client) => {
      for (const product of changedProducts) {
        await savePostgresProduct(client, product);
      }
    });
    return Promise.all(changedProducts.map((product) => findEditableProductBySlug(product.slug)));
  }

  writeEditableProducts(nextCatalog);
  return changedProducts;
}

function replaceEditableProducts(products) {
  const normalizedProducts = products.map(normalizeEditableProduct);
  validateProductRoutes(normalizedProducts);

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
  validateProductRoutes(products.map(normalizeEditableProduct));
  fs.writeFileSync(filePath, `${JSON.stringify(products, null, 2)}\n`);
}

function deductionSoldOutError(item) {
  const error = new Error(`${item.size} is sold out for ${item.productName || item.slug}`);
  error.status = 409;
  return error;
}

function deductVariantStock(items, options = {}) {
  // Match on sku (stored verbatim and unique), NOT size: the storefront/presenter
  // abbreviates size (Large -> l) while product_variants.size keeps the full label, so
  // size cannot be matched against the stored row. `size` is kept only for the error copy.
  const deductions = aggregateStockItems((Array.isArray(items) ? items : []).map((item) => ({
    slug: String(item.slug || '').trim(),
    sku: String(item.sku || '').trim(),
    size: String(item.size || '').trim(),
    quantity: Number(item.quantity),
    productName: String(item.productName || '').trim()
  })));

  if (usePostgresProducts()) {
    return deductPostgresVariantStock(deductions, options.client);
  }
  return deductJsonVariantStock(deductions);
}

function aggregateStockItems(items) {
  const bySku = new Map();
  for (const item of items) {
    const key = item.sku || `${item.slug}\u0000${item.size}`;
    if (!key) continue;
    const existing = bySku.get(key);
    if (existing) {
      existing.quantity += Number(item.quantity || 0);
    } else {
      bySku.set(key, { ...item, quantity: Number(item.quantity || 0) });
    }
  }
  return [...bySku.values()].filter((item) => item.sku && item.quantity > 0);
}

function restockVariantStock(items, options = {}) {
  const restocks = (Array.isArray(items) ? items : []).map((item) => ({
    slug: String(item.slug || '').trim(),
    sku: String(item.sku || '').trim(),
    quantity: Number(item.quantity)
  })).filter((item) => item.sku && item.quantity > 0);

  if (usePostgresProducts()) {
    return restockPostgresVariantStock(restocks, options.client);
  }
  return restockJsonVariantStock(restocks);
}

function deductJsonVariantStock(items) {
  const products = loadEditableProducts();
  const targets = items.map((item) => {
    const product = products.find((candidate) => candidate.slug === item.slug);
    const variant = product?.variants.find((candidate) => candidate.sku === item.sku);
    if (!variant || Number(variant.stockQuantity) < item.quantity) {
      throw deductionSoldOutError(item);
    }
    return variant;
  });
  targets.forEach((variant, index) => {
    variant.stockQuantity = Number(variant.stockQuantity) - items[index].quantity;
  });
  writeEditableProducts(products);
}

function restockJsonVariantStock(items) {
  const products = loadEditableProducts();
  items.forEach((item) => {
    const product = products.find((candidate) => candidate.slug === item.slug);
    const variant = product?.variants.find((candidate) => candidate.sku === item.sku);
    if (variant) {
      variant.stockQuantity = Number(variant.stockQuantity || 0) + item.quantity;
    }
  });
  writeEditableProducts(products);
}

function deductPostgresVariantStock(items, transactionClient) {
  const deduct = async (client) => {
    for (const item of items) {
      const result = await client.query(
        `UPDATE product_variants
            SET stock_quantity = stock_quantity - $1
          WHERE sku = $2 AND stock_quantity >= $1`,
        [item.quantity, item.sku]
      );
      if (result.rowCount === 0) {
        throw deductionSoldOutError(item);
      }
    }
  };
  return transactionClient ? deduct(transactionClient) : transaction(deduct);
}

function restockPostgresVariantStock(items, transactionClient) {
  const restock = async (client) => {
    for (const item of items) {
      await client.query(
        `UPDATE product_variants
            SET stock_quantity = stock_quantity + $1
          WHERE sku = $2`,
        [item.quantity, item.sku]
      );
    }
  };
  return transactionClient ? restock(transactionClient) : transaction(restock);
}

function isPromise(value) {
  return value && typeof value.then === 'function';
}

function normalizeEditableProduct(product) {
  const name = String(product.name || '').trim();
  const slug = String(product.slug || slugify(name)).trim();
  const publicHandle = normalizePublicHandle(product.publicHandle || product.seo?.handle, name || slug);
  const urlAliases = normalizeUrlAliases(product.urlAliases, slug, publicHandle);
  const collections = normalizeStringList(product.collections || product.collection || 'Uncategorized');
  const images = normalizeImages(product.images, name);
  const variants = normalizeVariants(product.variants, slug);
  const status = normalizeStatus(product.status);
  const category = String(product.category || collections[0] || 'T-Shirts').trim();
  const commerceStats = normalizeProductCommerceStats(product.commerceStats);
  const historicalSoldQuantity = normalizeInventory(
    product.historicalSoldQuantity ?? product.commerceStats?.historicalSoldQuantity
  );

  const normalized = {
    ...product,
    id: String(product.id || stableEntityId('prod', slug)).trim(),
    slug,
    publicHandle,
    urlAliases,
    name,
    description: String(product.description || ''),
    collections,
    category,
    productType: String(product.productType || product.type || 'Tshirt').trim(),
    vendor: String(product.vendor || 'Maria Clara').trim(),
    tags: normalizeOptionalStringList(product.tags),
    seo: normalizeSeo(product.seo, name, publicHandle, product.description),
    metafields: normalizeMetafields(product.metafields),
    themeTemplate: String(product.themeTemplate || 'Default product').trim(),
    priceCents: normalizeMoneyCents(product.priceCents),
    parcelWeightGrams: normalizeParcelWeight(product.parcelWeightGrams),
    compareAtPriceCents: product.compareAtPriceCents === '' || product.compareAtPriceCents === undefined ? null : normalizeMoneyCents(product.compareAtPriceCents),
    merchandisingStatus: product.merchandisingStatus || (variants.some((variant) => Number(variant.stockQuantity) > 0) ? 'sale' : 'sold_out'),
    status,
    featured: Boolean(product.featured),
    images,
    variants,
    productPage: normalizeProductPage(product.productPage, name),
    commerceStats,
    historicalSoldQuantity,
    historicalSoldSource: String(product.historicalSoldSource ?? product.commerceStats?.historicalSoldSource ?? '').trim().slice(0, 200),
    historicalSoldNote: String(product.historicalSoldNote ?? product.commerceStats?.historicalSoldNote ?? '').trim().slice(0, 1000),
    historicalSoldUpdatedBy: String(product.historicalSoldUpdatedBy ?? product.commerceStats?.historicalSoldUpdatedBy ?? '').trim().slice(0, 120),
    historicalSoldUpdatedAt: normalizeOptionalTimestamp(
      product.historicalSoldUpdatedAt ?? product.commerceStats?.historicalSoldUpdatedAt
    ),
    reviewSettings: normalizeReviewSettings(product.reviewSettings || {
      reviewsEnabled: product.reviewsEnabled,
      showRatingSummary: product.showRatingSummary
    })
  };
  [
    'availableStock', 'isSoldOut', 'isLowStock', 'stockDisplayText',
    'websiteSoldQuantity', 'displayedSoldQuantity', 'soldDisplayText',
    'commerceStatsCalculated'
  ].forEach((field) => delete normalized[field]);
  return normalized;
}

function validateProducts(products) {
  if (!Array.isArray(products)) {
    throw new Error('Product catalog must be an array.');
  }

  const slugs = new Set();
  const productIds = new Set();
  const variantIds = new Set();
  const skuOwners = new Map();
  products.forEach((product, index) => {
    requireString(product.id, `products[${index}].id`);
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
    if (productIds.has(product.id)) throw new Error(`Duplicate product ID: ${product.id}`);
    productIds.add(product.id);

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
      requireString(String(variant.id || ''), `products[${index}].variants[${variantIndex}].id`);
      requireString(variant.size, `products[${index}].variants[${variantIndex}].size`);
      requireString(variant.sku, `products[${index}].variants[${variantIndex}].sku`);
      requireNonNegativeNumber(variant.stockQuantity, `products[${index}].variants[${variantIndex}].stockQuantity`);
      const normalizedSku = String(variant.sku).trim().toUpperCase();
      const owner = skuOwners.get(normalizedSku);
      if (owner) {
        const message = owner === product.slug
          ? `SKU "${variant.sku}" is duplicated within this product.`
          : `SKU "${variant.sku}" is already used by another product.`;
        const error = new Error(message);
        error.status = 409;
        throw error;
      }
      skuOwners.set(normalizedSku, product.slug);
      if (variantIds.has(String(variant.id))) throw new Error(`Duplicate product variant ID: ${variant.id}`);
      variantIds.add(String(variant.id));
    });
  });
}

function validateProductRoutes(products) {
  const routes = new Map();
  for (const product of products) {
    const identifiers = [product.publicHandle, product.slug, ...(product.urlAliases || [])]
      .map(normalizeRouteIdentifier)
      .filter(Boolean);
    for (const identifier of identifiers) {
      const owner = routes.get(identifier);
      if (owner && owner !== product.slug) {
        const error = new Error(`Product URL handle "${identifier}" is already used by another product.`);
        error.status = 409;
        throw error;
      }
      routes.set(identifier, product.slug);
    }
  }
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
    id: product.id,
    slug: product.slug,
    publicHandle: product.publicHandle,
    urlAliases: product.urlAliases || [],
    name: product.name,
    collection: product.collections[0],
    collections: product.collections,
    description: product.description,
    price: product.priceCents,
    parcelWeightGrams: product.parcelWeightGrams,
    compareAtPrice: product.compareAtPriceCents,
    status,
    publicationStatus: product.status,
    featured: Boolean(product.featured),
    category: product.category,
    productType: product.productType,
    vendor: product.vendor,
    tags: product.tags || [],
    seo: product.seo || {},
    metafields: product.metafields || {},
    themeTemplate: product.themeTemplate,
    createdAt: product.createdAt || '',
    updatedAt: product.updatedAt || '',
    image: images[0],
    images,
    imageRecords,
    productPage: product.productPage || null,
    reviewSettings: normalizeReviewSettings(product.reviewSettings),
    commerceStats: normalizeProductCommerceStats(product.commerceStats),
    historicalSoldQuantity: normalizeInventory(product.historicalSoldQuantity),
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
  const aliasResult = await query(
    'SELECT alias, product_slug FROM product_url_aliases WHERE product_slug = ANY($1::text[]) ORDER BY created_at ASC, alias ASC',
    [slugs]
  );

  const imagesBySlug = groupByProductSlug(imageResult.rows.map(fromPostgresImage));
  const variantsBySlug = groupByProductSlug(variantResult.rows.map(fromPostgresVariant));
  const aliasesBySlug = groupByProductSlug(aliasResult.rows.map((row) => ({
    productSlug: row.product_slug,
    alias: row.alias
  })));

  return products.map((product) => ({
    ...product,
    images: imagesBySlug.get(product.slug) || [],
    variants: variantsBySlug.get(product.slug) || [],
    urlAliases: (aliasesBySlug.get(product.slug) || []).map((record) => record.alias)
  }));
}

async function resolvePostgresProduct(identifier) {
  if (!identifier) return null;
  const routeResult = await query(
    `SELECT p.slug
     FROM products p
     LEFT JOIN product_url_aliases a ON a.product_slug = p.slug AND a.alias = $1
     WHERE lower(p.public_handle) = $1 OR lower(p.slug) = $1 OR a.alias = $1
     ORDER BY CASE WHEN lower(p.public_handle) = $1 THEN 0 WHEN lower(p.slug) = $1 THEN 1 ELSE 2 END
     LIMIT 1`,
    [identifier]
  );
  if (!routeResult.rows.length) return null;
  const products = await listPostgresProducts(routeResult.rows[0].slug);
  return products[0] || null;
}

async function savePostgresProduct(client, product) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('maria_clara_product_url_routes'))");
  const previousResult = await client.query(
    'SELECT public_handle FROM products WHERE slug = $1',
    [product.slug]
  );
  const previousHandle = normalizeRouteIdentifier(previousResult.rows[0]?.public_handle);
  await assertPostgresRouteAvailable(client, product.publicHandle, product.slug);
  await assertPostgresVariantSkusAvailable(client, product.variants, product.slug);

  await client.query(
    `INSERT INTO products (
      slug, product_id, public_handle, name, description, collections, price_cents, compare_at_price_cents,
      merchandising_status, status, featured, category, product_type, vendor, tags, seo,
      metafields, theme_template, product_page, parcel_weight_grams, reviews_enabled, show_rating_summary,
      commerce_stats, historical_sold_quantity, historical_sold_source, historical_sold_note,
      historical_sold_updated_by, historical_sold_updated_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb, $18, $19::jsonb, $20, $21, $22, $23::jsonb, $24, $25, $26, $27, $28, now())
    ON CONFLICT (slug) DO UPDATE SET
      public_handle = EXCLUDED.public_handle,
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
      parcel_weight_grams = EXCLUDED.parcel_weight_grams,
      reviews_enabled = EXCLUDED.reviews_enabled,
      show_rating_summary = EXCLUDED.show_rating_summary,
      commerce_stats = EXCLUDED.commerce_stats,
      historical_sold_quantity = EXCLUDED.historical_sold_quantity,
      historical_sold_source = EXCLUDED.historical_sold_source,
      historical_sold_note = EXCLUDED.historical_sold_note,
      historical_sold_updated_by = EXCLUDED.historical_sold_updated_by,
      historical_sold_updated_at = EXCLUDED.historical_sold_updated_at,
      updated_at = now()`,
    [
      product.slug,
      product.id,
      product.publicHandle,
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
      JSON.stringify(product.productPage || null),
      product.parcelWeightGrams,
      product.reviewSettings.reviewsEnabled,
      product.reviewSettings.showRatingSummary,
      JSON.stringify(product.commerceStats || {}),
      product.historicalSoldQuantity,
      product.historicalSoldSource,
      product.historicalSoldNote,
      product.historicalSoldUpdatedBy,
      product.historicalSoldUpdatedAt || null
    ]
  );

  const aliases = new Set([
    ...(product.urlAliases || []),
    previousHandle,
    normalizeRouteIdentifier(product.slug)
  ].map(normalizeRouteIdentifier).filter((alias) => alias && alias !== product.publicHandle));
  await client.query(
    'DELETE FROM product_url_aliases WHERE alias = $1 AND product_slug = $2',
    [product.publicHandle, product.slug]
  );
  for (const alias of aliases) {
    await assertPostgresRouteAvailable(client, alias, product.slug);
    await client.query(
      `INSERT INTO product_url_aliases (alias, product_slug)
       VALUES ($1, $2)
       ON CONFLICT (alias) DO UPDATE SET product_slug = EXCLUDED.product_slug
       WHERE product_url_aliases.product_slug = EXCLUDED.product_slug`,
      [alias, product.slug]
    );
  }

  await client.query('DELETE FROM product_images WHERE product_slug = $1', [product.slug]);
  for (const image of product.images) {
    await client.query(
      'INSERT INTO product_images (product_slug, url, alt_text, sort_order) VALUES ($1, $2, $3, $4)',
      [product.slug, image.url, image.altText, image.sortOrder]
    );
  }

  for (const variant of product.variants) {
    await client.query(
      `INSERT INTO product_variants (product_slug, size, sku, price_cents, stock_quantity, external_pos_variant_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (sku) DO UPDATE SET
         size=EXCLUDED.size,
         price_cents=EXCLUDED.price_cents,
         stock_quantity=EXCLUDED.stock_quantity,
         external_pos_variant_id=CASE
           WHEN EXCLUDED.external_pos_variant_id<>'' THEN EXCLUDED.external_pos_variant_id
           ELSE product_variants.external_pos_variant_id
         END
       WHERE product_variants.product_slug=EXCLUDED.product_slug`,
      [product.slug, variant.size, variant.sku, variant.priceCents || null, variant.stockQuantity, variant.externalPosVariantId || '']
    );
  }
  const variantSkus = product.variants.map((variant) => variant.sku);
  await client.query(
    'DELETE FROM product_variants WHERE product_slug=$1 AND NOT (sku=ANY($2::text[]))',
    [product.slug, variantSkus]
  );
  await client.query(
    `UPDATE pancake_variant_mappings m SET
       product_slug=v.product_slug,
       local_sku=v.sku,
       normalized_sku=upper(trim(v.sku))
     FROM product_variants v
     WHERE m.local_variant_id=v.id AND v.product_slug=$1`,
    [product.slug]
  );
}

async function assertPostgresVariantSkusAvailable(client, variants, productSlug) {
  const normalizedSkus = (variants || []).map((variant) => String(variant.sku || '').trim().toUpperCase());
  if (new Set(normalizedSkus).size !== normalizedSkus.length) {
    const error = new Error('Each product variant must use a unique SKU.');
    error.status = 409;
    throw error;
  }
  const conflict = await client.query(
    `SELECT sku,product_slug
     FROM product_variants
     WHERE upper(trim(sku))=ANY($1::text[]) AND product_slug<>$2
     LIMIT 1`,
    [normalizedSkus, productSlug]
  );
  if (conflict.rows.length) {
    const error = new Error(`SKU "${conflict.rows[0].sku}" is already used by another product.`);
    error.status = 409;
    throw error;
  }
}

async function assertPostgresRouteAvailable(client, identifier, productSlug) {
  const route = normalizeRouteIdentifier(identifier);
  if (!route) return;
  const conflict = await client.query(
    `SELECT owner_slug
     FROM (
       SELECT slug AS owner_slug FROM products
       WHERE (lower(public_handle) = $1 OR lower(slug) = $1) AND slug <> $2
       UNION ALL
       SELECT product_slug AS owner_slug FROM product_url_aliases
       WHERE alias = $1 AND product_slug <> $2
     ) routes
     LIMIT 1`,
    [route, productSlug]
  );
  if (conflict.rows.length) {
    const error = new Error(`Product URL handle "${route}" is already used by another product.`);
    error.status = 409;
    throw error;
  }
}

function fromPostgresProduct(row) {
  return {
    id: row.product_id || stableEntityId('prod', row.slug),
    slug: row.slug,
    publicHandle: row.public_handle || row.slug,
    urlAliases: [],
    name: row.name,
    description: row.description,
    collections: row.collections || [],
    priceCents: row.price_cents,
    parcelWeightGrams: row.parcel_weight_grams || 250,
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
    commerceStats: normalizeProductCommerceStats(row.commerce_stats),
    historicalSoldQuantity: normalizeInventory(row.historical_sold_quantity),
    historicalSoldSource: row.historical_sold_source || '',
    historicalSoldNote: row.historical_sold_note || '',
    historicalSoldUpdatedBy: row.historical_sold_updated_by || '',
    historicalSoldUpdatedAt: row.historical_sold_updated_at ? new Date(row.historical_sold_updated_at).toISOString() : '',
    reviewSettings: normalizeReviewSettings({
      reviewsEnabled: row.reviews_enabled,
      showRatingSummary: row.show_rating_summary
    }),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
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
    id: String(row.id),
    productSlug: row.product_slug,
    size: normalizeSizeLabel(row.size),
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
    { size: 's', sku: `${slug}-S`, stockQuantity: 0 }
  ];

  return records.map((variant, index) => {
    const size = normalizeSizeLabel(variant.size || `Size ${index + 1}`);
    return {
      id: String(variant.id || stableEntityId('var', `${slug}:${variant.sku || size}:${index}`)).trim(),
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

function normalizeProductCommerceStats(value) {
  const record = value && typeof value === 'object' ? value : {};
  const lowStockThreshold = record.lowStockThreshold === null || record.lowStockThreshold === undefined || record.lowStockThreshold === ''
    ? null
    : Number(record.lowStockThreshold);
  if (lowStockThreshold !== null && (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 1 || lowStockThreshold > 999)) {
    const error = new Error('Product low-stock threshold must be an integer between 1 and 999.');
    error.status = 400;
    throw error;
  }
  return {
    showStockStatus: optionalBoolean(record.showStockStatus),
    lowStockThreshold,
    showExactRemainingStock: optionalBoolean(record.showExactRemainingStock),
    showSoldCount: optionalBoolean(record.showSoldCount)
  };
}

function optionalBoolean(value) {
  return value === null || value === undefined || value === '' ? null : Boolean(value);
}

function normalizeOptionalTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toISOString();
}

function stableEntityId(prefix, seed) {
  return `${prefix}_${crypto.createHash('sha256').update(String(seed || '')).digest('hex').slice(0, 20)}`;
}

function normalizeSizeLabel(size) {
  const value = String(size || '').trim();
  const key = value.toLowerCase().replace(/\s+/g, '');
  const labels = {
    small: 's',
    s: 's',
    medium: 'm',
    m: 'm',
    large: 'l',
    l: 'l',
    xlarge: 'xl',
    xl: 'xl',
    '2xlarge': 'xxl',
    '2xl': 'xxl',
    xxl: 'xxl',
    '3xlarge': 'xxxl',
    '3xl': 'xxxl',
    xxxl: 'xxxl'
  };
  return labels[key] || value;
}

function normalizeProductPage(productPage, productName) {
  const fallback = {
    heading: productName || 'Product details',
    intro: 'Premium Maria Clara Clothing piece with everyday comfort and clean styling.',
    sections: [
      {
        title: 'Product details',
        items: ['Comfortable fit', 'Easy to style', 'Ready for everyday wear']
      }
    ]
  };
  const record = productPage && typeof productPage === 'object' ? productPage : fallback;
  return {
    ...fallback,
    ...record,
    cardContent: normalizeProductCardContent(record.cardContent)
  };
}

function normalizeProductCardContent(value) {
  const record = value && typeof value === 'object' ? value : {};
  const text = String(record.text || '').trim();
  const source = String(record.source || '').trim();
  const rawRating = record.rating;
  const rating = rawRating === '' || rawRating === null || rawRating === undefined
    ? null
    : Number(rawRating);
  const showText = Boolean(record.showText);
  const showRating = Boolean(record.showRating);
  const showSource = Boolean(record.showSource);
  const ratingHasSupportedPrecision = rating === null
    || Math.abs((rating * 10) - Math.round(rating * 10)) < Number.EPSILON * 100;

  if (text.length > 280) {
    throw seoValidationError('Product card text must be 280 characters or fewer.');
  }
  if (source.length > 120) {
    throw seoValidationError('Product card source must be 120 characters or fewer.');
  }
  if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5 || !ratingHasSupportedPrecision)) {
    throw seoValidationError('Product card rating must be between 1.0 and 5.0 in 0.1 increments.');
  }
  if (showRating && rating === null) {
    throw seoValidationError('Choose a product card rating before showing it.');
  }
  if (showRating && (!source || !showSource)) {
    throw seoValidationError('A visible source is required when showing a manually entered product card rating.');
  }

  return {
    text,
    rating: rating === null ? null : Number(rating.toFixed(1)),
    source,
    showText,
    showRating,
    showSource
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

function seoValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeSeoPlainText(value, label, maximum) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (text.length > maximum) throw seoValidationError(`${label} must be ${maximum} characters or fewer.`);
  if (/[<>]/.test(text)) throw seoValidationError(`${label} must be plain text without HTML.`);
  return text;
}

function normalizeSeoUrl(value, label) {
  const input = String(value || '').trim();
  if (!input) return '';
  if (input.length > 500) throw seoValidationError(`${label} must be 500 characters or fewer.`);
  if (input.startsWith('/') && !input.startsWith('//')) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:') throw new Error('HTTPS required');
    return url.toString();
  } catch (_error) {
    throw seoValidationError(`${label} must be an HTTPS URL or a site-relative path.`);
  }
}

function normalizeSeo(seo, _name, publicHandle, _description) {
  const record = seo && typeof seo === 'object' ? seo : {};
  const secondaryKeywords = normalizeOptionalStringList(record.secondaryKeywords);
  if (secondaryKeywords.some((keyword) => keyword.length > 80 || /[<>]/.test(keyword))) {
    throw seoValidationError('Secondary keywords must be plain text and 80 characters or fewer.');
  }
  return {
    title: normalizeSeoPlainText(record.title, 'SEO title', 200),
    description: normalizeSeoPlainText(record.description, 'Meta description', 500),
    mainKeyword: normalizeSeoPlainText(record.mainKeyword, 'Main keyword', 80),
    secondaryKeywords,
    imageAltText: normalizeSeoPlainText(record.imageAltText, 'Main image alt text', 500),
    canonicalUrl: normalizeSeoUrl(record.canonicalUrl || record.canonicalUrlOverride, 'Canonical URL'),
    indexable: record.indexable === undefined
      ? !(record.noindex === true || record.index === false)
      : Boolean(record.indexable),
    ogTitle: normalizeSeoPlainText(record.ogTitle || record.openGraphTitle, 'Open Graph title', 200),
    ogDescription: normalizeSeoPlainText(record.ogDescription || record.openGraphDescription, 'Open Graph description', 500),
    ogImageUrl: normalizeSeoUrl(record.ogImageUrl || record.ogImage || record.openGraphImage, 'Open Graph image'),
    feedTitle: normalizeSeoPlainText(record.feedTitle || record.productFeedTitle, 'Product feed title', 150),
    marketplaceTitle: normalizeSeoPlainText(record.marketplaceTitle, 'Marketplace title', 150),
    handle: publicHandle
  };
}

function normalizeMetafields(metafields) {
  const record = metafields && typeof metafields === 'object' ? metafields : {};
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [
    key,
    normalizeOptionalStringList(value)
  ]));
}

function normalizeReviewSettings(value) {
  const record = value && typeof value === 'object' ? value : {};
  return {
    reviewsEnabled: record.reviewsEnabled === undefined ? true : Boolean(record.reviewsEnabled),
    showRatingSummary: record.showRatingSummary === undefined ? true : Boolean(record.showRatingSummary)
  };
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

function normalizeParcelWeight(value) {
  if (value === undefined || value === null || value === '') return 250;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 100000) {
    throw new Error('Product parcel weight must be between 1 and 100000 grams.');
  }
  return number;
}

function slugify(value) {
  return String(value || 'product')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'product';
}

function normalizePublicHandle(value, fallback) {
  const source = String(value || fallback || '').trim();
  return source ? slugify(source).slice(0, 180) : '';
}

function normalizeRouteIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUrlAliases(value, slug, publicHandle) {
  const aliases = Array.isArray(value) ? value : [];
  return [...new Set([...aliases, slug]
    .map(normalizeRouteIdentifier)
    .filter((alias) => alias && alias !== publicHandle))];
}

function productMatchesRoute(product, identifier) {
  if (!identifier) return false;
  return [product.publicHandle, product.slug, ...(product.urlAliases || [])]
    .some((route) => normalizeRouteIdentifier(route) === identifier);
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

  if (productPage.detailsText !== undefined) {
    requireOptionalString(productPage.detailsText, `${field}.detailsText`);
  }

  if (productPage.shippingText !== undefined) {
    requireOptionalString(productPage.shippingText, `${field}.shippingText`);
  }

  if (productPage.sizeChart !== undefined) {
    if (!Array.isArray(productPage.sizeChart)) {
      throw new Error(`${field}.sizeChart must be an array.`);
    }
    productPage.sizeChart.forEach((row, index) => {
      requireString(row.size, `${field}.sizeChart[${index}].size`);
      requireString(row.width, `${field}.sizeChart[${index}].width`);
      requireString(row.length, `${field}.sizeChart[${index}].length`);
      requireString(row.sleeveLength, `${field}.sizeChart[${index}].sleeveLength`);
      requireString(row.shoulderDropLength, `${field}.sizeChart[${index}].shoulderDropLength`);
    });
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

function requireOptionalString(value, field) {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string.`);
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
  archiveEditableProduct,
  catalogProducts,
  editableProducts,
  deductVariantStock,
  deleteEditableProduct,
  findCatalogProductBySlug,
  findEditableProductBySlug,
  listCatalogProducts,
  listEditableProducts,
  loadEditableProducts,
  normalizeEditableProduct,
  normalizePublicHandle,
  normalizeProductCommerceStats,
  normalizeReviewSettings,
  productsPath,
  replaceEditableProducts,
  restoreEditableProduct,
  restockVariantStock,
  saveEditableProduct,
  saveEditableProductsBatch,
  validateProducts,
  validateProductRoutes
};
