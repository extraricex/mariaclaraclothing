import { Link } from 'react-router-dom';
import { formatMoney } from '../lib/money.js';
import { useStorefrontSettings } from '../lib/storeSettings.js';
import { CustomerBadge } from './ui/Badge.jsx';
import { productPath } from '../lib/productUrl.js';
import Stars from './Stars.jsx';
import { responsiveImageAttributes } from '../lib/responsiveImage.js';

export function totalStock(product) {
  return product.variants.reduce((sum, variant) => sum + Number(variant.stockQuantity || 0), 0);
}

export default function ProductCard({ product, index }) {
  const settings = useStorefrontSettings();
  const image = product.images[0];
  const hoverImage = product.images[1];
  const soldOut = product.merchandisingStatus === 'sold_out';
  const stock = totalStock(product);
  const limited = !soldOut && stock > 0 && stock <= settings.inventory.lowStockThreshold;
  const onSale = Number(product.compareAtPriceCents) > Number(product.priceCents);
  const showRating = settings.reviews?.enabled !== false &&
    settings.reviews?.showRatingsOnProductCards !== false &&
    product.reviewSettings?.reviewsEnabled !== false &&
    product.reviewSettings?.showRatingSummary !== false &&
    Number(product.reviewSummary?.totalReviews || 0) > 0;

  return (
    <Link
      to={productPath(product)}
      className="group block text-center"
      aria-label={`View ${product.name}, ${formatMoney(product.priceCents)}${onSale ? `, previously ${formatMoney(product.compareAtPriceCents)}` : ''}`}
    >
      <article>
        <div className="media-zoom relative aspect-[4/5] overflow-hidden bg-transparent">
          {image && (
            <img
              src={image.url}
              alt={image.altText || product.name}
              loading="lazy"
              decoding="async"
              {...responsiveImageAttributes(image.url, {
                sizes: '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw',
                shopifyWidths: [360, 720, 1000]
              })}
              className="product-photo-blend h-full w-full object-contain group-hover:hidden"
            />
          )}
          {hoverImage && (
            <img
              src={hoverImage.url}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              {...responsiveImageAttributes(hoverImage.url, {
                sizes: '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw',
                shopifyWidths: [360, 720, 1000]
              })}
              className="product-photo-blend absolute inset-0 hidden h-full w-full object-contain group-hover:block"
            />
          )}
          {soldOut && (
            <CustomerBadge tone="dark" className="product-stock-alert absolute bottom-2 left-1/2 -translate-x-1/2">
              Sold out
            </CustomerBadge>
          )}
          {limited && (
            <CustomerBadge tone="warm" className="product-stock-alert absolute bottom-2 left-1/2 -translate-x-1/2">
              Limited pieces
            </CustomerBadge>
          )}
        </div>
        <div className="mt-2 flex flex-col items-center gap-0.5 px-1 pb-1 pt-0.5">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[12px] font-semibold leading-snug sm:text-sm group-hover:text-accent">{product.name}</h3>
            {showRating && (
              <div className="mt-1 flex flex-wrap items-center justify-center gap-1 text-[11px] text-ink-soft">
                <Stars rating={product.reviewSummary.averageRating} />
                <span>{Number(product.reviewSummary.averageRating).toFixed(1)} ({product.reviewSummary.totalReviews})</span>
              </div>
            )}
          </div>
          <div className="text-[12px] sm:text-sm">
            <p className={onSale ? 'font-semibold text-accent' : 'font-semibold'}>{formatMoney(product.priceCents)}</p>
            {onSale && <p className="text-xs text-clay line-through">{formatMoney(product.compareAtPriceCents)}</p>}
          </div>
        </div>
      </article>
    </Link>
  );
}
