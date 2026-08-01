import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { fetchProduct, fetchProducts } from '../lib/api.js';
import { addToCart, getCart, openCartDrawer } from '../lib/cart.js';
import { formatMoney } from '../lib/money.js';
import { trackFacebookAddToCart, trackFacebookViewContent } from '../lib/metaPixel.js';
import { sanitizeRichHtml } from '../lib/richText.js';
import { useStorefrontSettings } from '../lib/storeSettings.js';
import { selectProductCountdown } from '../lib/collectionCountdown.js';
import ProductCard from '../components/ProductCard.jsx';
import { rememberRecentlyViewed } from '../lib/recentlyViewed.js';
import CollectionCountdown from '../components/CollectionCountdown.jsx';
import NotFound from './NotFound.jsx';
import { productPath } from '../lib/productUrl.js';
import useModalFocus from '../hooks/useModalFocus.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { responsiveImageAttributes } from '../lib/responsiveImage.js';
import SEO from '../components/SEO.jsx';
import { productSeoDescriptor } from '../lib/seo.js';
import { normalizeCollectionDefinitions } from '../lib/storefrontCollections.js';
import { trackFunnelEvent } from '../lib/funnelAnalytics.js';

function ProductDetailContent({ detail, productName }) {
  if (detail.type === 'html') {
    return (
      <div
        className="prose-sm max-w-none [&_a]:text-accent [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_p]:mt-3"
        dangerouslySetInnerHTML={{ __html: detail.html }}
      />
    );
  }
  if (detail.type === 'section') {
    return (
      <div>
        {detail.section.body && <p>{detail.section.body}</p>}
        {Array.isArray(detail.section.items) && (
          <ul className="space-y-1">
            {detail.section.items.map((item, index) => (
              <li key={index} className="flex gap-2"><span className="text-accent">—</span>{item}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (detail.type === 'image') {
    return <img src={detail.imageUrl} alt={detail.imageAltText || productName + ' size chart'} className="w-full" loading="lazy" />;
  }
  if (detail.type === 'size-chart') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-clay">
              <th className="py-2 pr-4">Size</th>
              <th className="py-2 pr-4">Width</th>
              <th className="py-2 pr-4">Length</th>
              <th className="py-2 pr-4">Sleeve length</th>
              <th className="py-2">Shoulder drop</th>
            </tr>
          </thead>
          <tbody>
            {detail.rows.map((row, index) => (
              <tr key={(row.size || 'size') + '-' + index} className="border-b border-line/60">
                <td className="py-2 pr-4 font-semibold text-ink">{row.size}</td>
                <td className="py-2 pr-4">{row.width}</td>
                <td className="py-2 pr-4">{row.length}</td>
                <td className="py-2 pr-4">{row.sleeveLength}</td>
                <td className="py-2">{row.shoulderDropLength}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <p className="whitespace-pre-line">{detail.body}</p>;
}

export default function Product() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedSize = String(searchParams.get('size') || '').trim().toLowerCase();
  const settings = useStorefrontSettings();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [stockMessage, setStockMessage] = useState('');
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [loadedImageUrl, setLoadedImageUrl] = useState('');
  const [failedImageUrl, setFailedImageUrl] = useState('');
  const imageTouchStartX = useRef(null);
  const thumbnailRefs = useRef([]);
  const sizeChartDialogRef = useRef(null);
  const sizeChartCloseButtonRef = useRef(null);
  const closeSizeChart = useCallback(() => setSizeChartOpen(false), []);

  useModalFocus({
    open: sizeChartOpen,
    containerRef: sizeChartDialogRef,
    initialFocusRef: sizeChartCloseButtonRef,
    onClose: closeSizeChart
  });

  useEffect(() => {
    setProduct(null);
    setError('');
    setActiveImage(0);
    setQuantity(1);
    setVariantId('');
    setAdded(false);
    setStockMessage('');
    fetchProduct(slug)
      .then((body) => {
        setProduct(body.product);
        if (body.product.publicHandle && body.product.publicHandle !== slug) {
          navigate(productPath(body.product), { replace: true });
        }
        const requestedVariant = requestedSize
          ? body.product.variants.find((variant) => String(variant.size || '').trim().toLowerCase() === requestedSize)
          : null;
        const firstInStock = body.product.variants.find((variant) => Number(variant.stockQuantity) > 0);
        setVariantId(requestedVariant?.id || firstInStock?.id || body.product.variants[0]?.id || '');
      })
      .catch((err) => setError(err.message));
    fetchProducts()
      .then((body) => setRecommendations(body.products || []))
      .catch(() => setRecommendations([]));
  }, [slug, navigate, requestedSize]);

  useEffect(() => {
    if (!product) return;
    rememberRecentlyViewed(product);
    const selectedVariant = product.variants?.find((candidate) => candidate.id === variantId);
    if (!selectedVariant) return;
    trackFacebookViewContent({
      ...product,
      variantId: selectedVariant.id || '',
      externalPosVariantId: selectedVariant.externalPosVariantId || '',
      size: selectedVariant.size || '',
      priceCents: selectedVariant.priceCents ?? product.priceCents
    }, { path: productPath(product) });
  }, [product, variantId]);

  const descriptionHtml = useMemo(
    () => sanitizeRichHtml(product?.productPage?.intro || product?.description || ''),
    [product]
  );
  const productImages = useMemo(() => {
    const seen = new Set();
    return (product?.images || []).filter((candidate) => {
      const url = String(candidate?.url || '').trim();
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }, [product?.images]);
  const parentCollection = useMemo(() => {
    if (!product) return null;
    const assigned = (product.collections || []).map((name) => String(name || '').trim().toLowerCase());
    const definitions = normalizeCollectionDefinitions(settings.collectionDefinitions || []);
    for (const assignedName of assigned) {
      const match = definitions.find((collection) => collection.visible && [collection.name, ...(collection.aliases || [])]
        .some((name) => String(name || '').trim().toLowerCase() === assignedName));
      if (match) return match;
    }
    return null;
  }, [product, settings.collectionDefinitions]);

  useEffect(() => {
    if (activeImage < productImages.length) return;
    setActiveImage(0);
  }, [activeImage, productImages.length]);

  useEffect(() => {
    thumbnailRefs.current[activeImage]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    });
  }, [activeImage, productImages.length]);

  if (error) {
    return <NotFound eyebrow="Product" title="Product not found" message="This product is unavailable or its link has changed. Browse the current collection to find another piece." />;
  }

  if (!product) {
    return <div className="mx-auto max-w-7xl px-5 py-24 text-sm text-clay">Loading…</div>;
  }

  const soldOut = String(product.merchandisingStatus || '').toLowerCase() === 'sold_out' ||
    !(product.variants || []).some((candidate) => Number(candidate.stockQuantity || 0) > 0);
  const onSale = Number(product.compareAtPriceCents) > Number(product.priceCents);
  const savingsCents = onSale ? Number(product.compareAtPriceCents) - Number(product.priceCents) : 0;
  const freeShippingEnabled = Boolean(settings.shipping?.freeShippingEnabled);
  const freeShippingMinimumItems = Math.max(1, Number(settings.shipping?.freeShippingMinimumItems || 2));
  const freeShippingProductCopy = freeShippingEnabled
    ? `Nationwide delivery. Order ${freeShippingMinimumItems} or more item${freeShippingMinimumItems === 1 ? '' : 's'} and shipping is free; otherwise the fee is calculated from your delivery region.`
    : 'Nationwide delivery. Your shipping fee is calculated from your delivery region at checkout.';
  const shippingEstimateCopy = (settings.shipping?.regions || [])
    .map((region) => String(region.deliveryEstimate || '').trim())
    .filter(Boolean)
    .join('\n');
  const countdown = selectProductCountdown(product, settings);
  const variant = product.variants.find((candidate) => candidate.id === variantId) || null;
  const variantStock = Math.max(0, Math.trunc(Number(variant?.stockQuantity || 0)));
  const variantSoldOut = soldOut || !variant || variantStock <= 0;
  const image = productImages[activeImage] || productImages[0];
  const mainImageLoaded = Boolean(image?.url && loadedImageUrl === image.url);
  const mainImageFailed = Boolean(image?.url && failedImageUrl === image.url);
  const cashOnDeliveryAvailable = settings.paymentMethods?.some((method) => method.id === 'cash_on_delivery');
  const productPage = product.productPage || {};
  const metafieldText = (key) => {
    const value = product.metafields?.[key];
    return Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value || '').trim();
  };
  const productFacts = [
    ['Material', metafieldText('material')],
    ['Fabric weight', metafieldText('fabricWeight')],
    ['Fit', metafieldText('fit')],
    ['Color', metafieldText('color')],
    ['Model', [metafieldText('modelHeight'), metafieldText('modelWearsSize') && `wears ${metafieldText('modelWearsSize')}`].filter(Boolean).join(' · ')]
  ].filter(([, value]) => value);
  const page = productPage;
  const sizeChartImageUrl = page.sizeChartImageUrl || settings.sizeChart?.imageUrl || '';
  const sizeChartAltText = settings.sizeChart?.altText || `${product.name} size chart`;
  const sizeChartRows = Array.isArray(productPage.sizeChart)
    ? productPage.sizeChart.filter((row) => row && Object.values(row).some((value) => String(value || '').trim() !== ''))
    : [];
  const visibleSections = (page.sections || [])
    .filter((section) => {
      const sectionTitle = String(section.title || '').trim().toLowerCase();
      if (productPage.detailsText && sectionTitle === 'product details') return false;
      if (sectionTitle === 'shipping') return false;
      if (sizeChartRows.length && sectionTitle === 'size chart') return false;
      if (productPage.shippingText && sectionTitle !== 'shipping') return true;
      if (sizeChartRows.length && sectionTitle !== 'size chart') return true;
      return true;
    });
  const detailTabs = [
    descriptionHtml && { title: 'Description', type: 'html', html: descriptionHtml },
    productPage.detailsText && { title: 'Product details', type: 'text', body: productPage.detailsText },
    ...visibleSections.map((section) => ({ title: displaySectionTitle(section.title), type: 'section', section })),
    {
      title: 'Size Chart',
      type: sizeChartRows.length ? 'size-chart' : sizeChartImageUrl ? 'image' : 'text',
      rows: sizeChartRows,
      imageUrl: sizeChartImageUrl,
      imageAltText: sizeChartAltText,
      body: 'Check the product measurements before ordering. Size exchanges are subject to stock availability.'
    },
    {
      title: 'Shipping',
      type: 'text',
      body: [shippingEstimateCopy, freeShippingProductCopy].filter(Boolean).join('\n\n')
    }
  ].filter(Boolean);
  const primaryDetailSections = detailTabs.filter((detail) => !['Size Chart', 'Shipping'].includes(detail.title));
  const productCollections = new Set((product.collections || []).map((name) => String(name).trim().toLowerCase()));
  const normalizedCandidateFact = (candidate, key) => {
    const value = candidate.metafields?.[key];
    return String(Array.isArray(value) ? value[0] || '' : value || '').trim().toLowerCase();
  };
  const currentFit = normalizedCandidateFact(product, 'fit');
  const currentColor = normalizedCandidateFact(product, 'color');
  const currentProductType = String(product.productType || product.category || '').trim().toLowerCase();
  const recommendedProducts = recommendations
    .filter((candidate) => candidate.id !== product.id)
    .filter((candidate) => String(candidate.merchandisingStatus || '').toLowerCase() !== 'sold_out')
    .filter((candidate) => candidate.variants?.some((candidateVariant) => Number(candidateVariant.stockQuantity) > 0))
    .map((candidate, index) => ({
      candidate,
      index,
      score:
        ((candidate.collections || []).some((name) => productCollections.has(String(name).trim().toLowerCase())) ? 8 : 0) +
        (currentFit && normalizedCandidateFact(candidate, 'fit') === currentFit ? 4 : 0) +
        (currentProductType && String(candidate.productType || candidate.category || '').trim().toLowerCase() === currentProductType ? 2 : 0) +
        (currentColor && normalizedCandidateFact(candidate, 'color') === currentColor ? 1 : 0)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 4);

  function displaySectionTitle(title) {
    return String(title || '').trim().toLowerCase() === 'promise' ? 'Product details' : title;
  }

  function variantStockLabel() {
    if (!variant || variantStock <= 0) return 'Sold Out';
    if (variantStock === 1) return 'Only 1 piece left for this size.';
    return `Only ${variantStock} pieces available.`;
  }

  function selectVariant(nextVariant) {
    const nextStock = Math.max(0, Math.trunc(Number(nextVariant.stockQuantity || 0)));
    setVariantId(nextVariant.id);
    setQuantity((current) => Math.max(1, Math.min(Number(current) || 1, Math.max(1, nextStock))));
    setAdded(false);
    setStockMessage(nextStock <= 0 ? 'Sold Out' : '');
    trackFunnelEvent('size_select', {
      productId: product.id,
      variantId: nextVariant.id,
      quantity: 1,
      valueCents: nextVariant.priceCents ?? product.priceCents,
      checkoutStep: 'product',
      dedupeKey: `${product.id}:${nextVariant.id}`,
      dedupeMilliseconds: 500
    });
  }

  function increaseQuantity() {
    if (variantSoldOut) return;
    setQuantity((current) => {
      const next = Math.min(variantStock, Number(current || 1) + 1);
      if (next >= variantStock) setStockMessage('Maximum available quantity added.');
      return next;
    });
  }

  function showPreviousImage() {
    if (productImages.length < 2) return;
    setActiveImage((index) => (index - 1 + productImages.length) % productImages.length);
  }

  function showNextImage() {
    if (productImages.length < 2) return;
    setActiveImage((index) => (index + 1) % productImages.length);
  }

  function handleImageTouchStart(event) {
    imageTouchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleImageTouchEnd(event) {
    if (imageTouchStartX.current === null || productImages.length < 2) return;
    const endX = event.changedTouches[0]?.clientX ?? imageTouchStartX.current;
    const delta = endX - imageTouchStartX.current;
    imageTouchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) showNextImage();
    else showPreviousImage();
  }

  function handleGalleryKeyDown(event) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showPreviousImage();
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      showNextImage();
    }
  }

  function selectImage(index, moveFocus = false) {
    setActiveImage(index);
    if (moveFocus) requestAnimationFrame(() => thumbnailRefs.current[index]?.focus());
  }

  function handleThumbnailKeyDown(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') selectImage(0, true);
    else if (event.key === 'End') selectImage(productImages.length - 1, true);
    else if (event.key === 'ArrowLeft') selectImage((index - 1 + productImages.length) % productImages.length, true);
    else selectImage((index + 1) % productImages.length, true);
  }

  function handleAdd() {
    if (variantSoldOut) {
      setStockMessage('Sold Out');
      return;
    }
    const cartQuantity = getCart()
      .filter((item) => item.variantId === variant.id)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (cartQuantity >= variantStock) {
      setStockMessage('You already added the maximum available stock for this size.');
      return;
    }
    const cartItem = {
      productId: product.id,
      slug: product.slug,
      publicHandle: product.publicHandle,
      variantId: variant.id,
      productName: product.name,
      size: variant.size,
      quantity: Math.min(variantStock - cartQuantity, Math.max(1, Number(quantity) || 1)),
      maxStock: variantStock,
      unitPriceCents: variant.priceCents ?? product.priceCents,
      imageUrl: productImages[0]?.url || '',
      externalPosProductId: product.externalPosProductId || '',
      externalPosVariantId: variant.externalPosVariantId || ''
    };
    const result = addToCart({ ...cartItem });
    if (result?.limited) {
      setStockMessage('Maximum available quantity added.');
      return;
    }
    openCartDrawer();
    trackFacebookAddToCart(cartItem);
    setAdded(true);
    setStockMessage('');
    setTimeout(() => setAdded(false), 2500);
  }

  return (
    <div className="customer-page mx-auto max-w-7xl px-4 py-6 sm:px-5 sm:py-10 lg:px-8">
      <SEO {...productSeoDescriptor(product, {
        collection: parentCollection,
        includeReviews: false
      })} />
      <Breadcrumbs items={[
        { label: 'Home', to: '/' },
        { label: 'Shop', to: '/shop' },
        ...(parentCollection ? [{ label: parentCollection.name, to: `/collections/${encodeURIComponent(parentCollection.slug)}` }] : []),
        { label: product.name }
      ]} />
      <div className="mt-5 grid min-w-0 gap-7 sm:mt-6 sm:gap-10 md:grid-cols-[1.05fr_1fr] lg:grid-cols-[1.15fr_1fr]">
        <div className="order-1 min-w-0">
          <div
            className="media-zoom relative aspect-[4/5] max-h-[72svh] touch-pan-y overflow-hidden bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
            onTouchStart={handleImageTouchStart}
            onTouchEnd={handleImageTouchEnd}
            onKeyDown={handleGalleryKeyDown}
            tabIndex={productImages.length > 1 ? 0 : undefined}
            role={productImages.length > 1 ? 'region' : undefined}
            aria-label={productImages.length > 1 ? `${product.name} image gallery` : undefined}
          >
            {image && !mainImageLoaded && !mainImageFailed && (
              <span className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.12em] text-clay" role="status">Loading image</span>
            )}
            {image && !mainImageFailed && (
              <img
                key={image.url}
                src={image.url}
                alt={(activeImage === 0 ? product.seo?.imageAltText : '') || image.altText || `${product.name}, image ${activeImage + 1}`}
                className={`product-photo-blend h-full w-full object-contain transition-opacity duration-300 ${mainImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                fetchPriority={activeImage === 0 ? 'high' : 'auto'}
                loading={activeImage === 0 ? 'eager' : 'lazy'}
                decoding="async"
                width="1200"
                height="1500"
                {...responsiveImageAttributes(image.url, {
                  sizes: '(min-width: 1024px) 55vw, 100vw',
                  shopifyWidths: [480, 960, 1600]
                })}
                onLoad={() => setLoadedImageUrl(image.url)}
                onError={() => setFailedImageUrl(image.url)}
              />
            )}
            {(!image || mainImageFailed) && (
              <div className="absolute inset-0 flex items-center justify-center bg-cream px-6 text-center text-xs uppercase tracking-[0.12em] text-clay">Product image unavailable</div>
            )}
            {productImages.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous product image"
                  onClick={showPreviousImage}
                  className="absolute left-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-xl leading-none text-ink/70 transition-colors hover:text-ink sm:left-3"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next product image"
                  onClick={showNextImage}
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-xl leading-none text-ink/70 transition-colors hover:text-ink sm:right-3"
                >
                  ›
                </button>
              </>
            )}
            {soldOut && (
              <span className="absolute left-4 top-4 rounded-full bg-ink px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-paper">
                Sold out
              </span>
            )}
          </div>
          {productImages.length > 1 && (
            <div className="product-gallery-thumbnails mt-3 flex max-w-full gap-2 overflow-x-auto pb-2" aria-label="Product image thumbnails">
              {productImages.map((thumb, index) => (
                <button
                  key={thumb.id || index}
                  ref={(node) => { thumbnailRefs.current[index] = node; }}
                  type="button"
                  onClick={() => selectImage(index)}
                  onKeyDown={(event) => handleThumbnailKeyDown(event, index)}
                  className={`product-gallery-dot product-gallery-thumbnail relative h-14 w-14 shrink-0 overflow-hidden border bg-white p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 sm:h-16 sm:w-16 ${index === activeImage ? 'border-ink opacity-100' : 'border-line opacity-70 hover:border-clay hover:opacity-100'}`}
                  aria-label={`View product image ${index + 1}`}
                  aria-current={index === activeImage ? 'true' : undefined}
                >
                  <img
                    src={thumb.url}
                    alt=""
                    className="product-photo-blend h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                    width="160"
                    height="200"
                    {...responsiveImageAttributes(thumb.url, {
                      sizes: '64px',
                      shopifyWidths: [128, 256]
                    })}
                    onError={(event) => { event.currentTarget.hidden = true; }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="order-2 min-w-0">
          <div className="customer-buy-panel md:sticky md:top-24">
            <h1 className="display break-words text-[clamp(1.5rem,7vw,2.25rem)] leading-tight sm:text-4xl">{product.name}</h1>
          <div className="mt-3 flex flex-wrap items-baseline gap-3 sm:mt-4">
            <p className={`text-xl font-semibold sm:text-2xl ${onSale ? 'text-accent' : ''}`}>{formatMoney(product.priceCents)}</p>
            {onSale && <p className="text-base text-clay line-through">{formatMoney(product.compareAtPriceCents)}</p>}
            {onSale && <p className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-deep">Save {formatMoney(savingsCents)}</p>}
          </div>
          {countdown && (
            <CollectionCountdown collectionName={countdown.collectionName} config={countdown.config} />
          )}

          <div className="mt-6 sm:mt-8">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Size</p>
              <button
                type="button"
                className="touch-target text-action inline-flex items-center text-[11px] font-semibold uppercase tracking-[0.14em] text-accent underline"
                onClick={() => setSizeChartOpen(true)}
              >
                View Size Chart
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {product.variants.map((candidate) => {
                const out = Number(candidate.stockQuantity) <= 0;
                const selected = candidate.id === variantId;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    disabled={out}
                    onClick={() => selectVariant(candidate)}
                    aria-pressed={selected}
                    className={`min-h-11 min-w-11 rounded-full border border-line px-3 py-2 text-[11px] font-semibold uppercase transition-colors sm:min-w-12 sm:px-4 sm:py-2.5 sm:text-xs ${
                      selected ? '!border-ink bg-ink text-paper' : 'hover:border-ink'
                    } ${out ? 'cursor-not-allowed text-clay line-through hover:border-line' : ''}`}
                  >
                    {candidate.size}
                  </button>
                );
              })}
            </div>
            {variant && Number(variant.stockQuantity) > 0 && Number(variant.stockQuantity) <= settings.inventory.lowStockThreshold && (
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-red-600">
                {variantStockLabel()}
              </p>
            )}
            {variantSoldOut && (
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-red-600">Sold Out</p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center rounded border border-line bg-white">
              <button type="button" className="touch-target px-3 py-2.5 text-base disabled:cursor-not-allowed disabled:text-clay sm:px-4 sm:py-3 sm:text-lg" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={variantSoldOut || quantity <= 1} aria-label="Decrease quantity">−</button>
              <span className="min-w-10 text-center text-sm font-semibold">{quantity}</span>
              <button type="button" className="touch-target px-3 py-2.5 text-base disabled:cursor-not-allowed disabled:text-clay sm:px-4 sm:py-3 sm:text-lg" onClick={increaseQuantity} disabled={variantSoldOut || quantity >= variantStock} aria-label="Increase quantity">+</button>
            </div>
            <button type="button" className="btn-ink customer-compact-button min-w-44 flex-1 !rounded" disabled={variantSoldOut} onClick={handleAdd}>
              {variantSoldOut ? (page.soldOutText || 'Sold Out') : added ? 'Added ✓' : 'Add to cart'}
            </button>
          </div>
          {variantSoldOut && settings.messengerUrl && (
            <a
              className="btn-ghost mt-3 inline-flex min-h-11 w-full items-center justify-center text-center"
              href={settings.messengerUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Ask Maria Clara Clothing about restocking ${product.name}`}
            >
              Ask about restock
            </a>
          )}
          {stockMessage && <p className="mt-3 text-sm text-accent-deep" role="alert">{stockMessage}</p>}
          {added && (
            <p className="mt-3 text-sm text-accent-deep">
              Added to cart. <Link to="/cart" className="underline">View cart</Link> or{' '}
              <Link to="/checkout" className="underline">checkout</Link>.
            </p>
          )}
          <ul className="mt-4 grid grid-cols-2 gap-2 text-xs leading-snug text-ink-soft" aria-label="Payment and delivery reassurance">
            {cashOnDeliveryAvailable && (
              <li className="border border-line p-3"><strong className="block text-ink">Cash on Delivery</strong>No advance payment</li>
            )}
            <li className="border border-line p-3"><strong className="block text-ink">J&amp;T nationwide</strong>Shipping fee is shown before you place the order</li>
            <li className="col-span-2 border border-line p-3"><strong className="text-ink">7-day replacement support</strong> for a wrong or damaged item</li>
            {freeShippingEnabled && (
              <li className="col-span-2 border border-line p-3 font-semibold text-ink">
                Add {freeShippingMinimumItems} or more item{freeShippingMinimumItems === 1 ? '' : 's'} and get free shipping.
              </li>
            )}
          </ul>

          <div className="product-detail-accordion mt-6 border-y border-line" aria-label="Product information">
            {(productFacts.length > 0 || primaryDetailSections.length > 0) && (
              <details className="group border-b border-line last:border-b-0">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-xs font-semibold uppercase tracking-[0.12em]">
                  Product details <span className="text-lg font-normal transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <div className="space-y-5 pb-5 text-sm leading-relaxed text-ink-soft">
                  {productFacts.length > 0 && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {productFacts.map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-clay">{label}</dt>
                          <dd className="mt-1 break-words text-ink">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {primaryDetailSections.map((detail, index) => (
                    <section key={detail.title + '-' + index}>
                      {primaryDetailSections.length > 1 && (
                        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-clay">{detail.title}</h3>
                      )}
                      <ProductDetailContent detail={detail} productName={product.name} />
                    </section>
                  ))}
                </div>
              </details>
            )}
            {detailTabs.filter((detail) => ['Size Chart', 'Shipping'].includes(detail.title)).map((detail, index) => (
              <details key={`${detail.title}-${index}`} className="group border-b border-line last:border-b-0">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-xs font-semibold uppercase tracking-[0.12em]">
                  {detail.title === 'Size Chart' ? 'Size & fit' : 'Shipping & returns'} <span className="text-lg font-normal transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <div className="pb-5 text-sm leading-relaxed text-ink-soft">
                  <ProductDetailContent detail={detail} productName={product.name} />
                  {detail.title === 'Shipping' && (
                    <Link to="/shipping-returns" className="mt-3 inline-block font-semibold text-accent underline">Read the complete shipping and exchange policy</Link>
                  )}
                </div>
              </details>
            ))}
          </div>
          {parentCollection && (
            <Link to={'/collections/' + encodeURIComponent(parentCollection.slug)} className="mt-4 inline-block text-xs font-semibold uppercase tracking-[0.1em] text-accent underline">
              More in {parentCollection.name}
            </Link>
          )}
          </div>
        </div>
      </div>

      {recommendedProducts.length > 0 && (
        <section className="mt-20 border-t border-line pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">{freeShippingEnabled ? `Free shipping on ${freeShippingMinimumItems}+ items` : 'More in-stock pieces'}</p>
              <h2 className="display mt-2 text-3xl sm:text-5xl">You May Also Like</h2>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-ink-soft">
              {freeShippingEnabled
                ? `Buy ${freeShippingMinimumItems} or more item${freeShippingMinimumItems === 1 ? '' : 's'} and your shipping fee is free at checkout.`
                : 'Explore more available pieces from Maria Clara Clothing.'}
            </p>
          </div>
          <div className="storefront-product-grid storefront-product-grid--mobile-two mt-8">
            {recommendedProducts.map(({ candidate: recommended }, index) => (
              <ProductCard key={recommended.id} product={recommended} index={index} />
            ))}
          </div>
        </section>
      )}
      {sizeChartOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/55 p-3 sm:items-center sm:p-6" role="presentation">
          <div ref={sizeChartDialogRef} tabIndex={-1} className="max-h-[88svh] w-full max-w-3xl overflow-y-auto border border-line bg-paper shadow-2xl" role="dialog" aria-modal="true" aria-label="Size chart">
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-paper px-4 py-3 sm:px-5">
              <div>
                <p className="eyebrow">Fit guide</p>
                <h2 className="display text-2xl">Size Chart</h2>
              </div>
              <button ref={sizeChartCloseButtonRef} type="button" className="touch-target text-2xl leading-none text-ink" aria-label="Close size chart" onClick={closeSizeChart}>×</button>
            </div>
            <div className="p-4 sm:p-5">
              {sizeChartRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-clay">
                        <th className="py-2 pr-4">Size</th>
                        <th className="py-2 pr-4">Width</th>
                        <th className="py-2 pr-4">Length</th>
                        <th className="py-2 pr-4">Sleeve length</th>
                        <th className="py-2">Shoulder drop</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sizeChartRows.map((row, index) => (
                        <tr key={`${row.size || 'size'}-${index}`} className="border-b border-line/60">
                          <td className="py-2 pr-4 font-semibold text-ink">{row.size}</td>
                          <td className="py-2 pr-4">{row.width}</td>
                          <td className="py-2 pr-4">{row.length}</td>
                          <td className="py-2 pr-4">{row.sleeveLength}</td>
                          <td className="py-2">{row.shoulderDropLength}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : sizeChartImageUrl ? (
                <img src={sizeChartImageUrl} alt={sizeChartAltText} className="w-full bg-white object-contain" loading="lazy" />
              ) : (
                <p className="text-sm text-ink-soft">Please message us for the current product measurements before ordering.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
