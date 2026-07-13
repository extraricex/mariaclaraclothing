const { parse } = require('csv-parse/sync');
const { normalizeEditableProduct, validateProducts, validateProductRoutes } = require('./catalogRepository');

const PRODUCT_CSV_HEADERS = [
  'product_id', 'product_name', 'slug', 'public_handle', 'status', 'description',
  'product_details', 'shipping_details', 'size_chart_json', 'image_urls',
  'price_php', 'compare_at_price_php', 'category', 'collections', 'tags',
  'product_type', 'vendor', 'weight_grams', 'variant_id', 'variant', 'size',
  'sku', 'variant_price_php', 'stock', 'pancake_product_id',
  'pancake_variant_id', 'pancake_sync_status', 'last_synced_at', 'mapping_status'
];

const IMPORT_MODES = new Set(['create_only', 'update_by_sku', 'skip_duplicates']);
const VALID_STATUSES = new Set(['active', 'draft', 'archived']);

function planProductCsvImport(input, options = {}) {
  const mode = String(options.mode || 'create_only');
  if (!IMPORT_MODES.has(mode)) throw badRequest('Product import mode is invalid.');
  const currentProducts = Array.isArray(options.currentProducts) ? options.currentProducts : [];
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input || '');
  const records = parse(text.replace(/^\uFEFF/, ''), {
    columns: (headers) => headers.map(normalizeHeader),
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: false,
    max_record_size: 128 * 1024
  });
  if (!records.length) throw badRequest('The CSV file does not contain product rows.');
  if (records.length > 5000) throw badRequest('Product import is limited to 5,000 variant rows per file.');

  const currentBySlug = new Map(currentProducts.map((product) => [product.slug, product]));
  const currentBySku = new Map();
  currentProducts.forEach((product) => (product.variants || []).forEach((variant) => {
    currentBySku.set(normalizeSku(variant.sku), { product, variant });
  }));
  const fileSkuCounts = new Map();
  records.forEach((row) => {
    const sku = normalizeSku(row.sku);
    if (sku) fileSkuCounts.set(sku, (fileSkuCounts.get(sku) || 0) + 1);
  });

  const rowResults = records.map((row, index) => validateImportRow(row, index + 2, {
    mode, currentBySlug, currentBySku, fileSkuCounts
  }));
  const grouped = new Map();
  rowResults.forEach((result) => {
    const key = mode === 'update_by_sku'
      ? currentBySku.get(normalizeSku(result.raw.sku))?.product?.slug || `invalid:${result.rowNumber}`
      : importSlug(result.raw) || `invalid:${result.rowNumber}`;
    grouped.set(key, [...(grouped.get(key) || []), result]);
  });

  const products = [];
  for (const [key, rows] of grouped) {
    if (rows.some((row) => row.status !== 'valid')) continue;
    const consistencyError = productGroupConsistencyError(rows);
    if (consistencyError) {
      rows.forEach((row) => {
        row.status = 'invalid';
        row.errors.push(consistencyError);
      });
      continue;
    }
    try {
      const product = mode === 'update_by_sku'
        ? buildUpdatedProduct(currentBySlug.get(key), rows)
        : buildNewProduct(rows);
      products.push(normalizeEditableProduct(product));
    } catch (error) {
      rows.forEach((row) => {
        row.status = 'invalid';
        row.errors.push(error.message || 'Product could not be prepared for import.');
      });
    }
  }

  if (products.length) {
    const finalCatalog = mergeCatalog(currentProducts, products);
    try {
      validateProducts(finalCatalog);
      validateProductRoutes(finalCatalog);
    } catch (error) {
      products.splice(0);
      rowResults.filter((row) => row.status === 'valid').forEach((row) => {
        row.status = 'invalid';
        row.errors.push(error.message || 'The import conflicts with the current catalog.');
      });
    }
  }

  const duplicateSkus = [...fileSkuCounts]
    .filter(([, count]) => count > 1)
    .map(([sku, count]) => ({ sku, count }));
  const rows = rowResults.map(publicRowResult);
  return {
    mode,
    products,
    preview: {
      totalRows: rows.length,
      validRows: rows.filter((row) => row.status === 'valid').length,
      invalidRows: rows.filter((row) => row.status === 'invalid').length,
      skippedRows: rows.filter((row) => row.status === 'skipped').length,
      productCount: products.length,
      duplicateSkus,
      rows
    }
  };
}

function productGroupConsistencyError(rows) {
  const fields = ['product_name', 'slug', 'public_handle', 'status', 'price_php'];
  for (const field of fields) {
    const values = new Set(rows.map((row) => String(row.raw[field] || '').trim()).filter(Boolean));
    if (values.size > 1) return `All variant rows for one product must use the same ${field.replaceAll('_', ' ')}.`;
  }
  return '';
}

function validateImportRow(raw, rowNumber, context) {
  const errors = [];
  const warnings = [];
  const name = String(raw.product_name || '').trim();
  const slug = importSlug(raw);
  const sku = normalizeSku(raw.sku);
  const size = String(raw.size || raw.variant || '').trim();
  const status = String(raw.status || 'draft').trim().toLowerCase();
  const priceCents = moneyToCents(raw.price_php);
  const stock = strictNonNegativeInteger(raw.stock);
  const variantPriceCents = raw.variant_price_php === '' || raw.variant_price_php === undefined
    ? null : moneyToCents(raw.variant_price_php);

  if (!name) errors.push('Product name is required.');
  if (!slug) errors.push('Product slug or product name is required.');
  if (!sku) errors.push('SKU is required.');
  if (looksLikeFormula(raw.sku)) errors.push('SKU cannot start with a spreadsheet formula character.');
  if (!size) errors.push('Variant size is required.');
  if (!VALID_STATUSES.has(status)) errors.push('Status must be active, draft, or archived.');
  if (!Number.isInteger(priceCents) || priceCents <= 0) errors.push('Price must be a positive PHP amount.');
  if (!Number.isInteger(stock) || stock < 0) errors.push('Stock must be a non-negative whole number.');
  if (variantPriceCents !== null && (!Number.isInteger(variantPriceCents) || variantPriceCents <= 0)) {
    errors.push('Variant price must be a positive PHP amount when provided.');
  }
  if ((context.fileSkuCounts.get(sku) || 0) > 1) errors.push(`SKU ${sku} appears more than once in this file.`);

  const existingSku = context.currentBySku.get(sku);
  const existingSlug = context.currentBySlug.get(slug);
  let rowStatus = errors.length ? 'invalid' : 'valid';
  if (!errors.length && context.mode === 'create_only' && (existingSku || existingSlug)) {
    rowStatus = 'invalid';
    errors.push(existingSku ? `SKU ${sku} already exists.` : `Product slug ${slug} already exists.`);
  }
  if (!errors.length && context.mode === 'skip_duplicates' && (existingSku || existingSlug)) {
    rowStatus = 'skipped';
    warnings.push(existingSku ? `SKU ${sku} already exists and will be skipped.` : `Product ${slug} already exists and will be skipped.`);
  }
  if (!errors.length && context.mode === 'update_by_sku' && !existingSku) {
    rowStatus = 'invalid';
    errors.push(`SKU ${sku} does not exist and cannot be updated.`);
  }
  if (hasPancakeImportValues(raw)) {
    warnings.push('Pancake mapping columns are read-only and will not be imported.');
  }

  return { rowNumber, raw, status: rowStatus, errors, warnings };
}

function buildNewProduct(rows) {
  const first = rows[0].raw;
  const name = String(first.product_name || '').trim();
  const images = splitList(first.image_urls).map((url, index) => ({ url, altText: name, sortOrder: index }));
  if (!images.length) throw badRequest('New products require at least one image URL.');
  const collections = splitList(first.collections);
  if (!collections.length) throw badRequest('New products require at least one collection.');
  const description = String(first.description || '').trim();
  if (!description) throw badRequest('New products require a description.');
  const productPage = importProductPage(first, name, description);
  return {
    name,
    slug: importSlug(first),
    publicHandle: String(first.public_handle || name).trim(),
    status: String(first.status || 'draft').trim().toLowerCase(),
    description,
    productPage,
    images,
    collections,
    category: String(first.category || collections[0]).trim(),
    tags: splitList(first.tags),
    productType: String(first.product_type || 'Tshirt').trim(),
    vendor: String(first.vendor || 'Maria Clara').trim(),
    parcelWeightGrams: strictPositiveInteger(first.weight_grams) || 250,
    priceCents: moneyToCents(first.price_php),
    compareAtPriceCents: emptyToNullMoney(first.compare_at_price_php),
    featured: false,
    variants: rows.map(({ raw }) => ({
      size: String(raw.size || raw.variant).trim(),
      sku: String(raw.sku).trim(),
      priceCents: emptyToNullMoney(raw.variant_price_php),
      stockQuantity: strictNonNegativeInteger(raw.stock),
      externalPosVariantId: ''
    }))
  };
}

function buildUpdatedProduct(existing, rows) {
  if (!existing) throw badRequest('The product selected for update no longer exists.');
  const first = rows[0].raw;
  const updatesBySku = new Map(rows.map(({ raw }) => [normalizeSku(raw.sku), raw]));
  const images = splitList(first.image_urls);
  const collections = splitList(first.collections);
  return {
    ...existing,
    name: String(first.product_name || existing.name).trim(),
    description: String(first.description || existing.description),
    status: String(first.status || existing.status).trim().toLowerCase(),
    publicHandle: String(first.public_handle || existing.publicHandle).trim(),
    images: images.length ? images.map((url, index) => ({ url, altText: first.product_name || existing.name, sortOrder: index })) : existing.images,
    collections: collections.length ? collections : existing.collections,
    category: String(first.category || existing.category).trim(),
    tags: first.tags ? splitList(first.tags) : existing.tags,
    productType: String(first.product_type || existing.productType).trim(),
    vendor: String(first.vendor || existing.vendor).trim(),
    parcelWeightGrams: strictPositiveInteger(first.weight_grams) || existing.parcelWeightGrams,
    priceCents: moneyToCents(first.price_php),
    compareAtPriceCents: first.compare_at_price_php === '' || first.compare_at_price_php === undefined
      ? existing.compareAtPriceCents : emptyToNullMoney(first.compare_at_price_php),
    productPage: mergeImportedProductPage(existing.productPage, first),
    variants: existing.variants.map((variant) => {
      const row = updatesBySku.get(normalizeSku(variant.sku));
      if (!row) return variant;
      return {
        ...variant,
        size: String(row.size || row.variant || variant.size).trim(),
        priceCents: row.variant_price_php === '' || row.variant_price_php === undefined
          ? variant.priceCents : emptyToNullMoney(row.variant_price_php),
        stockQuantity: strictNonNegativeInteger(row.stock)
      };
    })
  };
}

function importProductPage(row, name = '', description = '') {
  const detailsText = String(row.product_details || '').trim();
  const shippingText = String(row.shipping_details || '').trim();
  const sizeChart = parseSizeChart(row.size_chart_json);
  const sections = [
    detailsText && { title: 'Product details', body: detailsText },
    shippingText && { title: 'Shipping', body: shippingText }
  ].filter(Boolean);
  return {
    heading: name || 'Product details',
    intro: description || 'Premium Maria Clara Clothing product.',
    sections: sections.length ? sections : [{ title: 'Product details', items: ['Product information available in the description.'] }],
    detailsText,
    shippingText,
    sizeChart
  };
}

function mergeImportedProductPage(existing, row) {
  const imported = importProductPage(row, existing?.heading, existing?.intro);
  return {
    ...(existing || {}),
    ...(imported.detailsText ? { detailsText: imported.detailsText } : {}),
    ...(imported.shippingText ? { shippingText: imported.shippingText } : {}),
    ...(imported.sizeChart.length ? { sizeChart: imported.sizeChart } : {})
  };
}

function parseSizeChart(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch (_error) {
    throw badRequest('Size chart must be valid JSON array data.');
  }
}

function productsToCsv(products, syncStatuses = []) {
  const syncBySlug = new Map(syncStatuses.map((status) => [status.productSlug, status]));
  const rows = [PRODUCT_CSV_HEADERS];
  for (const product of products) {
    const sync = syncBySlug.get(product.slug) || {};
    const mappingBySku = new Map((sync.variantMappings || []).map((mapping) => [normalizeSku(mapping.sku), mapping]));
    for (const variant of product.variants || []) {
      const mapping = mappingBySku.get(normalizeSku(variant.sku)) || {};
      rows.push([
        product.id || '', product.name, product.slug, product.publicHandle || '', product.status,
        product.description, product.productPage?.detailsText || '', product.productPage?.shippingText || '',
        JSON.stringify(product.productPage?.sizeChart || []),
        (product.images || []).map((image) => image.url).join('|'), centsToMoney(product.priceCents),
        centsToMoney(product.compareAtPriceCents), product.category || '', (product.collections || []).join('|'),
        (product.tags || []).join('|'), product.productType || '', product.vendor || '', product.parcelWeightGrams || '',
        variant.id || '', variant.size, variant.size, variant.sku, centsToMoney(variant.priceCents),
        variant.stockQuantity, mapping.pancakeProductId || sync.pancakeProductId || '',
        mapping.pancakeVariantId || '', sync.status || 'missing_mapping', sync.lastSyncedAt || '',
        mapping.status || 'missing'
      ]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function failedProductRowsCsv(rows) {
  const header = ['row', 'status', 'product_name', 'slug', 'sku', 'errors', 'warnings'];
  const records = (rows || []).filter((row) => row.status !== 'valid').map((row) => [
    row.rowNumber, row.status, row.productName, row.slug, row.sku,
    (row.errors || []).join(' | '), (row.warnings || []).join(' | ')
  ]);
  return [header, ...records].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function publicRowResult(result) {
  return {
    rowNumber: result.rowNumber,
    status: result.status,
    productName: String(result.raw.product_name || '').trim(),
    slug: importSlug(result.raw),
    sku: String(result.raw.sku || '').trim(),
    size: String(result.raw.size || result.raw.variant || '').trim(),
    errors: result.errors,
    warnings: result.warnings
  };
}

function mergeCatalog(current, incoming) {
  const bySlug = new Map(current.map((product) => [product.slug, product]));
  incoming.forEach((product) => bySlug.set(product.slug, product));
  return [...bySlug.values()];
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function importSlug(row) {
  return slugify(row.slug || row.product_name);
}

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function splitList(value) {
  return String(value || '').split('|').map((item) => item.trim()).filter(Boolean);
}

function normalizeSku(value) {
  return String(value || '').trim().toUpperCase();
}

function strictNonNegativeInteger(value) {
  if (!/^(0|[1-9]\d*)$/.test(String(value ?? '').trim())) return NaN;
  return Number(value);
}

function strictPositiveInteger(value) {
  if (!/^[1-9]\d*$/.test(String(value ?? '').trim())) return null;
  return Number(value);
}

function moneyToCents(value) {
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return NaN;
  return Math.round(Number(text) * 100);
}

function emptyToNullMoney(value) {
  if (value === '' || value === undefined || value === null) return null;
  return moneyToCents(value);
}

function centsToMoney(value) {
  if (value === '' || value === null || value === undefined) return '';
  return (Number(value) / 100).toFixed(2);
}

function looksLikeFormula(value) {
  return /^[=+\-@\t\r]/.test(String(value || '').trimStart());
}

function hasPancakeImportValues(row) {
  return ['pancake_product_id', 'pancake_variant_id', 'pancake_sync_status', 'last_synced_at', 'mapping_status']
    .some((field) => String(row[field] || '').trim());
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

module.exports = {
  IMPORT_MODES,
  PRODUCT_CSV_HEADERS,
  failedProductRowsCsv,
  planProductCsvImport,
  productsToCsv
};
