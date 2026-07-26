export default function ProductCommerceStats({ product, className = '' }) {
  const stockText = String(product?.stockDisplayText || '').trim();
  const soldText = String(product?.soldDisplayText || '').trim();
  if (!stockText && !soldText) return null;

  return (
    <p
      className={`product-card-commerce-stats max-w-full break-words text-center text-[10px] font-medium leading-4 text-ink-soft sm:text-[11px] ${className}`}
      aria-label={[stockText, soldText].filter(Boolean).join(', ')}
    >
      {stockText && <span className="stock-status">{stockText}</span>}
      {stockText && soldText && <span className="mx-1.5" aria-hidden="true">•</span>}
      {soldText && <span className="sold-count">{soldText}</span>}
    </p>
  );
}
