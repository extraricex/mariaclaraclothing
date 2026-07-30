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

  return (
    <Link
      to={productPath(product)}
      className="group block text-center"
      aria-label={`View ${product.name}, ${formatMoney(product.priceCents)}${onSale ? `, previously ${formatMoney(product.compareAtPriceCents)}` : ''}`}
      onPointerEnter={() => prefetchCustomerRoute('product')}
      onFocus={() => prefetchCustomerRoute('product')}
    >
      <article>
        <div className="media-zoom relative aspect-[4/5] overflow-hidden bg-transparent">
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
                shopifyWidths: [360, 720, 1000]
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
        </div>
        <div className="mt-2 flex flex-col items-center gap-0.5 px-1 pb-1 pt-0.5">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[12px] font-semibold leading-snug sm:text-sm group-hover:text-accent">{product.name}</h3>
          </div>
          <div className="text-[12px] sm:text-sm">
            <p className={onSale ? 'font-semibold text-accent' : 'font-semibold'}>{formatMoney(product.priceCents)}</p>
            {onSale && <p className="text-xs text-clay line-through">{formatMoney(product.compareAtPriceCents)}</p>}
          </div>
          <ProductCardContent product={product} />
        </div>
      </article>
    </Link>
  );
}
