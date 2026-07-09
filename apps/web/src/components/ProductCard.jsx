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
        <div className="mt-2 flex flex-col items-center gap-1 px-1 pb-1 pt-0.5">
          <div>
            <p className="eyebrow">{String(index + 1).padStart(2, '0')}</p>
            <h3 className="mt-1 text-[12px] font-semibold leading-snug sm:text-sm group-hover:text-accent">{product.name}</h3>
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
