import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchProduct } from '../lib/api.js';
import { addToCart } from '../lib/cart.js';
import { formatMoney } from '../lib/money.js';
import { sanitizeRichHtml } from '../lib/richText.js';

export default function Product() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setProduct(null);
    setError('');
    setActiveImage(0);
    setQuantity(1);
    setAdded(false);
    fetchProduct(slug)
      .then((body) => {
        setProduct(body.product);
        const firstInStock = body.product.variants.find((variant) => Number(variant.stockQuantity) > 0);
        setVariantId(firstInStock?.id || '');
      })
      .catch((err) => setError(err.message));
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
          <div className="media-zoom relative aspect-[4/5] overflow-hidden bg-cream">
            {image && (
              <img src={image.url} alt={image.altText || product.name} className="h-full w-full object-cover" />
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
                  className={`h-20 w-16 shrink-0 overflow-hidden border ${index === activeImage ? 'border-accent' : 'border-line'}`}
                >
                  <img src={thumb.url} alt="" className="h-full w-full object-cover" />
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
                    className={`min-w-14 border px-4 py-3 text-sm font-semibold uppercase transition-colors ${
                      selected ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'
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
            <div className="flex items-center border border-line">
              <button type="button" className="px-4 py-3 text-lg" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">−</button>
              <span className="min-w-10 text-center text-sm font-semibold">{quantity}</span>
              <button type="button" className="px-4 py-3 text-lg" onClick={() => setQuantity((q) => q + 1)} aria-label="Increase quantity">+</button>
            </div>
            <button type="button" className="btn-ink flex-1" disabled={soldOut || !variant} onClick={handleAdd}>
              {soldOut ? (page.soldOutText || 'Sold out') : added ? 'Added ✓' : 'Add to cart'}
            </button>
          </div>
          {added && (
            <p className="mt-3 text-sm text-accent-deep">
              Added to cart. <Link to="/cart" className="underline">View cart</Link> or{' '}
              <Link to="/checkout" className="underline">checkout</Link>.
            </p>
          )}

          {descriptionHtml && (
            <div
              className="prose-sm mt-10 max-w-none border-t border-line pt-6 text-sm leading-relaxed text-ink-soft [&_a]:text-accent [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_p]:mt-3"
              dangerouslySetInnerHTML={{ __html: descriptionHtml }}
            />
          )}

          {(page.sections || []).map((section, index) => (
            <details key={index} className="group border-t border-line py-4" open={index === 0}>
              <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold uppercase tracking-[0.12em]">
                {section.title}
                <span className="text-accent transition-transform group-open:rotate-45">+</span>
              </summary>
              {section.body && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{section.body}</p>}
              {Array.isArray(section.items) && (
                <ul className="mt-3 space-y-1 text-sm text-ink-soft">
                  {section.items.map((item, i) => (
                    <li key={i} className="flex gap-2"><span className="text-accent">—</span>{item}</li>
                  ))}
                </ul>
              )}
            </details>
          ))}

          {page.sizeChartImageUrl && (
            <details className="border-t border-line py-4">
              <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.12em]">Size chart</summary>
              <img src={page.sizeChartImageUrl} alt={`${product.name} size chart`} className="mt-4 w-full" loading="lazy" />
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
