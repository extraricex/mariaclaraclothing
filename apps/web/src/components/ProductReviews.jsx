import { useEffect, useMemo, useState } from 'react';
import { fetchProductReviews, fetchStoreReviews, submitProductReview } from '../lib/api.js';
import Stars from './Stars.jsx';

const EMPTY_STATS = {
  averageRating: 0,
  totalReviews: 0,
  ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  withPhotos: 0,
  verifiedPurchases: 0
};

function ReviewSummary({ statistics, onWrite, canSubmit }) {
  return (
    <div className="grid gap-7 border border-line bg-white p-5 sm:p-7 lg:grid-cols-[minmax(220px,0.65fr)_minmax(300px,1fr)]">
      <div className="flex flex-col items-start justify-center border-b border-line pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
        <p className="display text-5xl leading-none">{statistics.totalReviews ? statistics.averageRating.toFixed(1) : '—'}</p>
        <div className="mt-3 text-lg"><Stars rating={statistics.averageRating} /></div>
        <p className="mt-2 text-sm text-ink-soft">
          {statistics.totalReviews} {statistics.totalReviews === 1 ? 'review' : 'reviews'}
        </p>
        {canSubmit && (
          <button type="button" className="btn-ink customer-compact-button mt-5" onClick={onWrite}>Write a Review</button>
        )}
      </div>
      <div className="space-y-3">
        {[5, 4, 3, 2, 1].map((rating) => {
          const count = Number(statistics.ratingCounts?.[rating] || 0);
          const percentage = statistics.totalReviews ? Math.round((count / statistics.totalReviews) * 100) : 0;
          return (
            <div key={rating} className="grid grid-cols-[58px_minmax(0,1fr)_42px] items-center gap-3 text-xs">
              <span className="whitespace-nowrap">{rating} ★</span>
              <span
                className="h-2 overflow-hidden rounded-full bg-cream"
                role="progressbar"
                aria-label={`${rating} stars: ${count} reviews`}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={percentage}
              >
                <span className="block h-full rounded-full bg-accent" style={{ width: `${percentage}%` }} />
              </span>
              <span className="text-right text-clay">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewCard({ review, onPhoto }) {
  return (
    <article className="min-w-0 border-b border-line py-7 first:pt-0 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="break-words text-sm">{review.reviewerName}</strong>
            {review.verifiedPurchase && (
              <span className="rounded-full bg-[#e9f5ec] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#27663a]">Verified Purchase</span>
            )}
            {review.concernResolved && (
              <span className="rounded-full bg-cream px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-soft">Resolved</span>
            )}
          </div>
          <div className="mt-2 text-sm"><Stars rating={review.rating} /></div>
        </div>
        <time className="shrink-0 text-xs text-clay" dateTime={review.createdAt}>
          {new Date(review.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
        </time>
      </div>
      {review.title && <h3 className="mt-4 break-words text-base font-semibold">{review.title}</h3>}
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-ink-soft">{review.body}</p>
      {(review.variant || review.size) && (
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-clay">
          {[review.variant, review.size].filter(Boolean).join(' · ')}
        </p>
      )}
      {review.images?.length > 0 && (
        <div className="mt-4 flex max-w-full flex-wrap gap-2">
          {review.images.map((photo, index) => (
            <button
              key={photo.id || photo.imageUrl}
              type="button"
              className="h-20 w-20 overflow-hidden rounded border border-line bg-cream sm:h-24 sm:w-24"
              aria-label={`Open customer photo ${index + 1}`}
              onClick={() => onPhoto(photo.imageUrl)}
            >
              <img src={photo.imageUrl} alt="Customer review attachment" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {review.adminReply && (
        <div className="mt-5 border-l-2 border-accent bg-cream/70 px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em]">Response from Maria Clara Clothing</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink-soft">{review.adminReply}</p>
          {review.adminReplyDate && (
            <time className="mt-2 block text-[11px] text-clay" dateTime={review.adminReplyDate}>
              {new Date(review.adminReplyDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
            </time>
          )}
        </div>
      )}
      {Number(review.helpfulCount || 0) > 0 && <p className="mt-4 text-xs text-clay">Helpful to {review.helpfulCount}</p>}
    </article>
  );
}

function WriteReviewModal({ product, allowPhotos, onClose, onSubmitted }) {
  const [form, setForm] = useState({ reviewerName: '', reviewerEmail: '', rating: 0, title: '', body: '', variant: '', orderNumber: '', consent: false, website: '' });
  const [photos, setPhotos] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function choosePhotos(files) {
    const selected = [...files];
    if (selected.length > 3 || selected.some((file) => file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setError('Choose up to 3 JPG, PNG, or WebP photos, no larger than 5 MB each.');
      return;
    }
    setPhotos(selected);
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!form.rating || !form.reviewerName.trim() || !form.reviewerEmail.trim() || !form.body.trim() || !form.consent) {
      setError('Name, email, rating, review message, and consent are required.');
      return;
    }
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => data.append(key, String(value)));
    photos.forEach((photo) => data.append('photos', photo));
    setPending(true);
    try {
      const result = await submitProductReview(product.publicHandle || product.slug, data);
      onSubmitted(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="max-h-[92svh] w-full max-w-2xl overflow-y-auto bg-paper p-5 shadow-2xl sm:rounded sm:p-7" role="dialog" aria-modal="true" aria-labelledby="write-review-title" onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Share your experience</p>
            <h2 id="write-review-title" className="display mt-1 text-3xl">Write a Review</h2>
          </div>
          <button type="button" className="min-h-11 min-w-11 text-2xl" aria-label="Close review form" onClick={onClose}>×</button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-[0.1em]">Customer name *<input className="field mt-1" maxLength="100" value={form.reviewerName} onChange={(e) => set('reviewerName', e.target.value)} /></label>
          <label className="text-xs font-semibold uppercase tracking-[0.1em]">Email *<input className="field mt-1" type="email" maxLength="254" value={form.reviewerEmail} onChange={(e) => set('reviewerEmail', e.target.value)} /></label>
        </div>
        <fieldset className="mt-5">
          <legend className="text-xs font-semibold uppercase tracking-[0.1em]">Rating *</legend>
          <Stars rating={form.rating} interactive onChange={(rating) => set('rating', rating)} />
        </fieldset>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.1em]">Review title<input className="field mt-1" maxLength="150" value={form.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.1em]">Review message *<textarea className="field mt-1 min-h-32" maxLength="5000" value={form.body} onChange={(e) => set('body', e.target.value)} /></label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-[0.1em]">Variant or size
            <select className="field mt-1" value={form.variant} onChange={(e) => set('variant', e.target.value)}>
              <option value="">Optional</option>
              {(product.variants || []).map((variant) => <option key={variant.id} value={variant.size}>{variant.size}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.1em]">Order number<input className="field mt-1" maxLength="120" placeholder="Optional, for verification" value={form.orderNumber} onChange={(e) => set('orderNumber', e.target.value)} /></label>
        </div>
        {allowPhotos && (
          <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.1em]">Customer photos
            <input className="field mt-1" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => choosePhotos(e.target.files)} />
            <span className="mt-1 block normal-case tracking-normal text-clay">Up to 3 photos · JPG, PNG, or WebP · 5 MB each.</span>
          </label>
        )}
        <label className="mt-5 flex items-start gap-3 text-sm leading-6">
          <input type="checkbox" className="mt-1" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} />
          I consent to Maria Clara Clothing publishing my display name and review. My email and order number remain private.
        </label>
        <label className="absolute -left-[9999px]" aria-hidden="true">Website<input tabIndex="-1" autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} /></label>
        {error && <p className="mt-4 text-sm text-accent-deep" role="alert">{error}</p>}
        <button type="submit" className="btn-ink mt-6 w-full" disabled={pending}>{pending ? 'Submitting…' : 'Submit Review'}</button>
      </form>
    </div>
  );
}

export default function ProductReviews({ product }) {
  const [tab, setTab] = useState('product');
  const [filters, setFilters] = useState({ rating: '', withPhotos: false, verified: false, sort: 'recent', page: 1 });
  const [data, setData] = useState(null);
  const [storeReviewCount, setStoreReviewCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [lightbox, setLightbox] = useState('');
  const [message, setMessage] = useState('');

  const query = useMemo(() => ({ ...filters, pageSize: 10 }), [filters]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const request = tab === 'store'
      ? fetchStoreReviews(query)
      : fetchProductReviews(product.publicHandle || product.slug, query);
    request.then((body) => {
      if (!active) return;
      setData(body);
      if (body.storeReviewCount !== undefined) setStoreReviewCount(Number(body.storeReviewCount || 0));
    }).catch(() => { if (active) setData({ enabled: false, reviews: [], statistics: EMPTY_STATS }); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [product.slug, product.publicHandle, tab, query]);

  function changeFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value, page: 1 }));
  }

  if (!data?.enabled && !loading) return null;
  if (!data) return null;
  const statistics = data.statistics || EMPTY_STATS;
  const showRatingSummary = product.reviewSettings?.showRatingSummary !== false;
  const totalPages = Math.max(1, Math.ceil(Number(data.pagination?.total || 0) / Number(data.pagination?.pageSize || 10)));

  return (
    <section id="customer-reviews" className="mt-20 scroll-mt-28 border-t border-line pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">From our customers</p>
          <h2 className="display mt-2 text-3xl sm:text-5xl">Customer Reviews</h2>
        </div>
        {!showRatingSummary && tab === 'product' && data.canSubmit && (
          <button type="button" className="btn-ink customer-compact-button" onClick={() => setWriteOpen(true)}>Write a Review</button>
        )}
      </div>
      {message && <p className="mt-4 border border-[#b9d9c1] bg-[#eef8f0] px-4 py-3 text-sm text-[#27663a]" role="status">{message}</p>}
      {storeReviewCount > 0 && (
        <div className="mt-6 flex gap-2 border-b border-line">
          <button type="button" className={`px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] ${tab === 'product' ? 'border-b-2 border-ink' : 'text-clay'}`} onClick={() => { setTab('product'); changeFilter('page', 1); }}>Product Reviews</button>
          <button type="button" className={`px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] ${tab === 'store' ? 'border-b-2 border-ink' : 'text-clay'}`} onClick={() => { setTab('store'); changeFilter('page', 1); }}>Store Reviews</button>
        </div>
      )}
      {showRatingSummary && (
        <div className="mt-7"><ReviewSummary statistics={statistics} canSubmit={tab === 'product' && data.canSubmit} onWrite={() => setWriteOpen(true)} /></div>
      )}
      <div className="mt-6 flex flex-col gap-3 border-y border-line py-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="text-xs font-semibold uppercase tracking-[0.1em]">Rating
          <select className="field mt-1 min-w-40" value={filters.rating} onChange={(e) => changeFilter('rating', e.target.value)}>
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.1em]">Sort reviews by
          <select className="field mt-1 min-w-44" value={filters.sort} onChange={(e) => changeFilter('sort', e.target.value)}>
            <option value="recent">Most Recent</option>
            <option value="highest">Highest Rated</option>
            <option value="lowest">Lowest Rated</option>
            <option value="helpful">Most Helpful</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={filters.withPhotos} onChange={(e) => changeFilter('withPhotos', e.target.checked)} /> With photos</label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={filters.verified} onChange={(e) => changeFilter('verified', e.target.checked)} /> Verified purchases</label>
      </div>
      <div className="mt-7 min-h-20">
        {loading ? <p className="text-sm text-clay">Loading reviews…</p> : data.reviews?.length ? data.reviews.map((review) => <ReviewCard key={review.id} review={review} onPhoto={setLightbox} />) : (
          <p className="py-10 text-center text-sm text-clay">No published reviews match these filters.</p>
        )}
      </div>
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button type="button" className="btn-ghost customer-compact-button" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
          <span className="text-xs text-clay">Page {filters.page} of {totalPages}</span>
          <button type="button" className="btn-ghost customer-compact-button" disabled={filters.page >= totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
        </div>
      )}
      {writeOpen && <WriteReviewModal product={product} allowPhotos={data.allowPhotos} onClose={() => setWriteOpen(false)} onSubmitted={(success) => { setWriteOpen(false); setMessage(success); }} />}
      {lightbox && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-ink/85 p-4" role="dialog" aria-modal="true" aria-label="Customer review photo">
          <button type="button" className="absolute right-4 top-4 min-h-11 min-w-11 text-3xl text-white" aria-label="Close photo" onClick={() => setLightbox('')}>×</button>
          <img src={lightbox} alt="Customer review attachment enlarged" className="max-h-[88svh] max-w-full object-contain" />
        </div>
      )}
    </section>
  );
}
