const crypto = require('node:crypto');
const XLSX = require('xlsx');
const { listEditableProducts } = require('../products/catalogRepository');
const {
  createImportBatch,
  existingDuplicateKeys,
  insertReview,
  normalizeReview,
  updateImportBatch
} = require('./reviewRepository');
const { safeRemoteReviewImageUrl } = require('./reviewImages');

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;
const REVIEW_IMPORT_COLUMNS = [
  'product_id', 'reviewer_name', 'reviewer_email', 'rating', 'review_title', 'review_body',
  'review_date', 'variant', 'size', 'photo_url_1', 'photo_url_2', 'photo_url_3', 'admin_reply'
];
const REVIEW_IMPORT_FIELD_GUIDE = [
  ['product_id', 'Required', 'Text', 'Exact product ID. The review is assigned directly to this product.'],
  ['reviewer_name', 'Required', 'Text', 'Customer display name.'],
  ['reviewer_email', 'Optional', 'Email', 'Stored privately and used for duplicate checks.'],
  ['rating', 'Required', 'Whole number 1–5', 'A real rating supplied by the reviewer.'],
  ['review_title', 'Optional', 'Text', 'Short review headline.'],
  ['review_body', 'Required', 'Text', 'The customer review. Formula-like text is rejected.'],
  ['review_date', 'Optional', 'YYYY-MM-DD', 'Leave blank to use the import date.'],
  ['variant', 'Optional', 'Text', 'Purchased color, style, or variant description.'],
  ['size', 'Optional', 'Text', 'Purchased size when known.'],
  ['photo_url_1', 'Optional', 'Public HTTPS URL', 'JPG, PNG, or WebP only.'],
  ['photo_url_2', 'Optional', 'Public HTTPS URL', 'JPG, PNG, or WebP only.'],
  ['photo_url_3', 'Optional', 'Public HTTPS URL', 'JPG, PNG, or WebP only.'],
  ['admin_reply', 'Optional', 'Text', 'Optional store response; review remains Pending after import.']
];
const runtimeImportSecret = crypto.randomBytes(32).toString('hex');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function importSecret() {
  return String(
    process.env.REVIEW_IMPORT_SECRET ||
    process.env.ORDER_CONFIRMATION_SECRET ||
    process.env.CHECKOUT_CONFIRMATION_SECRET ||
    runtimeImportSecret
  );
}

function previewToken(buffer, filename, validCount) {
  const digest = sha256(buffer);
  const payload = `${digest}:${String(filename || '')}:${validCount}`;
  const signature = crypto.createHmac('sha256', importSecret()).update(payload).digest('base64url');
  return `${digest}.${validCount}.${signature}`;
}

function verifyPreviewToken(token, buffer, filename, validCount) {
  const expected = previewToken(buffer, filename, validCount);
  const actualBuffer = Buffer.from(String(token || ''));
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function assertWorkbookUpload(file) {
  if (!file?.buffer?.length) throw Object.assign(new Error('Choose an XLSX review import file.'), { status: 400 });
  if (file.buffer.length > MAX_IMPORT_BYTES) throw Object.assign(new Error('Review import files must be 5 MB or smaller.'), { status: 413 });
  if (!String(file.originalname || '').toLowerCase().endsWith('.xlsx')) {
    throw Object.assign(new Error('Review import supports .xlsx files only.'), { status: 400 });
  }
  if (file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4B) {
    throw Object.assign(new Error('The uploaded file is not a valid XLSX workbook.'), { status: 400 });
  }
}

function parseWorkbook(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
      cellFormula: true,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      sheetRows: MAX_IMPORT_ROWS + 2,
      WTF: false
    });
  } catch (_error) {
    throw Object.assign(new Error('The XLSX workbook could not be parsed safely.'), { status: 400 });
  }
  if (!workbook.SheetNames.length || workbook.SheetNames.length > 10) {
    throw Object.assign(new Error('The workbook must contain between 1 and 10 worksheets.'), { status: 400 });
  }
  const sheetName = workbook.SheetNames.includes('Reviews') ? 'Reviews' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  for (const [address, cell] of Object.entries(sheet || {})) {
    if (address.startsWith('!')) continue;
    if (cell?.f) throw Object.assign(new Error(`Formula cells are not allowed in review imports (${address}).`), { status: 400 });
  }
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: false });
  const headers = (matrix[0] || []).map((value) => String(value || '').trim().toLowerCase());
  const missing = REVIEW_IMPORT_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) throw Object.assign(new Error(`The review template is missing columns: ${missing.join(', ')}.`), { status: 400 });
  const dataRows = matrix.slice(1).filter((row) => row.some((value) => String(value ?? '').trim() !== ''));
  if (dataRows.length > MAX_IMPORT_ROWS) throw Object.assign(new Error(`Review imports are limited to ${MAX_IMPORT_ROWS} rows.`), { status: 400 });
  return dataRows.map((row, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(headers.map((header, columnIndex) => [header, row[columnIndex] ?? '']))
  }));
}

function importDate(value) {
  if (value === '' || value === null || value === undefined) return new Date().toISOString();
  if (typeof value === 'number') {
    const parts = XLSX.SSF.parse_date_code(value);
    if (!parts) throw new Error('Review date is invalid.');
    return new Date(Date.UTC(parts.y, parts.m - 1, parts.d, parts.H || 0, parts.M || 0, Math.floor(parts.S || 0))).toISOString();
  }
  const text = String(value).trim();
  const calendar = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!calendar) throw new Error('Review date must use YYYY-MM-DD format.');
  const [, yearText, monthText, dayText] = calendar;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) {
    throw new Error('Review date is invalid.');
  }
  const parsed = new Date(text.length === 10 ? `${text}T00:00:00.000Z` : text);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Review date is invalid.');
  return parsed.toISOString();
}

function formulaLike(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value.trim());
}

function productIndexes(products) {
  const byId = new Map();
  for (const product of products) {
    for (const id of [product.id, product.slug ? `catalog-${product.slug}` : '']) {
      if (id) byId.set(String(id).trim().toLowerCase(), product);
    }
  }
  return { byId };
}

function matchProduct(row, indexes) {
  const productId = String(row.product_id || '').trim().toLowerCase();
  if (productId && indexes.byId.has(productId)) {
    return { product: indexes.byId.get(productId), method: 'product_id', variant: null };
  }
  return { product: null, method: 'unmatched', variant: null };
}

async function validateRow(record, indexes, dependencies = {}) {
  const errors = [];
  const warnings = [];
  const row = record.values;
  const matching = matchProduct(row, indexes);
  if (!String(row.product_id || '').trim()) errors.push('product_id is required.');
  else if (!matching.product) errors.push('Product could not be matched by product_id.');
  for (const [column, value] of Object.entries(row)) {
    if (formulaLike(value)) errors.push(`${column} starts with a spreadsheet formula character.`);
  }
  let candidate = null;
  let photos = [];
  try {
    const date = importDate(row.review_date);
    photos = [row.photo_url_1, row.photo_url_2, row.photo_url_3]
      .map((value) => safeRemoteReviewImageUrl(value))
      .filter(Boolean);
    if (matching.product) {
      candidate = normalizeReview({
        productSlug: matching.product.slug,
        reviewerName: row.reviewer_name,
        reviewerEmail: row.reviewer_email,
        rating: row.rating,
        title: row.review_title,
        body: row.review_body,
        createdAt: date,
        variant: row.variant,
        size: row.size,
        orderNumber: '',
        status: 'pending',
        source: 'imported',
        verifiedPurchase: false,
        adminReply: row.admin_reply,
        originalRowNumber: record.rowNumber,
        originalImportData: row
      });
    }
  } catch (error) {
    errors.push(error.message);
  }
  return {
    rowNumber: record.rowNumber,
    valid: errors.length === 0 && Boolean(candidate),
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    productMatch: matching.product ? {
      method: matching.method,
      productId: matching.product.id,
      productSlug: matching.product.slug,
      productName: matching.product.name,
      sku: matching.variant?.sku || ''
    } : { method: 'unmatched' },
    candidate,
    photos,
    original: row
  };
}

async function planReviewImport(file, dependencies = {}) {
  assertWorkbookUpload(file);
  const records = parseWorkbook(file.buffer);
  const products = await (dependencies.listProducts || listEditableProducts)();
  const indexes = productIndexes(products);
  const rows = [];
  const seen = new Set();
  for (const record of records) {
    const result = await validateRow(record, indexes, dependencies);
    if (result.candidate && seen.has(result.candidate.duplicateKey)) {
      result.valid = false;
      result.errors.push('Duplicate of another row in this workbook.');
    }
    if (result.candidate) seen.add(result.candidate.duplicateKey);
    rows.push(result);
  }
  const duplicateKeys = await (dependencies.existingDuplicateKeys || existingDuplicateKeys)(
    rows.filter((row) => row.candidate).map((row) => row.candidate.duplicateKey)
  );
  for (const row of rows) {
    if (row.candidate && duplicateKeys.has(row.candidate.duplicateKey)) {
      row.valid = false;
      row.errors.push('An identical review already exists.');
    }
  }
  const validRows = rows.filter((row) => row.valid);
  return {
    filename: String(file.originalname || 'reviews.xlsx'),
    parser: `SheetJS CE ${XLSX.version}`,
    totalRows: rows.length,
    validRows: validRows.length,
    invalidRows: rows.length - validRows.length,
    rows,
    token: previewToken(file.buffer, file.originalname, validRows.length)
  };
}

async function importPlannedReviews(file, token, dependencies = {}) {
  const plan = await planReviewImport(file, dependencies);
  if (!verifyPreviewToken(token, file.buffer, file.originalname, plan.validRows)) {
    throw Object.assign(new Error('Import preview expired or does not match this workbook. Preview the file again.'), { status: 409 });
  }
  const createBatch = dependencies.createImportBatch || createImportBatch;
  const batch = await createBatch({
    filename: plan.filename,
    totalRows: plan.totalRows,
    successfulRows: 0,
    failedRows: plan.invalidRows,
    importedBy: 'admin',
    errorReport: plan.rows.filter((row) => !row.valid).map(errorRow)
  });
  const failures = plan.rows.filter((row) => !row.valid).map(errorRow);
  let successfulRows = 0;
  for (const row of plan.rows.filter((candidate) => candidate.valid)) {
    try {
      await (dependencies.insertReview || insertReview)({
        ...row.candidate,
        id: undefined,
        importBatchId: batch.id,
        source: 'imported',
        status: 'pending',
        originalRowNumber: row.rowNumber,
        originalImportData: row.original
      }, {
        images: row.photos,
        actor: 'admin',
        action: 'imported'
      });
      successfulRows += 1;
    } catch (error) {
      failures.push({ rowNumber: row.rowNumber, errors: [error.message] });
    }
  }
  await (dependencies.updateImportBatch || updateImportBatch)(batch.id, {
    successfulRows,
    failedRows: failures.length,
    errorReport: failures
  });
  return { batchId: batch.id, totalRows: plan.totalRows, successfulRows, failedRows: failures.length, errors: failures };
}

function errorRow(row) {
  return { rowNumber: row.rowNumber, errors: row.errors, warnings: row.warnings, productMatch: row.productMatch };
}

function reviewImportTemplateBuffer() {
  const reviews = XLSX.utils.aoa_to_sheet([REVIEW_IMPORT_COLUMNS]);
  reviews['!cols'] = REVIEW_IMPORT_COLUMNS.map((column) => ({ wch: Math.max(14, column.length + 2) }));
  reviews['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(REVIEW_IMPORT_COLUMNS.length - 1)}1` };
  const instructions = [
    ['Review Import Instructions', ''],
    ['Safe workflow', '1. Complete the Reviews sheet. 2. Upload it to Admin > Reviews > Import reviews. 3. Check the preview. 4. Import valid rows. 5. Moderate Pending reviews before publishing.'],
    ['Required fields', 'Provide product_id, reviewer_name, rating, and review_body.'],
    ['Rating', 'Whole numbers 1–5 only.'],
    ['Review status', 'All imports are saved as Pending for moderation.'],
    ['Date format', 'YYYY-MM-DD. Leave blank to use the import date.'],
    ['Product matching', 'The exact product_id assigns the review directly to that product. Product names, SKUs, slugs, and delivered orders are not used for bulk-import matching.'],
    ['Verification', 'Bulk-imported reviews are not labeled Verified Purchase. Verification is a separate real-order process.'],
    ['Imported source', 'The website records all workbook rows as imported and preserves the original row data in the audit record.'],
    ['Photo URLs', 'Public HTTPS JPG, PNG, or WebP URLs only; maximum 3.'],
    ['Maximum rows', String(MAX_IMPORT_ROWS)],
    ['Security', 'Do not enter formulas. Text beginning with =, +, -, or @ is rejected.'],
    ['Example row', 'prod_example | Example Customer | example@example.com | 5 | Great fit | Comfortable and well made. | 2026-01-31 | Black | M | | | |']
  ];
  const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
  instructionSheet['!cols'] = [{ wch: 24 }, { wch: 120 }];
  const fieldGuide = XLSX.utils.aoa_to_sheet([
    ['Field', 'Required?', 'Accepted format', 'Guidance'],
    ...REVIEW_IMPORT_FIELD_GUIDE
  ]);
  fieldGuide['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 24 }, { wch: 78 }];
  fieldGuide['!autofilter'] = { ref: `A1:D${REVIEW_IMPORT_FIELD_GUIDE.length + 1}` };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, reviews, 'Reviews');
  XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');
  XLSX.utils.book_append_sheet(workbook, fieldGuide, 'Field Guide');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
}

function importErrorsCsv(errors = []) {
  const safe = (value) => {
    let text = String(value ?? '').replace(/\r?\n/g, ' ');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return ['row_number,errors,warnings', ...errors.map((row) => [
    row.rowNumber,
    (row.errors || []).join('; '),
    (row.warnings || []).join('; ')
  ].map(safe).join(','))].join('\n');
}

module.exports = {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  REVIEW_IMPORT_COLUMNS,
  REVIEW_IMPORT_FIELD_GUIDE,
  assertWorkbookUpload,
  importErrorsCsv,
  importPlannedReviews,
  matchProduct,
  parseWorkbook,
  planReviewImport,
  reviewImportTemplateBuffer,
  verifyPreviewToken
};
