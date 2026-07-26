import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCommerceStats from '../components/ProductCommerceStats.jsx';
import Stars from '../components/Stars.jsx';
import { fetchProducts } from '../lib/api.js';
import { formatMoney } from '../lib/money.js';
import { productPath } from '../lib/productUrl.js';
import { responsiveImageAttributes } from '../lib/responsiveImage.js';

function randomDemoRating() {
  return Number((4.8 + Math.floor(Math.random() * 3) / 10).toFixed(1));
}

function DemoRating({ value }) {
  return (
    <div
      className="flex min-h-5 max-w-full flex-wrap items-center justify-center gap-x-1.5 text-[11px] leading-4 text-ink-soft sm:text-xs"
      role="img"
      aria-label={`Generated preview rating: ${value.toFixed(1)} out of 5. Preview only.`}
      style={{
        '--rating-star-filled': '#b8862d',
        '--rating-star-filled-border': '#8a621d',
        '--rating-star-empty': '#f1efeb',
        '--rating-star-border': '#8f8a82'
      }}
    >
      <Stars rating={value} label={false} size={17} />
      <span className="font-semibold tabular-nums text-ink">{value.toFixed(1)}</span>
    </div>
  );
}

function DemoProductCard({ product, rating }) {
  const image = product.images?.[0];
  const onSale = Number(product.compareAtPriceCents) > Number(product.priceCents);

  return (
    <Link
      to={productPath(product)}
      className="group block text-center"
      aria-label={`Preview ${product.name} with a generated ${rating.toFixed(1)} rating`}
    >
      <article>
        <div className="media-zoom relative aspect-[4/5] overflow-hidden bg-transparent">
          {image && (
            <img
              src={image.url}
              alt={product.seo?.imageAltText || image.altText || product.name}
              loading="lazy"
              decoding="async"
              width="1000"
              height="1250"
              {...responsiveImageAttributes(image.url, {
                sizes: '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw',
                shopifyWidths: [360, 720, 1000]
              })}
              className="product-photo-blend h-full w-full object-contain"
            />
          )}
        </div>
        <div className="mt-2 flex flex-col items-center gap-0.5 px-1 pb-1 pt-0.5">
          <h2 className="line-clamp-2 text-[12px] font-semibold leading-snug sm:text-sm group-hover:text-accent">
            {product.name}
          </h2>
          <div className="text-[12px] sm:text-sm">
            <p className={onSale ? 'font-semibold text-accent' : 'font-semibold'}>
              {formatMoney(product.priceCents)}
            </p>
            {onSale && (
              <p className="text-xs text-clay line-through">
                {formatMoney(product.compareAtPriceCents)}
              </p>
            )}
          </div>
          <DemoRating value={rating} />
          <ProductCommerceStats product={product} className="mt-0" />
        </div>
      </article>
    </Link>
  );
}

export default function RatingVisualCompanion() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchProducts()
      .then((catalog) => {
        if (active) setProducts((catalog.products || []).slice(0, 8));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Could not load preview products.');
      });
    return () => {
      active = false;
    };
  }, []);

  const demoProducts = useMemo(
    () => products.map((product) => ({ product, rating: randomDemoRating() })),
    [products]
  );

  return (
    <main className="customer-page mx-auto min-h-screen max-w-7xl px-5 py-10 sm:py-14 lg:px-8">
      <section className="rounded-[8px] border border-accent/30 bg-accent-soft/30 px-4 py-4 sm:px-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent-deep">
          Visual Preview — Generated Sample Ratings
        </p>
        <h1 className="display mt-2 text-3xl sm:text-5xl">Product rating visual companion</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Ratings on this page are randomly generated between 4.8 and 5.0 for visual review only.
          They are not customer reviews and will not appear on the production storefront.
        </p>
      </section>

      {error && <p className="mt-8 text-sm text-accent-deep" role="alert">{error}</p>}
      {!error && !demoProducts.length && (
        <p className="mt-8 text-sm text-clay" aria-live="polite">Loading visual companion…</p>
      )}
      {!!demoProducts.length && (
        <section className="mt-8" aria-label="Demo product rating cards">
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-4">
            {demoProducts.map(({ product, rating }) => (
              <DemoProductCard key={product.id} product={product} rating={rating} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
