import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchProduct, fetchProducts } from '../lib/api.js';
import { addToCart } from '../lib/cart.js';
import { formatMoney } from '../lib/money.js';
import { sanitizeRichHtml } from '../lib/richText.js';
import ProductCard from '../components/ProductCard.jsx';

export default function Product() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState(0);
  const [recommendations, setRecommendations] = useState([]);

  useEffect(() => {
    setProduct(null);
    setError('');
    setActiveImage(0);
    setActiveDetailTab(0);
    setQuantity(1);
    setAdded(false);
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
  const variant = product.variants.find((candidate) => candidate.id === variantId) || null;
  const image = product.images[activeImage] || product.images[0];
  const page = product.productPage || {};
  const detailTabs = [
    descriptionHtml && { title: 'Description', type: 'html', html: descriptionHtml },
    ...(page.sections || []).map((section) => ({ title: section.title, type: 'section', section })),
    {
      title: 'Size Chart',
      type: page.sizeChartImageUrl ? 'image' : 'text',
      imageUrl: page.sizeChartImageUrl,
      body: 'Check the product measurements before ordering. Size exchanges are subject to stock availability.'
    },
    {
      title: 'Shipping',
      type: 'text',
      body: 'Cash on delivery nationwide. Add 2 or more items and get free shipping.'
    }
  ].filter(Boolean);
  const activeTab = detailTabs[activeDetailTab] || detailTabs[0];
  const recommendedProducts = recommendations
    .filter((candidate) => candidate.slug !== product.slug)
    .slice(0, 4);

  function showPreviousImage() {
    if (product.images.length < 2) return;
    setActiveImage((index) => (index - 1 + product.images.length) % product.images.length);
  }

  function showNextImage() {
    if (product.images.length < 2) return;
    setActiveImage((index) => (index + 1) % product.images.length);
  }

  function handleAdd() {
    if (!variant || soldOut) return;
    addToCart({
      productId: product.id,
      slug: product.slug,
      variantId: variant.id,
      productName: product.name,
      size: variant.size,
      quantity: Math.max(1, Number(quantity) || 1),
      unitPriceCents: product.priceCents,
      imageUrl: product.images[0]?.url || '',
      externalPosProductId: product.externalPosProductId || '',
      externalPosVariantId: variant.externalPosVariantId || ''
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
      <p className="eyebrow">
        <Link to="/" className="hover:text-accent">Shop</Link> / {product.collection || 'Catalog'}
      </p>
      <div className="mt-6 grid gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <div className="media-zoom relative aspect-[4/5] overflow-hidden bg-white">
            {image && (
              <img src={image.url} alt={image.altText || product.name} className="h-full w-full object-contain" />
            )}
            {product.images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous product image"
                  onClick={showPreviousImage}
                  className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-2xl leading-none shadow-sm transition-colors hover:bg-ink hover:text-paper"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next product image"
                  onClick={showNextImage}
                  className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-2xl leading-none shadow-sm transition-colors hover:bg-ink hover:text-paper"
                >
                  ›
                </button>
              </>
            )}
            {soldOut && (
              <span className="absolute left-4 top-4 bg-ink px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-paper">
                Sold out
              </span>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="mt-3 flex gap-3 overflow-x-auto">
              {product.images.map((thumb, index) => (
                <button
                  key={thumb.id || index}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  className={`h-20 w-16 shrink-0 overflow-hidden border bg-white ${index === activeImage ? 'border-accent' : 'border-line'}`}
                >
                  <img src={thumb.url} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 className="display text-3xl leading-tight sm:text-4xl">{product.name}</h1>
          <div className="mt-4 flex items-baseline gap-3">
            <p className={`text-2xl font-semibold ${onSale ? 'text-accent' : ''}`}>{formatMoney(product.priceCents)}</p>
            {onSale && <p className="text-base text-clay line-through">{formatMoney(product.compareAtPriceCents)}</p>}
          </div>

          <div className="mt-8">
            <p className="eyebrow">Size</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {product.variants.map((candidate) => {
                const out = Number(candidate.stockQuantity) <= 0;
                const selected = candidate.id === variantId;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    disabled={out}
                    onClick={() => setVariantId(candidate.id)}
                    className={`min-w-14 rounded border border-line px-4 py-3 text-sm font-semibold uppercase transition-colors ${
                      selected ? '!border-ink bg-ink text-paper' : 'hover:border-ink'
                    } ${out ? 'cursor-not-allowed text-clay line-through hover:border-line' : ''}`}
                  >
                    {candidate.size}
                  </button>
                );
              })}
            </div>
            {variant && Number(variant.stockQuantity) > 0 && Number(variant.stockQuantity) <= 12 && (
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent-deep">
                Limited pieces — {variant.stockQuantity} left in {variant.size}
              </p>
            )}
          </div>

          <div className="mt-6 flex items-center gap-4">
            <div className="flex items-center rounded border border-line">
              <button type="button" className="px-4 py-3 text-lg" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">−</button>
              <span className="min-w-10 text-center text-sm font-semibold">{quantity}</span>
              <button type="button" className="px-4 py-3 text-lg" onClick={() => setQuantity((q) => q + 1)} aria-label="Increase quantity">+</button>
            </div>
            <button type="button" className="btn-ink flex-1 !rounded" disabled={soldOut || !variant} onClick={handleAdd}>
              {soldOut ? (page.soldOutText || 'Sold out') : added ? 'Added ✓' : 'Add to cart'}
            </button>
          </div>
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
                  <img src={activeTab.imageUrl} alt={`${product.name} size chart`} className="w-full" loading="lazy" />
                )}
                {activeTab.type === 'text' && <p>{activeTab.body}</p>}
              </div>
            </div>
          )}
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
    </div>
  );
}
