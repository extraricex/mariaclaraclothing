import { Link } from 'react-router-dom';
import { formatMoney } from '../lib/money.js';

export function totalStock(product) {
  return product.variants.reduce((sum, variant) => sum + Number(variant.stockQuantity || 0), 0);
}

export default function ProductCard({ product, index }) {
  const image = product.images[0];
  const hoverImage = product.images[1];
  const soldOut = product.merchandisingStatus === 'sold_out';
  const stock = totalStock(product);
  const limited = !soldOut && stock > 0 && stock <= 12;
  const onSale = Number(product.compareAtPriceCents) > Number(product.priceCents);

  return (
    <Link to={`/product/${encodeURIComponent(product.slug)}`} className="group block">
      <div className="media-zoom relative aspect-[4/5] overflow-hidden bg-cream">
        {image && (
          <img
            src={image.url}
            alt={image.altText || product.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
        {hoverImage && (
          <img
            src={hoverImage.url}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        )}
        {soldOut && (
          <span className="absolute left-3 top-3 bg-ink px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-paper">
            Sold out
          </span>
        )}
        {limited && (
          <span className="absolute left-3 top-3 bg-accent px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-paper">
            Limited pieces
          </span>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{String(index + 1).padStart(2, '0')}</p>
          <h3 className="mt-1 text-sm font-semibold leading-snug group-hover:text-accent">{product.name}</h3>
        </div>
        <div className="text-right text-sm">
          <p className={onSale ? 'font-semibold text-accent' : 'font-semibold'}>{formatMoney(product.priceCents)}</p>
          {onSale && <p className="text-xs text-clay line-through">{formatMoney(product.compareAtPriceCents)}</p>}
        </div>
      </div>
    </Link>
  );
}
