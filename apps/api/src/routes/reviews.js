const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { findCatalogProductBySlug } = require('../products/catalogPresenter');
const { getStoreSettings } = require('../settings/storeSettingsRepository');
const { findAuthSession } = require('../auth/sessionRepository');
const { sessionTokenFromRequest } = require('../auth/sessionHttp');
const {
  insertReview,
  listPublishedReviews,
  reviewStatistics
} = require('../reviews/reviewRepository');
const {
  MAX_REVIEW_IMAGE_BYTES,
  MAX_REVIEW_IMAGES,
  cleanupReviewFiles,
  optimizeReviewImages,
  reviewImageFileAllowed,
  reviewUploadDir
} = require('../reviews/reviewImages');
const { verifyReviewPurchase } = require('../reviews/reviewVerification');

const reviewPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      const directory = reviewUploadDir();
      fs.mkdirSync(directory, { recursive: true });
      callback(null, directory);
    },
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname || '').toLowerCase();
      callback(null, `review-${Date.now()}-${crypto.randomUUID()}${extension}`);
    }
  }),
  limits: { files: MAX_REVIEW_IMAGES, fileSize: MAX_REVIEW_IMAGE_BYTES, fields: 30 },
  fileFilter: (_req, file, callback) => {
    if (!reviewImageFileAllowed(file)) {
      const error = new Error('Review photos must be JPG, PNG, or WebP files.');
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  }
});

function boolQuery(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());
}

async function optionalCustomerId(req) {
  const token = sessionTokenFromRequest(req, 'customer');
  const session = token ? await findAuthSession(token) : null;
  return session?.actorType === 'customer' ? session.actorId : '';
}

function reviewsVisible(settings, product) {
  return Boolean(
    settings.reviews.enabled &&
    settings.reviews.showOnProductPages &&
    product?.reviewSettings?.reviewsEnabled !== false
  );
}

function emptyStats() {
  return { averageRating: 0, totalReviews: 0, ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, withPhotos: 0, verifiedPurchases: 0 };
}

function createReviewsRouter() {
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  router.get('/store', async (req, res, next) => {
    try {
      const settings = await getStoreSettings();
      if (!settings.reviews.enabled || !settings.reviews.showStoreReviews) {
        return res.json({ enabled: false, reviews: [], statistics: emptyStats(), pagination: { page: 1, pageSize: 10, total: 0 } });
      }
      const [list, statistics] = await Promise.all([
        listPublishedReviews({
          reviewType: 'store', rating: req.query.rating, withPhotos: boolQuery(req.query.withPhotos),
          verified: boolQuery(req.query.verified), sort: req.query.sort, page: req.query.page, pageSize: req.query.pageSize
        }),
        reviewStatistics({ reviewType: 'store' })
      ]);
      return res.json({
        enabled: statistics.totalReviews > 0,
        reviews: list.reviews,
        statistics,
        pagination: { page: list.page, pageSize: list.pageSize, total: list.total }
      });
    } catch (error) { return next(error); }
  });

  router.get('/products/:identifier', async (req, res, next) => {
    try {
      const [product, settings] = await Promise.all([
        findCatalogProductBySlug(req.params.identifier),
        getStoreSettings()
      ]);
      if (!product) return res.status(404).json({ error: 'Product not found.' });
      if (!reviewsVisible(settings, product)) {
        return res.json({ enabled: false, canSubmit: false, reviews: [], statistics: emptyStats(), storeReviewCount: 0, pagination: { page: 1, pageSize: 10, total: 0 } });
      }
      const [list, statistics, storeStatistics] = await Promise.all([
        listPublishedReviews({
          reviewType: 'product', productSlug: product.slug, rating: req.query.rating,
          withPhotos: boolQuery(req.query.withPhotos), verified: boolQuery(req.query.verified),
          sort: req.query.sort, page: req.query.page, pageSize: req.query.pageSize
        }),
        reviewStatistics({ reviewType: 'product', productSlug: product.slug }),
        settings.reviews.showStoreReviews ? reviewStatistics({ reviewType: 'store' }) : Promise.resolve(emptyStats())
      ]);
      return res.json({
        enabled: true,
        canSubmit: settings.reviews.allowCustomerSubmissions,
        allowPhotos: settings.reviews.allowReviewPhotos,
        reviews: list.reviews,
        statistics,
        storeReviewCount: settings.reviews.showStoreReviews ? storeStatistics.totalReviews : 0,
        pagination: { page: list.page, pageSize: list.pageSize, total: list.total }
      });
    } catch (error) { return next(error); }
  });

  router.post('/products/:identifier', reviewPhotoUpload.array('photos', MAX_REVIEW_IMAGES), async (req, res, next) => {
    const files = Array.isArray(req.files) ? req.files : [];
    let optimized = [];
    try {
      const [product, settings, customerId] = await Promise.all([
        findCatalogProductBySlug(req.params.identifier),
        getStoreSettings(),
        optionalCustomerId(req)
      ]);
      if (!product) throw Object.assign(new Error('Product not found.'), { status: 404 });
      if (!reviewsVisible(settings, product) || !settings.reviews.allowCustomerSubmissions) {
        throw Object.assign(new Error('Customer review submissions are currently disabled.'), { status: 403 });
      }
      if (String(req.body?.website || '').trim()) {
        await cleanupReviewFiles(files);
        return res.status(202).json({ message: 'Thank you! Your review has been submitted for approval.' });
      }
      if (!['true', '1', 'yes', 'on'].includes(String(req.body?.consent || '').toLowerCase())) {
        throw Object.assign(new Error('Please confirm that you consent to publishing your review.'), { status: 400 });
      }
      if (files.length && !settings.reviews.allowReviewPhotos) {
        throw Object.assign(new Error('Review photo uploads are currently disabled.'), { status: 403 });
      }
      const verification = await verifyReviewPurchase({
        orderNumber: req.body?.orderNumber,
        reviewerEmail: req.body?.reviewerEmail,
        customerId,
        product
      });
      const matchedVariant = verification.item?.size || '';
      const publishVerified = verification.verified && settings.reviews.autoPublishVerified && !settings.reviews.requireAdminApproval;
      optimized = settings.reviews.allowReviewPhotos ? await optimizeReviewImages(files) : [];
      const review = await insertReview({
        productSlug: product.slug,
        customerId,
        orderNumber: req.body?.orderNumber,
        reviewerName: req.body?.reviewerName,
        reviewerEmail: req.body?.reviewerEmail,
        requireEmail: true,
        rating: req.body?.rating,
        title: req.body?.title,
        body: req.body?.body,
        variant: req.body?.variant || matchedVariant,
        size: req.body?.size || matchedVariant,
        status: publishVerified ? 'published' : 'pending',
        source: verification.verified ? 'verified_order' : 'customer_submitted',
        verifiedPurchase: verification.verified
      }, {
        images: optimized,
        actor: customerId ? `customer:${customerId}` : 'customer',
        action: 'submitted'
      });
      return res.status(201).json({
        id: review.id,
        status: review.status,
        message: review.status === 'published'
          ? 'Thank you! Your review has been published.'
          : 'Thank you! Your review has been submitted for approval.'
      });
    } catch (error) {
      try {
        await cleanupReviewFiles([...files, ...optimized]);
      } catch (cleanupError) { cleanupError.cause = error; return next(cleanupError); }
      return next(error);
    }
  });

  return router;
}

module.exports = { createReviewsRouter, reviewPhotoUpload, reviewsRouter: createReviewsRouter(), reviewsVisible };
