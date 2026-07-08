import { Link } from 'react-router-dom';
import { formatMoney } from '../lib/money.js';
import { useStorefrontSettings } from '../lib/storeSettings.js';
import { CustomerBadge } from './ui/Badge.jsx';

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

  return (
    <Link to={`/product/${encodeURIComponent(product.slug)}`} className="group block text-center">
      <article>
        <div className="media-zoom relative aspect-[4/5] overflow-hidden bg-transparent">
          {image && (
            <img
              src={image.url}
              alt={image.altText || product.name}
              loading="lazy"
              className="product-photo-blend h-full w-full object-contain group-hover:hidden"
            />
          )}
          {hoverImage && (
            <img
              src={hoverImage.url}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="product-photo-blend absolute inset-0 hidden h-full w-full object-contain group-hover:block"
            />
          )}
          {soldOut && (
            <CustomerBadge tone="dark" className="absolute left-1/2 top-3 -translate-x-1/2">
              Sold out
            </CustomerBadge>
          )}
          {limited && (
            <CustomerBadge tone="warm" className="absolute left-1/2 top-3 -translate-x-1/2">
              Limited pieces
            </CustomerBadge>
          )}
        </div>
        <div className="mt-3 flex min-h-[132px] flex-col items-center justify-between gap-3 px-2 pb-2 pt-1">
          <div>
            <p className="eyebrow">{String(index + 1).padStart(2, '0')}</p>
            <h3 className="mt-1 text-sm font-semibold leading-snug group-hover:text-accent">{product.name}</h3>
          </div>
          <div className="text-sm">
            <p className={onSale ? 'font-semibold text-accent' : 'font-semibold'}>{formatMoney(product.priceCents)}</p>
            {onSale && <p className="text-xs text-clay line-through">{formatMoney(product.compareAtPriceCents)}</p>}
          </div>
        </div>
      </article>
    </Link>
  );
}
