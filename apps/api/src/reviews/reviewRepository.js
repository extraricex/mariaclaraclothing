const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { hasDatabaseUrl, query, transaction } = require('../db/postgres');
const { resolveRuntimeDataFile } = require('../db/runtimeDataFile');

const REVIEW_STATUSES = ['pending', 'published', 'hidden', 'archived', 'spam', 'rejected'];
const REVIEW_SOURCES = ['customer_submitted', 'imported', 'admin_created', 'verified_order'];
const REVIEW_TYPES = ['product', 'store'];
const DEFAULT_DATA_FILE = path.join(__dirname, '..', '..', 'data', 'reviews.json');
const EMPTY_STORE = { reviews: [], images: [], importBatches: [], auditEvents: [] };
const PUBLIC_REVIEW_SQL_FILTER = [
  "status='published'",
  'deleted_at IS NULL',
  'rating BETWEEN 1 AND 5',
  "lower(coalesce(original_import_data->>'is_test','false')) NOT IN ('true','1','yes')",
  "lower(coalesce(original_import_data->>'test','false')) NOT IN ('true','1','yes')",
  "lower(coalesce(original_import_data->>'is_demo','false')) NOT IN ('true','1','yes')",
  "lower(coalesce(original_import_data->>'demo','false')) NOT IN ('true','1','yes')"
].join(' AND ');

function truthyDataFlag(value) {
  return value === true || ['true', '1', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function isDemoOrTestReview(review) {
  const data = review?.originalImportData && typeof review.originalImportData === 'object'
    ? review.originalImportData
    : {};
  return ['is_test', 'test', 'is_demo', 'demo'].some((key) => truthyDataFlag(data[key]));
}

function hasValidRating(review) {
  const rating = Number(review?.rating);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

function isEligiblePublishedReview(review) {
  return review?.status === 'published' &&
    !review.deletedAt &&
    hasValidRating(review) &&
    !isDemoOrTestReview(review);
}

function ratingDistributionFromReviews(reviews) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const review of reviews) distribution[Number(review.rating)] += 1;
  return distribution;
}

function ratingSummaryFromReviews(reviews) {
  const eligible = reviews.filter(isEligiblePublishedReview);
  const ratingCount = eligible.length;
  const averageRating = ratingCount
    ? Number((eligible.reduce((sum, review) => sum + Number(review.rating), 0) / ratingCount).toFixed(2))
    : 0;
  return {
    averageRating,
    ratingCount,
    totalReviews: ratingCount,
    ratingDistribution: ratingDistributionFromReviews(eligible),
    hasRatings: ratingCount > 0
  };
}

function reviewsDataFile() {
  return resolveRuntimeDataFile('REVIEWS_DATA_FILE', DEFAULT_DATA_FILE);
}

function usePostgresReviews() {
  return hasDatabaseUrl() && !process.env.REVIEWS_DATA_FILE;
}

function httpError(status, message, code = '') {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function sanitizePlainText(value, maxLength, { required = false, field = 'Text' } = {}) {
  const text = String(value ?? '')
    .normalize('NFKC')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (required && !text) throw httpError(400, `${field} is required.`, 'review_invalid');
  if (text.length > maxLength) throw httpError(400, `${field} must be ${maxLength} characters or fewer.`, 'review_invalid');
  return text;
}

function normalizeEmail(value, { required = false } = {}) {
  const email = String(value || '').trim().toLowerCase();
  if (!email && !required) return '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, 'Enter a valid email address.', 'review_invalid');
  }
  return email;
}

function normalizeRating(value) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw httpError(400, 'Rating must be a whole number from 1 to 5.', 'review_invalid');
  }
  return rating;
}

function normalizeDate(value, fallback = new Date().toISOString()) {
  const parsed = new Date(value || fallback);
  if (!Number.isFinite(parsed.getTime())) throw httpError(400, 'Review date is invalid.', 'review_invalid');
  return parsed.toISOString();
}

function normalizeEnum(value, allowed, fallback, field) {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (!allowed.includes(normalized)) throw httpError(400, `${field} is invalid.`, 'review_invalid');
  return normalized;
}

function reviewDuplicateKey(review) {
  const identity = review.reviewerEmail || review.reviewerName.toLowerCase();
  const source = [
    review.reviewType,
    review.productSlug || 'store',
    identity,
    review.rating,
    review.body.toLowerCase().replace(/\s+/g, ' '),
    String(review.createdAt || '').slice(0, 10)
  ].join('|');
  return crypto.createHash('sha256').update(source).digest('hex');
}

function normalizeReview(input = {}, current = null) {
  const createdAt = normalizeDate(input.createdAt, current?.createdAt || new Date().toISOString());
  const reviewType = normalizeEnum(input.reviewType, REVIEW_TYPES, current?.reviewType || 'product', 'Review type');
  const productSlug = sanitizePlainText(input.productSlug ?? current?.productSlug, 180);
  if (reviewType === 'product' && !productSlug) throw httpError(400, 'A product is required.', 'review_invalid');
  const review = {
    id: String(input.id || current?.id || crypto.randomUUID()),
    reviewType,
    productSlug: reviewType === 'store' ? '' : productSlug,
    customerId: sanitizePlainText(input.customerId ?? current?.customerId, 120),
    orderNumber: sanitizePlainText(input.orderNumber ?? current?.orderNumber, 120),
    reviewerName: sanitizePlainText(input.reviewerName ?? current?.reviewerName, 100, { required: true, field: 'Customer name' }),
    reviewerEmail: normalizeEmail(input.reviewerEmail ?? current?.reviewerEmail, { required: Boolean(input.requireEmail) }),
    rating: normalizeRating(input.rating ?? current?.rating),
    title: sanitizePlainText(input.title ?? current?.title, 150),
    body: sanitizePlainText(input.body ?? current?.body, 5000, { required: true, field: 'Review message' }),
    variant: sanitizePlainText(input.variant ?? current?.variant, 120),
    size: sanitizePlainText(input.size ?? current?.size, 80),
    status: normalizeEnum(input.status, REVIEW_STATUSES, current?.status || 'pending', 'Review status'),
    source: normalizeEnum(input.source, REVIEW_SOURCES, current?.source || 'customer_submitted', 'Review source'),
    verifiedPurchase: Boolean(input.verifiedPurchase ?? current?.verifiedPurchase),
    helpfulCount: Math.max(0, Math.trunc(Number(input.helpfulCount ?? current?.helpfulCount ?? 0))),
    adminReply: sanitizePlainText(input.adminReply ?? current?.adminReply, 3000),
    adminReplyDate: input.adminReplyDate === null || (input.adminReply ?? current?.adminReply) === ''
      ? ''
      : normalizeDate(input.adminReplyDate, current?.adminReplyDate || new Date().toISOString()),
    moderationReason: sanitizePlainText(input.moderationReason ?? current?.moderationReason, 500),
    moderatedBy: sanitizePlainText(input.moderatedBy ?? current?.moderatedBy, 120),
    moderatedAt: input.moderatedAt ? normalizeDate(input.moderatedAt) : current?.moderatedAt || '',
    previousStatus: sanitizePlainText(input.previousStatus ?? current?.previousStatus, 40),
    concernResolved: Boolean(input.concernResolved ?? current?.concernResolved),
    resolvedAt: input.resolvedAt === '' ? '' : input.resolvedAt ? normalizeDate(input.resolvedAt) : current?.resolvedAt || '',
    importBatchId: sanitizePlainText(input.importBatchId ?? current?.importBatchId, 120),
    originalRowNumber: input.originalRowNumber === undefined
      ? current?.originalRowNumber ?? null
      : (Number.isInteger(Number(input.originalRowNumber)) ? Number(input.originalRowNumber) : null),
    originalImportData: input.originalImportData && typeof input.originalImportData === 'object'
      ? input.originalImportData
      : current?.originalImportData || {},
    createdAt,
    updatedAt: normalizeDate(input.updatedAt, new Date().toISOString()),
    deletedAt: input.deletedAt === '' ? '' : input.deletedAt ? normalizeDate(input.deletedAt) : current?.deletedAt || ''
  };
  review.duplicateKey = reviewDuplicateKey(review);
  return review;
}

function normalizeImage(input, reviewId, index) {
  const imageUrl = String(input?.imageUrl || input || '').trim();
  if (!imageUrl || imageUrl.length > 2048) throw httpError(400, 'Review photo URL is invalid.', 'review_image_invalid');
  return {
    id: String(input?.id || crypto.randomUUID()),
    reviewId,
    imageUrl,
    sortOrder: Number.isInteger(Number(input?.sortOrder)) ? Math.max(0, Number(input.sortOrder)) : index,
    createdAt: normalizeDate(input?.createdAt)
  };
}

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(reviewsDataFile(), 'utf8'));
    return {
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
      images: Array.isArray(parsed.images) ? parsed.images : [],
      importBatches: Array.isArray(parsed.importBatches) ? parsed.importBatches : [],
      auditEvents: Array.isArray(parsed.auditEvents) ? parsed.auditEvents : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(EMPTY_STORE);
    throw error;
  }
}

async function writeStore(store) {
  const file = reviewsDataFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(store, null, 2)}\n`);
}

function fromRow(row) {
  return {
    id: row.id,
    reviewType: row.review_type,
    productSlug: row.product_slug || '',
    customerId: row.customer_id || '',
    orderNumber: row.order_number || '',
    reviewerName: row.reviewer_name,
    reviewerEmail: row.reviewer_email || '',
    rating: Number(row.rating),
    title: row.title || '',
    body: row.body,
    variant: row.variant || '',
    size: row.size || '',
    status: row.status,
    source: row.source,
    verifiedPurchase: Boolean(row.verified_purchase),
    helpfulCount: Number(row.helpful_count || 0),
    adminReply: row.admin_reply || '',
    adminReplyDate: row.admin_reply_date ? new Date(row.admin_reply_date).toISOString() : '',
    moderationReason: row.moderation_reason || '',
    moderatedBy: row.moderated_by || '',
    moderatedAt: row.moderated_at ? new Date(row.moderated_at).toISOString() : '',
    previousStatus: row.previous_status || '',
    concernResolved: Boolean(row.concern_resolved),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : '',
    importBatchId: row.import_batch_id || '',
    originalRowNumber: row.original_row_number === null ? null : Number(row.original_row_number),
    originalImportData: row.original_import_data || {},
    duplicateKey: row.duplicate_key,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : '',
    images: []
  };
}

function imageFromRow(row) {
  return {
    id: row.id,
    reviewId: row.review_id,
    imageUrl: row.image_url,
    sortOrder: Number(row.sort_order || 0),
    createdAt: new Date(row.created_at).toISOString()
  };
}

async function imagesForReviewIds(ids, executor = { query }) {
  if (!ids.length) return new Map();
  const result = await executor.query(
    'SELECT * FROM review_images WHERE review_id = ANY($1::text[]) ORDER BY review_id, sort_order, created_at',
    [ids]
  );
  const grouped = new Map();
  for (const row of result.rows.map(imageFromRow)) {
    grouped.set(row.reviewId, [...(grouped.get(row.reviewId) || []), row]);
  }
  return grouped;
}

async function attachPostgresImages(reviews, executor = { query }) {
  const images = await imagesForReviewIds(reviews.map((review) => review.id), executor);
  return reviews.map((review) => ({ ...review, images: images.get(review.id) || [] }));
}

function attachJsonImages(reviews, store) {
  return reviews.map((review) => ({
    ...review,
    images: store.images
      .filter((image) => image.reviewId === review.id)
      .sort((left, right) => left.sortOrder - right.sortOrder)
  }));
}

async function insertReview(input, { images = [], actor = 'customer', action = 'submitted', client = null } = {}) {
  const review = normalizeReview(input);
  const normalizedImages = images.map((image, index) => normalizeImage(image, review.id, index));
  if (usePostgresReviews()) {
    const persist = async (executor) => {
      try {
        await executor.query(
          `INSERT INTO reviews (
            id,review_type,product_slug,customer_id,order_number,reviewer_name,reviewer_email,rating,title,body,
            variant,size,status,source,verified_purchase,helpful_count,admin_reply,admin_reply_date,moderation_reason,
            moderated_by,moderated_at,previous_status,concern_resolved,resolved_at,import_batch_id,original_row_number,
            original_import_data,duplicate_key,created_at,updated_at,deleted_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb,$28,$29,$30,$31
          )`,
          reviewValues(review)
        );
      } catch (error) {
        if (error.code === '23505') throw httpError(409, 'This review appears to have already been submitted.', 'review_duplicate');
        throw error;
      }
      for (const image of normalizedImages) {
        await executor.query(
          'INSERT INTO review_images (id,review_id,image_url,sort_order,created_at) VALUES ($1,$2,$3,$4,$5)',
          [image.id, image.reviewId, image.imageUrl, image.sortOrder, image.createdAt]
        );
      }
      await insertAuditPostgres(executor, review.id, actor, action, '', {}, safeAuditSnapshot(review));
      return { ...review, images: normalizedImages };
    };
    return client ? persist(client) : transaction(persist);
  }

  const store = await readStore();
  if (store.reviews.some((item) => !item.deletedAt && item.duplicateKey === review.duplicateKey)) {
    throw httpError(409, 'This review appears to have already been submitted.', 'review_duplicate');
  }
  store.reviews.push(review);
  store.images.push(...normalizedImages);
  store.auditEvents.push(auditRecord(review.id, actor, action, '', {}, safeAuditSnapshot(review)));
  await writeStore(store);
  return { ...review, images: normalizedImages };
}

function reviewValues(review) {
  return [
    review.id, review.reviewType, review.productSlug || null, review.customerId || null, review.orderNumber || null,
    review.reviewerName, review.reviewerEmail, review.rating, review.title, review.body, review.variant, review.size,
    review.status, review.source, review.verifiedPurchase, review.helpfulCount, review.adminReply,
    review.adminReplyDate || null, review.moderationReason, review.moderatedBy, review.moderatedAt || null,
    review.previousStatus, review.concernResolved, review.resolvedAt || null, review.importBatchId || null,
    review.originalRowNumber, JSON.stringify(review.originalImportData || {}), review.duplicateKey,
    review.createdAt, review.updatedAt, review.deletedAt || null
  ];
}

function safeAuditSnapshot(review) {
  return {
    productSlug: review.productSlug,
    rating: review.rating,
    title: review.title,
    body: review.body,
    variant: review.variant,
    size: review.size,
    status: review.status,
    verifiedPurchase: review.verifiedPurchase,
    adminReply: review.adminReply,
    concernResolved: review.concernResolved,
    deletedAt: review.deletedAt
  };
}

function auditRecord(reviewId, actor, action, reason, previousValues, nextValues) {
  return {
    id: crypto.randomUUID(), reviewId, actor: String(actor || 'admin'), action: String(action || 'updated'),
    reason: String(reason || ''), previousValues, nextValues, createdAt: new Date().toISOString()
  };
}

async function insertAuditPostgres(executor, reviewId, actor, action, reason, previousValues, nextValues) {
  const audit = auditRecord(reviewId, actor, action, reason, previousValues, nextValues);
  await executor.query(
    `INSERT INTO review_audit_events (id,review_id,actor,action,reason,previous_values,next_values,created_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
    [audit.id, audit.reviewId, audit.actor, audit.action, audit.reason, JSON.stringify(previousValues), JSON.stringify(nextValues), audit.createdAt]
  );
  return audit;
}

async function findReviewById(id, { client = null } = {}) {
  const reviewId = String(id || '').trim();
  if (!reviewId) return null;
  if (usePostgresReviews()) {
    const executor = client || { query };
    const result = await executor.query('SELECT * FROM reviews WHERE id=$1', [reviewId]);
    if (!result.rows[0]) return null;
    return (await attachPostgresImages([fromRow(result.rows[0])], executor))[0];
  }
  const store = await readStore();
  const review = store.reviews.find((item) => item.id === reviewId);
  return review ? attachJsonImages([review], store)[0] : null;
}

async function updateReview(id, changes = {}, { actor = 'admin', action = 'updated', reason = '', imageUrls } = {}) {
  const persist = async (client = null) => {
    const current = await findReviewById(id, { client });
    if (!current) return null;
    const next = normalizeReview({
      ...current,
      ...changes,
      previousStatus: changes.status && changes.status !== current.status ? current.status : current.previousStatus,
      updatedAt: new Date().toISOString()
    }, current);
    const nextImages = imageUrls === undefined
      ? current.images
      : imageUrls.map((image, index) => normalizeImage(image, next.id, index));
    if (usePostgresReviews()) {
      const executor = client;
      try {
        await executor.query(
          `UPDATE reviews SET
             review_type=$2,product_slug=$3,customer_id=$4,order_number=$5,reviewer_name=$6,reviewer_email=$7,
             rating=$8,title=$9,body=$10,variant=$11,size=$12,status=$13,source=$14,verified_purchase=$15,
             helpful_count=$16,admin_reply=$17,admin_reply_date=$18,moderation_reason=$19,moderated_by=$20,
             moderated_at=$21,previous_status=$22,concern_resolved=$23,resolved_at=$24,import_batch_id=$25,
             original_row_number=$26,original_import_data=$27::jsonb,duplicate_key=$28,created_at=$29,updated_at=$30,deleted_at=$31
           WHERE id=$1`,
          reviewValues(next)
        );
      } catch (error) {
        if (error.code === '23505') throw httpError(409, 'This review duplicates an existing review.', 'review_duplicate');
        throw error;
      }
      if (imageUrls !== undefined) {
        await executor.query('DELETE FROM review_images WHERE review_id=$1', [next.id]);
        for (const image of nextImages) {
          await executor.query(
            'INSERT INTO review_images (id,review_id,image_url,sort_order,created_at) VALUES ($1,$2,$3,$4,$5)',
            [image.id, image.reviewId, image.imageUrl, image.sortOrder, image.createdAt]
          );
        }
      }
      await insertAuditPostgres(executor, next.id, actor, action, reason, safeAuditSnapshot(current), safeAuditSnapshot(next));
      return { ...next, images: nextImages };
    }

    const store = await readStore();
    if (store.reviews.some((item) => item.id !== next.id && !item.deletedAt && item.duplicateKey === next.duplicateKey)) {
      throw httpError(409, 'This review duplicates an existing review.', 'review_duplicate');
    }
    const index = store.reviews.findIndex((item) => item.id === next.id);
    store.reviews[index] = next;
    if (imageUrls !== undefined) {
      store.images = store.images.filter((image) => image.reviewId !== next.id);
      store.images.push(...nextImages);
    }
    store.auditEvents.push(auditRecord(next.id, actor, action, reason, safeAuditSnapshot(current), safeAuditSnapshot(next)));
    await writeStore(store);
    return { ...next, images: nextImages };
  };
  return usePostgresReviews() ? transaction(persist) : persist();
}

function publicReview(review) {
  return {
    id: review.id,
    reviewType: review.reviewType,
    productSlug: review.productSlug,
    reviewerName: review.reviewerName,
    rating: review.rating,
    title: review.title,
    body: review.body,
    variant: review.variant,
    size: review.size,
    verifiedPurchase: review.verifiedPurchase,
    helpfulCount: review.helpfulCount,
    adminReply: review.adminReply,
    adminReplyDate: review.adminReplyDate,
    concernResolved: review.concernResolved,
    createdAt: review.createdAt,
    images: (review.images || []).map(({ id, imageUrl, sortOrder }) => ({ id, imageUrl, sortOrder }))
  };
}

function normalizedPagination(input = {}) {
  const requestedPageSize = Math.trunc(Number(input.pageSize));
  const requestedPage = Math.trunc(Number(input.page));
  const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0
    ? Math.min(50, requestedPageSize)
    : 10;
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function reviewSort(sort) {
  return {
    highest: 'rating DESC, created_at DESC',
    lowest: 'rating ASC, created_at DESC',
    helpful: 'helpful_count DESC, created_at DESC'
  }[sort] || 'created_at DESC';
}

async function listPublishedReviews(input = {}) {
  const pagination = normalizedPagination(input);
  const reviewType = input.reviewType === 'store' ? 'store' : 'product';
  const rating = Number(input.rating);
  if (usePostgresReviews()) {
    const values = [reviewType];
    const where = [PUBLIC_REVIEW_SQL_FILTER, 'review_type=$1'];
    if (reviewType === 'product') {
      values.push(String(input.productSlug || ''));
      where.push(`product_slug=$${values.length}`);
    }
    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
      values.push(rating); where.push(`rating=$${values.length}`);
    }
    if (input.verified) where.push('verified_purchase=true');
    if (input.withPhotos) where.push('EXISTS (SELECT 1 FROM review_images i WHERE i.review_id=reviews.id)');
    const count = await query(`SELECT count(*)::integer AS total FROM reviews WHERE ${where.join(' AND ')}`, values);
    values.push(pagination.pageSize, pagination.offset);
    const result = await query(
      `SELECT * FROM reviews WHERE ${where.join(' AND ')} ORDER BY ${reviewSort(input.sort)} LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    const records = await attachPostgresImages(result.rows.map(fromRow));
    return { reviews: records.map(publicReview), total: Number(count.rows[0]?.total || 0), ...pagination };
  }

  const store = await readStore();
  let records = attachJsonImages(store.reviews.filter((review) => (
    isEligiblePublishedReview(review) && review.reviewType === reviewType &&
    (reviewType === 'store' || review.productSlug === input.productSlug)
  )), store);
  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) records = records.filter((review) => review.rating === rating);
  if (input.verified) records = records.filter((review) => review.verifiedPurchase);
  if (input.withPhotos) records = records.filter((review) => review.images.length > 0);
  records.sort((left, right) => {
    if (input.sort === 'highest') return right.rating - left.rating || right.createdAt.localeCompare(left.createdAt);
    if (input.sort === 'lowest') return left.rating - right.rating || right.createdAt.localeCompare(left.createdAt);
    if (input.sort === 'helpful') return right.helpfulCount - left.helpfulCount || right.createdAt.localeCompare(left.createdAt);
    return right.createdAt.localeCompare(left.createdAt);
  });
  return {
    reviews: records.slice(pagination.offset, pagination.offset + pagination.pageSize).map(publicReview),
    total: records.length,
    ...pagination
  };
}

function emptyStatistics() {
  return { averageRating: 0, totalReviews: 0, ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, withPhotos: 0, verifiedPurchases: 0 };
}

function statisticsFromRows(rows) {
  const stats = emptyStatistics();
  for (const row of rows) {
    const rating = Number(row.rating);
    const count = Number(row.count || 0);
    stats.ratingCounts[rating] = count;
    stats.totalReviews += count;
    stats.averageRating += rating * count;
  }
  stats.averageRating = stats.totalReviews ? Number((stats.averageRating / stats.totalReviews).toFixed(2)) : 0;
  return stats;
}

async function reviewStatistics({ productSlug = '', reviewType = 'product' } = {}) {
  if (usePostgresReviews()) {
    const values = [reviewType];
    const product = reviewType === 'product' ? ' AND product_slug=$2' : '';
    if (product) values.push(productSlug);
    const [ratings, extras] = await Promise.all([
      query(`SELECT rating,count(*)::integer AS count FROM reviews WHERE ${PUBLIC_REVIEW_SQL_FILTER} AND review_type=$1${product} GROUP BY rating`, values),
      query(
        `SELECT
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM review_images i WHERE i.review_id=reviews.id))::integer AS with_photos,
           count(*) FILTER (WHERE verified_purchase)::integer AS verified
         FROM reviews WHERE ${PUBLIC_REVIEW_SQL_FILTER} AND review_type=$1${product}`,
        values
      )
    ]);
    const stats = statisticsFromRows(ratings.rows);
    stats.withPhotos = Number(extras.rows[0]?.with_photos || 0);
    stats.verifiedPurchases = Number(extras.rows[0]?.verified || 0);
    return stats;
  }
  const store = await readStore();
  const records = attachJsonImages(store.reviews.filter((review) => (
    isEligiblePublishedReview(review) && review.reviewType === reviewType &&
    (reviewType === 'store' || review.productSlug === productSlug)
  )), store);
  const rows = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: records.filter((review) => review.rating === rating).length }));
  const stats = statisticsFromRows(rows);
  stats.withPhotos = records.filter((review) => review.images.length).length;
  stats.verifiedPurchases = records.filter((review) => review.verifiedPurchase).length;
  return stats;
}

async function reviewSummariesByProduct() {
  if (usePostgresReviews()) {
    const result = await query(
      `SELECT
         product_slug,
         count(*)::integer AS total,
         round(avg(rating)::numeric,2)::float AS average,
         count(*) FILTER (WHERE rating=1)::integer AS rating_1,
         count(*) FILTER (WHERE rating=2)::integer AS rating_2,
         count(*) FILTER (WHERE rating=3)::integer AS rating_3,
         count(*) FILTER (WHERE rating=4)::integer AS rating_4,
         count(*) FILTER (WHERE rating=5)::integer AS rating_5
       FROM reviews WHERE review_type='product' AND ${PUBLIC_REVIEW_SQL_FILTER}
       GROUP BY product_slug`
    );
    return Object.fromEntries(result.rows.map((row) => [row.product_slug, {
      averageRating: Number(row.average || 0),
      ratingCount: Number(row.total || 0),
      totalReviews: Number(row.total || 0),
      ratingDistribution: {
        1: Number(row.rating_1 || 0),
        2: Number(row.rating_2 || 0),
        3: Number(row.rating_3 || 0),
        4: Number(row.rating_4 || 0),
        5: Number(row.rating_5 || 0)
      },
      hasRatings: Number(row.total || 0) > 0
    }]));
  }
  const store = await readStore();
  const grouped = new Map();
  for (const review of store.reviews.filter((item) => item.reviewType === 'product' && isEligiblePublishedReview(item))) {
    grouped.set(review.productSlug, [...(grouped.get(review.productSlug) || []), review]);
  }
  return Object.fromEntries([...grouped].map(([slug, records]) => [slug, ratingSummaryFromReviews(records)]));
}

async function adminRatingSummaryForProduct(productSlug) {
  const slug = String(productSlug || '').trim();
  const lastRecalculatedAt = new Date().toISOString();
  if (usePostgresReviews()) {
    const result = await query(
      `SELECT
         count(*) FILTER (WHERE ${PUBLIC_REVIEW_SQL_FILTER})::integer AS published_count,
         round((avg(rating) FILTER (WHERE ${PUBLIC_REVIEW_SQL_FILTER}))::numeric,2)::float AS average,
         count(*) FILTER (WHERE status='pending' AND deleted_at IS NULL)::integer AS pending_count,
         count(*) FILTER (WHERE status='hidden' AND deleted_at IS NULL)::integer AS hidden_count,
         count(*) FILTER (WHERE ${PUBLIC_REVIEW_SQL_FILTER} AND rating=1)::integer AS rating_1,
         count(*) FILTER (WHERE ${PUBLIC_REVIEW_SQL_FILTER} AND rating=2)::integer AS rating_2,
         count(*) FILTER (WHERE ${PUBLIC_REVIEW_SQL_FILTER} AND rating=3)::integer AS rating_3,
         count(*) FILTER (WHERE ${PUBLIC_REVIEW_SQL_FILTER} AND rating=4)::integer AS rating_4,
         count(*) FILTER (WHERE ${PUBLIC_REVIEW_SQL_FILTER} AND rating=5)::integer AS rating_5
       FROM reviews
       WHERE review_type='product' AND product_slug=$1
         AND ${PUBLIC_REVIEW_SQL_FILTER.replace("status='published' AND ", '').replace('deleted_at IS NULL AND ', '')}`,
      [slug]
    );
    const row = result.rows[0] || {};
    const ratingCount = Number(row.published_count || 0);
    return {
      averageRating: Number(row.average || 0),
      ratingCount,
      publishedRatedReviews: ratingCount,
      pendingReviews: Number(row.pending_count || 0),
      hiddenReviews: Number(row.hidden_count || 0),
      ratingDistribution: {
        1: Number(row.rating_1 || 0),
        2: Number(row.rating_2 || 0),
        3: Number(row.rating_3 || 0),
        4: Number(row.rating_4 || 0),
        5: Number(row.rating_5 || 0)
      },
      hasRatings: ratingCount > 0,
      lastRecalculatedAt
    };
  }
  const store = await readStore();
  const records = store.reviews.filter((review) => (
    review.reviewType === 'product' &&
    review.productSlug === slug &&
    !review.deletedAt &&
    !isDemoOrTestReview(review)
  ));
  const summary = ratingSummaryFromReviews(records);
  return {
    ...summary,
    publishedRatedReviews: summary.ratingCount,
    pendingReviews: records.filter((review) => review.status === 'pending').length,
    hiddenReviews: records.filter((review) => review.status === 'hidden').length,
    lastRecalculatedAt
  };
}

async function listAdminReviews(input = {}) {
  const pagination = normalizedPagination({ ...input, pageSize: input.pageSize || 25 });
  if (usePostgresReviews()) {
    const values = [];
    const where = [];
    if (!input.includeDeleted) where.push('deleted_at IS NULL');
    if (input.status) { values.push(input.status); where.push(`status=$${values.length}`); }
    if (input.productSlug) { values.push(input.productSlug); where.push(`product_slug=$${values.length}`); }
    if (input.source) { values.push(input.source); where.push(`source=$${values.length}`); }
    if (input.rating && Number.isInteger(Number(input.rating))) { values.push(Number(input.rating)); where.push(`rating=$${values.length}`); }
    if (input.verified) where.push('verified_purchase=true');
    if (input.withPhotos) where.push('EXISTS (SELECT 1 FROM review_images i WHERE i.review_id=reviews.id)');
    if (input.dateFrom) { values.push(input.dateFrom); where.push(`created_at >= $${values.length}`); }
    if (input.dateTo) { values.push(input.dateTo); where.push(`created_at < ($${values.length}::date + interval '1 day')`); }
    if (input.search) {
      values.push(`%${String(input.search).trim()}%`);
      where.push(`(reviewer_name ILIKE $${values.length} OR title ILIKE $${values.length} OR body ILIKE $${values.length} OR id ILIKE $${values.length})`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await query(`SELECT count(*)::integer AS total FROM reviews ${clause}`, values);
    values.push(pagination.pageSize, pagination.offset);
    const result = await query(`SELECT * FROM reviews ${clause} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return {
      reviews: await attachPostgresImages(result.rows.map(fromRow)),
      total: Number(count.rows[0]?.total || 0),
      ...pagination
    };
  }
  const store = await readStore();
  let records = attachJsonImages(store.reviews, store);
  if (!input.includeDeleted) records = records.filter((review) => !review.deletedAt);
  if (input.status) records = records.filter((review) => review.status === input.status);
  if (input.productSlug) records = records.filter((review) => review.productSlug === input.productSlug);
  if (input.source) records = records.filter((review) => review.source === input.source);
  if (input.rating) records = records.filter((review) => review.rating === Number(input.rating));
  if (input.verified) records = records.filter((review) => review.verifiedPurchase);
  if (input.withPhotos) records = records.filter((review) => review.images.length);
  if (input.dateFrom) records = records.filter((review) => review.createdAt >= input.dateFrom);
  if (input.dateTo) records = records.filter((review) => review.createdAt.slice(0, 10) <= input.dateTo);
  if (input.search) {
    const needle = String(input.search).toLowerCase();
    records = records.filter((review) => [review.id, review.reviewerName, review.title, review.body].some((value) => String(value).toLowerCase().includes(needle)));
  }
  records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return { reviews: records.slice(pagination.offset, pagination.offset + pagination.pageSize), total: records.length, ...pagination };
}

async function reviewStatusCounts() {
  if (usePostgresReviews()) {
    const result = await query('SELECT status,count(*)::integer AS count FROM reviews WHERE deleted_at IS NULL GROUP BY status');
    const counts = Object.fromEntries(REVIEW_STATUSES.map((status) => [status, 0]));
    for (const row of result.rows) counts[row.status] = Number(row.count);
    return counts;
  }
  const store = await readStore();
  return Object.fromEntries(REVIEW_STATUSES.map((status) => [status, store.reviews.filter((review) => review.status === status && !review.deletedAt).length]));
}

async function listReviewAudit(reviewId) {
  if (usePostgresReviews()) {
    const result = await query('SELECT * FROM review_audit_events WHERE review_id=$1 ORDER BY created_at DESC', [reviewId]);
    return result.rows.map((row) => ({
      id: row.id, reviewId: row.review_id || '', actor: row.actor, action: row.action, reason: row.reason,
      previousValues: row.previous_values || {}, nextValues: row.next_values || {}, createdAt: new Date(row.created_at).toISOString()
    }));
  }
  const store = await readStore();
  return store.auditEvents.filter((event) => event.reviewId === reviewId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function permanentDeleteReview(id, { actor = 'admin', reason = '' } = {}) {
  if (usePostgresReviews()) {
    return transaction(async (client) => {
      const current = await findReviewById(id, { client });
      if (!current) return false;
      await insertAuditPostgres(client, current.id, actor, 'permanently_deleted', reason, safeAuditSnapshot(current), {});
      await client.query('DELETE FROM reviews WHERE id=$1', [id]);
      return true;
    });
  }
  const store = await readStore();
  const current = store.reviews.find((review) => review.id === id);
  if (!current) return false;
  store.auditEvents.push(auditRecord(current.id, actor, 'permanently_deleted', reason, safeAuditSnapshot(current), {}));
  store.reviews = store.reviews.filter((review) => review.id !== id);
  store.images = store.images.filter((image) => image.reviewId !== id);
  await writeStore(store);
  return true;
}

async function createImportBatch(input) {
  const batch = {
    id: String(input.id || crypto.randomUUID()),
    filename: sanitizePlainText(input.filename, 255, { required: true, field: 'Filename' }),
    totalRows: Math.max(0, Math.trunc(Number(input.totalRows || 0))),
    successfulRows: Math.max(0, Math.trunc(Number(input.successfulRows || 0))),
    failedRows: Math.max(0, Math.trunc(Number(input.failedRows || 0))),
    importedBy: sanitizePlainText(input.importedBy || 'admin', 120),
    errorReport: Array.isArray(input.errorReport) ? input.errorReport : [],
    createdAt: normalizeDate(input.createdAt)
  };
  if (usePostgresReviews()) {
    await query(
      `INSERT INTO review_import_batches (id,filename,total_rows,successful_rows,failed_rows,imported_by,error_report,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [batch.id, batch.filename, batch.totalRows, batch.successfulRows, batch.failedRows, batch.importedBy, JSON.stringify(batch.errorReport), batch.createdAt]
    );
    return batch;
  }
  const store = await readStore();
  store.importBatches.push(batch);
  await writeStore(store);
  return batch;
}

async function existingDuplicateKeys(keys = []) {
  const selected = [...new Set(keys.filter(Boolean))];
  if (!selected.length) return new Set();
  if (usePostgresReviews()) {
    const result = await query(
      'SELECT duplicate_key FROM reviews WHERE deleted_at IS NULL AND duplicate_key=ANY($1::text[])',
      [selected]
    );
    return new Set(result.rows.map((row) => row.duplicate_key));
  }
  const store = await readStore();
  return new Set(store.reviews.filter((review) => !review.deletedAt && selected.includes(review.duplicateKey)).map((review) => review.duplicateKey));
}

async function updateImportBatch(id, changes = {}) {
  if (usePostgresReviews()) {
    const result = await query(
      `UPDATE review_import_batches SET successful_rows=$2,failed_rows=$3,error_report=$4::jsonb
       WHERE id=$1 RETURNING *`,
      [id, Math.max(0, Number(changes.successfulRows || 0)), Math.max(0, Number(changes.failedRows || 0)), JSON.stringify(changes.errorReport || [])]
    );
    return result.rows[0] || null;
  }
  const store = await readStore();
  const index = store.importBatches.findIndex((batch) => batch.id === id);
  if (index < 0) return null;
  store.importBatches[index] = { ...store.importBatches[index], ...changes };
  await writeStore(store);
  return store.importBatches[index];
}

async function listImportBatches() {
  if (usePostgresReviews()) {
    const result = await query('SELECT * FROM review_import_batches ORDER BY created_at DESC LIMIT 100');
    return result.rows.map((row) => ({
      id: row.id, filename: row.filename, totalRows: Number(row.total_rows), successfulRows: Number(row.successful_rows),
      failedRows: Number(row.failed_rows), importedBy: row.imported_by, errorReport: row.error_report || [], createdAt: new Date(row.created_at).toISOString()
    }));
  }
  const store = await readStore();
  return store.importBatches.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function resetReviewRepositoryForTests() {
  if (usePostgresReviews()) {
    await query('DELETE FROM review_audit_events');
    await query('DELETE FROM review_images');
    await query('DELETE FROM reviews');
    await query('DELETE FROM review_import_batches');
    return;
  }
  await writeStore(structuredClone(EMPTY_STORE));
}

module.exports = {
  REVIEW_SOURCES,
  REVIEW_STATUSES,
  REVIEW_TYPES,
  adminRatingSummaryForProduct,
  createImportBatch,
  existingDuplicateKeys,
  findReviewById,
  insertReview,
  listAdminReviews,
  listImportBatches,
  listPublishedReviews,
  listReviewAudit,
  normalizeEmail,
  normalizeReview,
  permanentDeleteReview,
  publicReview,
  resetReviewRepositoryForTests,
  reviewStatistics,
  reviewStatusCounts,
  reviewSummariesByProduct,
  reviewDuplicateKey,
  sanitizePlainText,
  updateImportBatch,
  updateReview
};
