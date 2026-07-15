const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const {
  REVIEW_IMPORT_COLUMNS,
  importErrorsCsv,
  importPlannedReviews,
  parseWorkbook,
  planReviewImport,
  reviewImportTemplateBuffer
} = require('../src/reviews/reviewImport');

const product = {
  id: 'prod_real_1', slug: 'shirt', publicHandle: 'premium-shirt', name: 'Premium Shirt',
  variants: [{ id: 'catalog-shirt-0', sku: 'SHIRT-M', size: 'Medium' }]
};

function fileFor(rows, filename = 'reviews.xlsx') {
  const values = rows.map((row) => REVIEW_IMPORT_COLUMNS.map((column) => row[column] ?? ''));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([REVIEW_IMPORT_COLUMNS, ...values]), 'Reviews');
  return {
    originalname: filename,
    buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  };
}

function validRow(overrides = {}) {
  return {
    product_id: 'prod_real_1', product_sku: '', product_slug: '', reviewer_name: 'Import Customer',
    reviewer_email: 'import@example.com', rating: 5, review_title: 'Great',
    review_body: 'Comfortable and well made.', review_date: '2026-07-01', variant: '', size: '',
    verified_purchase: 'FALSE', order_number: '', status: 'published', photo_url_1: '', photo_url_2: '',
    photo_url_3: '', admin_reply: '', source: 'customer_submitted', ...overrides
  };
}

function dependencies(overrides = {}) {
  return {
    listProducts: async () => [product],
    existingDuplicateKeys: async () => new Set(),
    verifyReviewPurchase: async () => ({ verified: false, reason: 'order_not_found' }),
    ...overrides
  };
}

test('secure XLSX template has blank Reviews and Instructions worksheets', () => {
  assert.equal(XLSX.version, '0.20.3');
  const workbook = XLSX.read(reviewImportTemplateBuffer(), { type: 'buffer' });
  assert.deepEqual(workbook.SheetNames, ['Reviews', 'Instructions']);
  const records = parseWorkbook({ buffer: reviewImportTemplateBuffer(), originalname: 'template.xlsx' }.buffer);
  assert.deepEqual(records, []);
  const headers = XLSX.utils.sheet_to_json(workbook.Sheets.Reviews, { header: 1 })[0];
  assert.deepEqual(headers, REVIEW_IMPORT_COLUMNS);
});

test('preview matches product IDs before SKU/slug and forces imported reviews to Pending', async () => {
  const plan = await planReviewImport(fileFor([validRow()]), dependencies());
  assert.equal(plan.totalRows, 1);
  assert.equal(plan.validRows, 1);
  assert.equal(plan.rows[0].productMatch.method, 'product_id');
  assert.equal(plan.rows[0].candidate.status, 'pending');
  assert.equal(plan.rows[0].candidate.source, 'imported');
  assert.equal(plan.rows[0].candidate.verifiedPurchase, false);
  assert.match(plan.rows[0].warnings.join(' '), /changed to Pending/);
});

test('confirmed import binds to the exact preview and stores batch and original row metadata', async () => {
  const file = fileFor([validRow({ product_id: '', product_sku: 'SHIRT-M', status: 'pending' })]);
  const planned = await planReviewImport(file, dependencies());
  const inserted = [];
  const result = await importPlannedReviews(file, planned.token, dependencies({
    createImportBatch: async (input) => ({ ...input, id: 'batch-1' }),
    insertReview: async (input, options) => { inserted.push({ input, options }); return input; },
    updateImportBatch: async () => ({})
  }));
  assert.equal(result.successfulRows, 1);
  assert.equal(inserted[0].input.importBatchId, 'batch-1');
  assert.equal(inserted[0].input.originalRowNumber, 2);
  assert.equal(inserted[0].input.status, 'pending');
  assert.equal(inserted[0].input.source, 'imported');
  assert.equal(inserted[0].options.action, 'imported');

  await assert.rejects(
    importPlannedReviews(file, `${planned.token}changed`, dependencies()),
    (error) => error.status === 409
  );
});

test('verification is assigned only through a validated real order match', async () => {
  const requested = fileFor([validRow({ verified_purchase: 'TRUE', order_number: 'MCC-1' })]);
  const rejected = await planReviewImport(requested, dependencies());
  assert.equal(rejected.rows[0].candidate.verifiedPurchase, false);
  assert.match(rejected.rows[0].warnings.join(' '), /not assigned/);

  const accepted = await planReviewImport(requested, dependencies({
    verifyReviewPurchase: async () => ({ verified: true, reason: 'verified_order' })
  }));
  assert.equal(accepted.rows[0].candidate.verifiedPurchase, true);
});

test('invalid products, ratings, dates, scripts, unsafe URLs, formulas, and duplicate rows are rejected', async () => {
  const plan = await planReviewImport(fileFor([
    validRow({ product_id: 'missing' }),
    validRow({ reviewer_name: 'Bad rating', rating: 6, review_date: '15/07/2026' }),
    validRow({ reviewer_name: 'Formula', review_body: '=HYPERLINK("https://bad.example")' }),
    validRow({ reviewer_name: 'Unsafe photo', photo_url_1: 'https://127.0.0.1/image.jpg' }),
    validRow({ reviewer_name: 'Impossible date', review_date: '2026-02-30' }),
    validRow({ reviewer_name: 'Duplicate customer' }),
    validRow({ reviewer_name: 'Duplicate customer' })
  ]), dependencies());

  assert.equal(plan.invalidRows, 6);
  assert.match(plan.rows[0].errors.join(' '), /could not be matched/);
  assert.match(plan.rows[1].errors.join(' '), /Rating|date/);
  assert.match(plan.rows[2].errors.join(' '), /formula character/);
  assert.match(plan.rows[3].errors.join(' '), /public HTTPS/);
  assert.match(plan.rows[4].errors.join(' '), /date is invalid/i);
  assert.equal(plan.rows[5].valid, true);
  assert.match(plan.rows[6].errors.join(' '), /Duplicate of another row/);

  const csv = importErrorsCsv([{ rowNumber: '=2+2', errors: ['@unsafe'], warnings: [] }]);
  assert.equal(csv.includes('"\'=2+2"'), true);
  assert.equal(csv.includes('"\'@unsafe"'), true);
});
