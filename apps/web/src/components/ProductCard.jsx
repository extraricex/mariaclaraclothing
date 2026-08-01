import { Link } from 'react-router-dom';
import { formatMoney } from '../lib/money.js';
import { CustomerBadge } from './ui/Badge.jsx';
import { productPath } from '../lib/productUrl.js';
import ProductCardContent from './ProductCardContent.jsx';
import { responsiveImageAttributes } from '../lib/responsiveImage.js';
import useHoverCapability from '../hooks/useHoverCapability.js';
import { prefetchCustomerRoute } from '../lib/routePrefetch.js';

export function totalStock(product) {
  return (product.variants || []).reduce((sum, variant) => sum + Number(variant.stockQuantity || 0), 0);
}

export default function ProductCard({ product, index, eager = false }) {
  const image = product.images[0];
  const hoverImage = product.images[1];
  const canHover = useHoverCapability();
  const stock = totalStock(product);
  const soldOut = typeof product.isSoldOut === 'boolean'
    ? product.isSoldOut
    : String(product.merchandisingStatus || '').toLowerCase() === 'sold_out' || stock <= 0;
  const onSale = Number(product.compareAtPriceCents) > Number(product.priceCents);
  const savingsCents = onSale ? Number(product.compareAtPriceCents) - Number(product.priceCents) : 0;
  const availableSizes = (product.variants || [])
    .filter((variant) => Number(variant.stockQuantity || 0) > 0)
    .map((variant) => String(variant.size || '').trim().toUpperCase())
    .filter(Boolean);
  const limitedSizeChoice = !soldOut && availableSizes.length > 0 && availableSizes.length <= 2;

  return (
    <Link
      to={productPath(product)}
      className="group block text-center"
      onPointerEnter={() => prefetchCustomerRoute('product')}
      onFocus={() => prefetchCustomerRoute('product')}
    >
      <article>
        <div className="media-zoom relative isolate aspect-[4/5] overflow-hidden bg-[var(--customer-bg)]">
          {image && (
            <img
              src={image.url}
              alt={product.imageAltText || product.seo?.imageAltText || image.altText || product.name}
              loading={eager ? 'eager' : 'lazy'}
              fetchPriority={eager ? 'high' : 'auto'}
              decoding="async"
              width="1000"
              height="1250"
              {...responsiveImageAttributes(image.url, {
                sizes: '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw',
                shopifyWidths: [240, 480, 720]
              })}
              className="product-photo-blend h-full w-full object-contain group-hover:hidden"
            />
          )}
          {canHover && hoverImage && (
            <img
              src={hoverImage.url}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              width="1000"
              height="1250"
              {...responsiveImageAttributes(hoverImage.url, {
                sizes: '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw',
                shopifyWidths: [240, 480, 720]
              })}
              className="product-photo-blend absolute inset-0 hidden h-full w-full object-contain group-hover:block"
            />
          )}
          {soldOut && (
            <CustomerBadge tone="dark" className="product-stock-alert absolute bottom-2 left-1/2 -translate-x-1/2">
              Sold out
            </CustomerBadge>
          )}
          {limitedSizeChoice && (
            <CustomerBadge tone="light" className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate">
              {availableSizes.length === 1 ? `Only ${availableSizes[0]} available` : `${availableSizes.join(' & ')} available`}
            </CustomerBadge>
          )}
        </div>
        <div className="mt-2 flex flex-col items-center gap-0.5 px-1 pb-1 pt-0.5">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[12px] font-semibold leading-snug sm:text-sm group-hover:text-accent">{product.name}</h3>
          </div>
          <div className="text-[12px] sm:text-sm">
            <p className={onSale ? 'font-semibold text-accent' : 'font-semibold'}>{formatMoney(product.priceCents)}</p>
            {onSale && <p className="text-xs text-clay line-through">{formatMoney(product.compareAtPriceCents)}</p>}
            {onSale && <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-accent-deep">Save {formatMoney(savingsCents)}</p>}
          </div>
          <ProductCardContent product={product} />
        </div>
      </article>
    </Link>
  );
}
