const express = require('express');
const multer = require('multer');
const { findEditableProductBySlug, listEditableProducts } = require('../products/catalogRepository');
const { getStoreSettings, updateSettingsSection } = require('../settings/storeSettingsRepository');
const {
  REVIEW_STATUSES,
  findReviewById,
  insertReview,
  listAdminReviews,
  listImportBatches,
  listReviewAudit,
  permanentDeleteReview,
  reviewStatusCounts,
  updateReview
} = require('../reviews/reviewRepository');
const { safeRemoteReviewImageUrl } = require('../reviews/reviewImages');
const { verifyReviewPurchase } = require('../reviews/reviewVerification');
const {
  MAX_IMPORT_BYTES,
  importErrorsCsv,
  importPlannedReviews,
  planReviewImport,
  reviewImportTemplateBuffer
} = require('../reviews/reviewImport');

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_IMPORT_BYTES, fields: 10 },
  fileFilter: (_req, file, callback) => {
    if (!String(file.originalname || '').toLowerCase().endsWith('.xlsx')) {
      const error = new Error('Review import supports .xlsx files only.');
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  }
});

const REASON_REQUIRED = new Set(['hidden', 'archived', 'spam', 'rejected']);

function boolQuery(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());
}

function requiredReason(value) {
  const reason = String(value || '').trim();
  if (!reason) throw Object.assign(new Error('A moderation reason is required for this action.'), { status: 400 });
  if (reason.length > 500) throw Object.assign(new Error('Moderation reason must be 500 characters or fewer.'), { status: 400 });
  return reason;
}

function adminImageUrl(value) {
  const url = String(value?.imageUrl || value || '').trim();
  if (/^\/uploads\/reviews\/[a-zA-Z0-9._-]+$/.test(url)) return url;
  return safeRemoteReviewImageUrl(url);
}

function publicProductRecord(product) {
  return { id: product.id, slug: product.slug, name: product.name, publicHandle: product.publicHandle };
}

async function productForReview(value) {
  const slug = String(value || '').trim();
  const product = slug ? await findEditableProductBySlug(slug) : null;
  if (!product) throw Object.assign(new Error('Select a valid product.'), { status: 400 });
  return product;
}

async function verifiedState(input, product, current = {}) {
  const raw = input.verifiedPurchase === undefined ? current.verifiedPurchase : input.verifiedPurchase;
  const wantsVerification = raw === true || ['true', '1', 'yes'].includes(String(raw || '').toLowerCase());
  if (!wantsVerification) return false;
  const verification = await verifyReviewPurchase({
    orderNumber: input.orderNumber ?? current.orderNumber,
    reviewerEmail: input.reviewerEmail ?? current.reviewerEmail,
    customerId: input.customerId ?? current.customerId,
    product
  });
  if (!verification.verified) {
    const error = new Error(`Verified Purchase cannot be assigned: ${verification.reason.replaceAll('_', ' ')}.`);
    error.status = 409;
    error.code = 'review_verification_failed';
    throw error;
  }
  return true;
}

function editableChanges(body, product, verifiedPurchase) {
  return {
    productSlug: product.slug,
    reviewerName: body.reviewerName,
    reviewerEmail: body.reviewerEmail,
    rating: body.rating,
    title: body.title,
    body: body.body,
    variant: body.variant,
    size: body.size,
    orderNumber: body.orderNumber,
    status: body.status,
    verifiedPurchase,
    adminReply: body.adminReply,
    adminReplyDate: body.adminReply ? (body.adminReplyDate || new Date().toISOString()) : null,
    concernResolved: Boolean(body.concernResolved),
    resolvedAt: body.concernResolved ? new Date().toISOString() : '',
    createdAt: body.createdAt
  };
}

function createAdminReviewsRouter() {
  const router = express.Router();

  router.get('/counts', async (_req, res, next) => {
    try { return res.json({ counts: await reviewStatusCounts() }); }
    catch (error) { return next(error); }
  });

  router.get('/settings', async (_req, res, next) => {
    try { return res.json({ settings: (await getStoreSettings()).reviews }); }
    catch (error) { return next(error); }
  });

  router.put('/settings', async (req, res, next) => {
    try {
      const settings = await updateSettingsSection('reviews', req.body || {});
      return res.json({ settings: settings.reviews });
    } catch (error) { return next(error); }
  });

  router.get('/products', async (_req, res, next) => {
    try {
      const products = await listEditableProducts();
      return res.json({ products: products.map(publicProductRecord) });
    } catch (error) { return next(error); }
  });

  router.get('/import/template', (_req, res, next) => {
    try {
      const buffer = reviewImportTemplateBuffer();
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="maria-clara-review-import-template.xlsx"',
        'Content-Length': String(buffer.length)
      });
      return res.send(buffer);
    } catch (error) { return next(error); }
  });

  router.post('/import/preview', importUpload.single('file'), async (req, res, next) => {
    try {
      const plan = await planReviewImport(req.file);
      return res.json({
        preview: {
          parser: plan.parser,
          totalRows: plan.totalRows,
          validRows: plan.validRows,
          invalidRows: plan.invalidRows,
          rows: plan.rows.map((row) => ({
            rowNumber: row.rowNumber,
            valid: row.valid,
            errors: row.errors,
            warnings: row.warnings,
            productMatch: row.productMatch,
            reviewerName: row.candidate?.reviewerName || String(row.original.reviewer_name || ''),
            rating: row.candidate?.rating || row.original.rating,
            title: row.candidate?.title || String(row.original.review_title || '')
          }))
        },
        previewToken: plan.token,
        errorReportCsv: importErrorsCsv(plan.rows.filter((row) => !row.valid))
      });
    } catch (error) { return next(error); }
  });

  router.post('/import/confirm', importUpload.single('file'), async (req, res, next) => {
    try {
      const result = await importPlannedReviews(req.file, req.body?.previewToken);
      return res.status(201).json({ ...result, errorReportCsv: importErrorsCsv(result.errors) });
    } catch (error) { return next(error); }
  });

  router.get('/import/batches', async (_req, res, next) => {
    try { return res.json({ batches: await listImportBatches() }); }
    catch (error) { return next(error); }
  });

  router.get('/import/batches/:batchId/errors.csv', async (req, res, next) => {
    try {
      const batch = (await listImportBatches()).find((item) => item.id === req.params.batchId);
      if (!batch) return res.status(404).json({ error: 'Import batch not found.' });
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="review-import-errors-${batch.id}.csv"` });
      return res.send(`\uFEFF${importErrorsCsv(batch.errorReport)}`);
    } catch (error) { return next(error); }
  });

  router.get('/', async (req, res, next) => {
    try {
      const [list, counts, products] = await Promise.all([
        listAdminReviews({
          status: req.query.status,
          productSlug: req.query.productSlug,
          source: req.query.source,
          rating: req.query.rating,
          verified: boolQuery(req.query.verified),
          withPhotos: boolQuery(req.query.withPhotos),
          includeDeleted: boolQuery(req.query.includeDeleted),
          dateFrom: req.query.dateFrom,
          dateTo: req.query.dateTo,
          search: req.query.search,
          page: req.query.page,
          pageSize: req.query.pageSize
        }),
        reviewStatusCounts(),
        listEditableProducts()
      ]);
      const names = new Map(products.map((product) => [product.slug, product.name]));
      return res.json({
        reviews: list.reviews.map((review) => ({ ...review, productName: names.get(review.productSlug) || 'Store review' })),
        counts,
        pagination: { page: list.page, pageSize: list.pageSize, total: list.total }
      });
    } catch (error) { return next(error); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const product = await productForReview(req.body?.productSlug);
      const verifiedPurchase = await verifiedState(req.body || {}, product);
      const status = String(req.body?.status || 'pending').toLowerCase();
      const reason = REASON_REQUIRED.has(status) ? requiredReason(req.body?.moderationReason) : '';
      const review = await insertReview({
        ...req.body,
        productSlug: product.slug,
        status,
        source: 'admin_created',
        verifiedPurchase,
        moderationReason: reason,
        moderatedBy: reason ? 'admin' : '',
        moderatedAt: reason ? new Date().toISOString() : ''
      }, { images: (req.body?.imageUrls || []).map(adminImageUrl).filter(Boolean), actor: 'admin', action: 'admin_created' });
      return res.status(201).json({ review });
    } catch (error) { return next(error); }
  });

  router.post('/bulk', async (req, res, next) => {
    try {
      const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).filter(Boolean))];
      if (!ids.length || ids.length > 100) return res.status(400).json({ error: 'Select between 1 and 100 reviews.' });
      const action = String(req.body?.action || '').toLowerCase();
      const statusByAction = { publish: 'published', hide: 'hidden', archive: 'archived', spam: 'spam', reject: 'rejected', restore: 'pending' };
      const status = statusByAction[action];
      if (!status) return res.status(400).json({ error: 'Bulk review action is invalid.' });
      const reason = REASON_REQUIRED.has(status) ? requiredReason(req.body?.reason) : String(req.body?.reason || '').trim();
      const results = [];
      for (const id of ids) {
        const current = await findReviewById(id);
        if (!current) continue;
        const restoredStatus = action === 'restore' && ['published', 'pending'].includes(current.previousStatus) ? current.previousStatus : status;
        results.push(await updateReview(id, {
          status: restoredStatus,
          moderationReason: reason,
          moderatedBy: 'admin',
          moderatedAt: new Date().toISOString(),
          deletedAt: ''
        }, { actor: 'admin', action: `bulk_${action}`, reason }));
      }
      return res.json({ reviews: results, updated: results.length });
    } catch (error) { return next(error); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const review = await findReviewById(req.params.id);
      if (!review) return res.status(404).json({ error: 'Review not found.' });
      const [audit, product] = await Promise.all([
        listReviewAudit(review.id),
        review.productSlug ? findEditableProductBySlug(review.productSlug) : null
      ]);
      return res.json({ review: { ...review, productName: product?.name || 'Store review' }, audit });
    } catch (error) { return next(error); }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const current = await findReviewById(req.params.id);
      if (!current) return res.status(404).json({ error: 'Review not found.' });
      const product = await productForReview(req.body?.productSlug || current.productSlug);
      const verifiedPurchase = await verifiedState(req.body || {}, product, current);
      const nextStatus = String(req.body?.status || current.status).toLowerCase();
      if (!REVIEW_STATUSES.includes(nextStatus)) return res.status(400).json({ error: 'Review status is invalid.' });
      const changedToModerated = nextStatus !== current.status && REASON_REQUIRED.has(nextStatus);
      const reason = REASON_REQUIRED.has(nextStatus)
        ? requiredReason(req.body?.moderationReason ?? current.moderationReason)
        : String(req.body?.moderationReason ?? current.moderationReason ?? '').trim();
      const imageUrls = req.body?.imageUrls === undefined ? undefined : req.body.imageUrls.map(adminImageUrl).filter(Boolean);
      const review = await updateReview(current.id, {
        ...editableChanges({ ...current, ...req.body, status: nextStatus }, product, verifiedPurchase),
        moderationReason: reason,
        moderatedBy: changedToModerated ? 'admin' : current.moderatedBy,
        moderatedAt: changedToModerated ? new Date().toISOString() : current.moderatedAt
      }, { actor: 'admin', action: 'edited', reason, imageUrls });
      return res.json({ review });
    } catch (error) { return next(error); }
  });

  router.post('/:id/moderate', async (req, res, next) => {
    try {
      const current = await findReviewById(req.params.id);
      if (!current) return res.status(404).json({ error: 'Review not found.' });
      const action = String(req.body?.action || '').toLowerCase();
      const map = { publish: 'published', hide: 'hidden', archive: 'archived', spam: 'spam', reject: 'rejected' };
      let status = map[action];
      if (action === 'restore') status = ['published', 'pending'].includes(current.previousStatus) ? current.previousStatus : 'pending';
      if (!status) return res.status(400).json({ error: 'Moderation action is invalid.' });
      const reason = REASON_REQUIRED.has(status) ? requiredReason(req.body?.reason) : String(req.body?.reason || '').trim();
      const review = await updateReview(current.id, {
        status,
        moderationReason: reason,
        moderatedBy: 'admin',
        moderatedAt: new Date().toISOString(),
        deletedAt: ''
      }, { actor: 'admin', action, reason });
      return res.json({ review });
    } catch (error) { return next(error); }
  });

  router.put('/:id/reply', async (req, res, next) => {
    try {
      const reply = String(req.body?.reply || '').trim();
      const review = await updateReview(req.params.id, {
        adminReply: reply,
        adminReplyDate: reply ? new Date().toISOString() : null
      }, { actor: 'admin', action: reply ? 'reply_saved' : 'reply_removed' });
      if (!review) return res.status(404).json({ error: 'Review not found.' });
      return res.json({ review });
    } catch (error) { return next(error); }
  });

  router.put('/:id/resolved', async (req, res, next) => {
    try {
      const resolved = Boolean(req.body?.resolved);
      const review = await updateReview(req.params.id, {
        concernResolved: resolved,
        resolvedAt: resolved ? new Date().toISOString() : ''
      }, { actor: 'admin', action: resolved ? 'concern_resolved' : 'concern_reopened' });
      if (!review) return res.status(404).json({ error: 'Review not found.' });
      return res.json({ review });
    } catch (error) { return next(error); }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const reason = requiredReason(req.body?.reason);
      if (req.body?.permanent) {
        if (req.body?.confirmation !== 'PERMANENTLY DELETE') {
          return res.status(400).json({ error: 'Type PERMANENTLY DELETE to confirm.' });
        }
        const deleted = await permanentDeleteReview(req.params.id, { actor: 'admin', reason });
        if (!deleted) return res.status(404).json({ error: 'Review not found.' });
        return res.status(204).end();
      }
      const review = await updateReview(req.params.id, {
        previousStatus: (await findReviewById(req.params.id))?.status || 'pending',
        status: 'hidden',
        moderationReason: reason,
        moderatedBy: 'admin',
        moderatedAt: new Date().toISOString(),
        deletedAt: new Date().toISOString()
      }, { actor: 'admin', action: 'soft_deleted', reason });
      if (!review) return res.status(404).json({ error: 'Review not found.' });
      return res.json({ review, deleted: true });
    } catch (error) { return next(error); }
  });

  return router;
}

module.exports = { createAdminReviewsRouter };
