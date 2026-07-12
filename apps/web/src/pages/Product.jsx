import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchProduct, fetchProducts } from '../lib/api.js';
import { addToCart, getCart, openCartDrawer } from '../lib/cart.js';
import { formatMoney } from '../lib/money.js';
import { trackFacebookAddToCart, trackFacebookViewContent } from '../lib/metaPixel.js';
import { sanitizeRichHtml } from '../lib/richText.js';
import { useStorefrontSettings } from '../lib/storeSettings.js';
import { selectProductCountdown } from '../lib/collectionCountdown.js';
import ProductCard from '../components/ProductCard.jsx';
import CollectionCountdown from '../components/CollectionCountdown.jsx';

export default function Product() {
  const { slug } = useParams();
  const settings = useStorefrontSettings();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [stockMessage, setStockMessage] = useState('');
  const [activeDetailTab, setActiveDetailTab] = useState(0);
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const imageTouchStartX = useRef(null);

  useEffect(() => {
    setProduct(null);
    setError('');
    setActiveImage(0);
    setActiveDetailTab(0);
    setQuantity(1);
    setAdded(false);
    setStockMessage('');
    fetchProduct(slug)
      .then((body) => {
        setProduct(body.product);
        const firstInStock = body.product.variants.find((variant) => Number(variant.stockQuantity) > 0);
        setVariantId(firstInStock?.id || '');
      })
      .catch((err) => setError(err.message));
    fetchProducts()
      .then((body) => setRecommendations(body.products || []))
      .catch(() => setRecommendations([]));
  }, [slug]);

  useEffect(() => {
    if (!product) return;
    const firstInStock = product.variants?.find((candidate) => Number(candidate.stockQuantity) > 0);
    trackFacebookViewContent({
      ...product,
      variantId: firstInStock?.id || '',
      externalPosVariantId: firstInStock?.externalPosVariantId || '',
      size: firstInStock?.size || '',
      priceCents: firstInStock?.priceCents ?? product.priceCents
    }, { path: `/product/${product.slug}` });
  }, [product?.id]);

  const descriptionHtml = useMemo(
    () => sanitizeRichHtml(product?.productPage?.intro || product?.description || ''),
    [product]
  );

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <p className="display text-3xl">Not found</p>
        <p className="mt-3 text-sm text-ink-soft">{error}</p>
        <Link to="/" className="btn-ink mt-8">Back to shop</Link>
      </div>
    );
  }

  if (!product) {
    return <div className="mx-auto max-w-7xl px-5 py-24 text-sm text-clay">Loading…</div>;
  }

  const soldOut = product.merchandisingStatus === 'sold_out';
  const onSale = Number(product.compareAtPriceCents) > Number(product.priceCents);
  const countdown = selectProductCountdown(product, settings);
  const variant = product.variants.find((candidate) => candidate.id === variantId) || null;
  const variantStock = Math.max(0, Math.trunc(Number(variant?.stockQuantity || 0)));
  const variantSoldOut = soldOut || !variant || variantStock <= 0;
  const image = product.images[activeImage] || product.images[0];
  const productPage = product.productPage || {};
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
      if (productPage.shippingText && sectionTitle === 'shipping') return false;
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
      body: productPage.shippingText || 'Cash on delivery nationwide. Add 2 or more items and get free shipping.'
    }
  ].filter(Boolean);
  const activeTab = detailTabs[activeDetailTab] || detailTabs[0];
  const recommendedProducts = recommendations
    .filter((candidate) => candidate.slug !== product.slug)
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
    if (product.images.length < 2) return;
    setActiveImage((index) => (index - 1 + product.images.length) % product.images.length);
  }

  function showNextImage() {
    if (product.images.length < 2) return;
    setActiveImage((index) => (index + 1) % product.images.length);
  }

  function handleImageTouchStart(event) {
    imageTouchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleImageTouchEnd(event) {
    if (imageTouchStartX.current === null || product.images.length < 2) return;
    const endX = event.changedTouches[0]?.clientX ?? imageTouchStartX.current;
    const delta = endX - imageTouchStartX.current;
    imageTouchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) showNextImage();
    else showPreviousImage();
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
      variantId: variant.id,
      productName: product.name,
      size: variant.size,
      quantity: Math.min(variantStock - cartQuantity, Math.max(1, Number(quantity) || 1)),
      maxStock: variantStock,
      unitPriceCents: variant.priceCents ?? product.priceCents,
      imageUrl: product.images[0]?.url || '',
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
    <div className="customer-page mx-auto max-w-7xl px-5 py-10 lg:px-8">
      <p className="eyebrow">
        <Link to="/" className="hover:text-accent">Shop</Link> / {product.collection || 'Catalog'}
      </p>
      <div className="mt-6 grid gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div className="min-w-0">
          <div
            className="media-zoom relative aspect-[4/5] max-h-[72svh] overflow-hidden bg-transparent"
            onTouchStart={handleImageTouchStart}
            onTouchEnd={handleImageTouchEnd}
          >
            {image && (
              <img src={image.url} alt={image.altText || product.name} className="product-photo-blend h-full w-full object-contain" />
            )}
            {product.images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous product image"
                  onClick={showPreviousImage}
                  className="absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-xl leading-none text-ink/70 transition-colors hover:text-ink sm:left-3 sm:h-9 sm:w-9"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next product image"
                  onClick={showNextImage}
                  className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-xl leading-none text-ink/70 transition-colors hover:text-ink sm:right-3 sm:h-9 sm:w-9"
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
          {product.images.length > 1 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              {product.images.map((thumb, index) => (
                <button
                  key={thumb.id || index}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  className={`product-gallery-dot h-2 rounded-full transition-all ${index === activeImage ? 'w-7 bg-ink' : 'w-2 bg-clay/40'}`}
                  aria-label={`Show product image ${index + 1}`}
                  aria-current={index === activeImage ? 'true' : undefined}
                >
                  <span className="sr-only">Show product image {index + 1}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="customer-buy-panel lg:sticky lg:top-24">
            <h1 className="display text-2xl leading-tight sm:text-4xl">{product.name}</h1>
          <div className="mt-3 flex items-baseline gap-3 sm:mt-4">
            <p className={`text-xl font-semibold sm:text-2xl ${onSale ? 'text-accent' : ''}`}>{formatMoney(product.priceCents)}</p>
            {onSale && <p className="text-base text-clay line-through">{formatMoney(product.compareAtPriceCents)}</p>}
          </div>

          {countdown && (
            <CollectionCountdown collectionName={countdown.collectionName} config={countdown.config} />
          )}

          <div className="mt-6 sm:mt-8">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Size</p>
              <button
                type="button"
                className="text-action text-[11px] font-semibold uppercase tracking-[0.14em] text-accent underline"
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
                    className={`min-w-10 rounded-full border border-line px-3 py-2 text-[11px] font-semibold uppercase transition-colors sm:min-w-12 sm:px-4 sm:py-2.5 sm:text-xs ${
                      selected ? '!border-ink bg-ink text-paper' : 'hover:border-ink'
                    } ${out ? 'cursor-not-allowed text-clay line-through hover:border-line' : ''}`}
                  >
                    {candidate.size}
                  </button>
                );
              })}
            </div>
            {variant && Number(variant.stockQuantity) > 0 && Number(variant.stockQuantity) <= settings.inventory.lowStockThreshold && (
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent-deep">
                {variantStockLabel()}
              </p>
            )}
            {variantSoldOut && (
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent-deep">Sold Out</p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center rounded border border-line bg-white">
              <button type="button" className="px-3 py-2.5 text-base disabled:cursor-not-allowed disabled:text-clay sm:px-4 sm:py-3 sm:text-lg" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={variantSoldOut || quantity <= 1} aria-label="Decrease quantity">−</button>
              <span className="min-w-10 text-center text-sm font-semibold">{quantity}</span>
              <button type="button" className="px-3 py-2.5 text-base disabled:cursor-not-allowed disabled:text-clay sm:px-4 sm:py-3 sm:text-lg" onClick={increaseQuantity} disabled={variantSoldOut || quantity >= variantStock} aria-label="Increase quantity">+</button>
            </div>
            <button type="button" className="btn-ink customer-compact-button min-w-44 flex-1 !rounded" disabled={variantSoldOut} onClick={handleAdd}>
              {variantSoldOut ? (page.soldOutText || 'Sold Out') : added ? 'Added ✓' : 'Add to cart'}
            </button>
          </div>
          {stockMessage && <p className="mt-3 text-sm text-accent-deep" role="alert">{stockMessage}</p>}
          {added && (
            <p className="mt-3 text-sm text-accent-deep">
              Added to cart. <Link to="/cart" className="underline">View cart</Link> or{' '}
              <Link to="/checkout" className="underline">checkout</Link>.
            </p>
          )}
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink">
            Add 2 or more items and get free shipping.
          </p>

          {activeTab && (
            <div className="mt-10 border-t border-line">
              <div className="flex overflow-x-auto border-b border-line">
                {detailTabs.map((tab, index) => (
                  <button
                    key={`${tab.title}-${index}`}
                    type="button"
                    onClick={() => setActiveDetailTab(index)}
                    className={`shrink-0 border-b-2 px-4 py-4 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                      index === activeDetailTab ? 'border-ink text-ink' : 'border-transparent text-clay hover:text-ink'
                    }`}
                  >
                    {tab.title}
                  </button>
                ))}
              </div>
              <div className="py-5 text-sm leading-relaxed text-ink-soft">
                {activeTab.type === 'html' && (
                  <div
                    className="prose-sm max-w-none [&_a]:text-accent [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_p]:mt-3"
                    dangerouslySetInnerHTML={{ __html: activeTab.html }}
                  />
                )}
                {activeTab.type === 'section' && (
                  <div>
                    {activeTab.section.body && <p>{activeTab.section.body}</p>}
                    {Array.isArray(activeTab.section.items) && (
                      <ul className="space-y-1">
                        {activeTab.section.items.map((item, i) => (
                          <li key={i} className="flex gap-2"><span className="text-accent">—</span>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {activeTab.type === 'image' && (
                  <img src={activeTab.imageUrl} alt={activeTab.imageAltText || `${product.name} size chart`} className="w-full" loading="lazy" />
                )}
                {activeTab.type === 'size-chart' && (
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
                        {activeTab.rows.map((row, index) => (
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
                )}
                {activeTab.type === 'text' && <p>{activeTab.body}</p>}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {recommendedProducts.length > 0 && (
        <section className="mt-20 border-t border-line pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Free shipping on 2+ items</p>
              <h2 className="display mt-2 text-3xl sm:text-5xl">You May Also Like</h2>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-ink-soft">
              Buy 2 or more items and your shipping fee is free at checkout.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
            {recommendedProducts.map((recommended, index) => (
              <ProductCard key={recommended.id} product={recommended} index={index} />
            ))}
          </div>
        </section>
      )}
      {sizeChartOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/55 p-3 sm:items-center sm:p-6" role="presentation">
          <div className="max-h-[88svh] w-full max-w-3xl overflow-y-auto border border-line bg-paper shadow-2xl" role="dialog" aria-modal="true" aria-label="Size chart">
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-paper px-4 py-3 sm:px-5">
              <div>
                <p className="eyebrow">Fit guide</p>
                <h2 className="display text-2xl">Size Chart</h2>
              </div>
              <button type="button" className="touch-target text-2xl leading-none text-ink" aria-label="Close size chart" onClick={() => setSizeChartOpen(false)}>×</button>
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
                <p className="text-sm text-ink-soft">Size chart is not configured yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
