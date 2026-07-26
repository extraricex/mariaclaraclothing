import { useEffect, useState } from 'react';
import Stars from '../components/Stars.jsx';
import { fetchProducts } from '../lib/api.js';
import { formatMoney } from '../lib/money.js';
import { responsiveImageAttributes } from '../lib/responsiveImage.js';

const DEFAULT_EDITOR_STATE = {
  text: 'Comfortable fit and beautiful quality.',
  rating: 5,
  source: 'Previous website',
  showText: true,
  showRating: true,
  showSource: true
};

function Toggle({ checked, label, onChange }) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-clay/40 accent-accent"
      />
      {label}
    </label>
  );
}

function EditableProductCard({ product }) {
  const [editor, setEditor] = useState(DEFAULT_EDITOR_STATE);
  const image = product.images?.[0];
  const onSale = Number(product.compareAtPriceCents) > Number(product.priceCents);
  const update = (field, value) => setEditor((current) => ({
    ...current,
    [field]: value,
    ...(field === 'showRating' && value ? { showSource: true } : {})
  }));

  return (
    <article className="overflow-hidden rounded-xl border border-clay/20 bg-white shadow-[0_12px_30px_rgba(65,52,42,0.07)]">
      <div className="border-b border-clay/15 bg-white px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-clay">Customer-facing preview</p>
      </div>

      <div className="px-3 pt-3">
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-paper">
          {image && (
            <img
              src={image.url}
              alt={product.seo?.imageAltText || image.altText || product.name}
              loading="lazy"
              decoding="async"
              width="1000"
              height="1250"
              {...responsiveImageAttributes(image.url, {
                sizes: '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw',
                shopifyWidths: [360, 720, 1000]
              })}
              className="product-photo-blend h-full w-full object-contain"
            />
          )}
        </div>

        <div className="flex min-h-[92px] flex-col items-center gap-0.5 px-1 pb-3 pt-2 text-center">
          <h2 className="line-clamp-2 text-sm font-semibold leading-snug">{product.name}</h2>
          <div className="text-sm">
            <p className={onSale ? 'font-semibold text-accent' : 'font-semibold'}>
              {formatMoney(product.priceCents)}
            </p>
            {onSale && (
              <p className="text-xs text-clay line-through">{formatMoney(product.compareAtPriceCents)}</p>
            )}
          </div>

          {(editor.showText || editor.showRating || (editor.showSource && editor.source.trim())) && (
            <div className="mt-1 w-full rounded-md bg-paper/80 px-2.5 py-2">
              {editor.showRating && (
                <div
                  className="flex flex-wrap items-center justify-center gap-x-1.5"
                  role="img"
                  aria-label={`${editor.rating} out of 5 stars in this unsaved preview`}
                >
                  <Stars rating={editor.rating} label={false} size={15} />
                  <span className="text-xs font-semibold tabular-nums">{editor.rating}.0</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-clay">
                    {editor.source}
                  </span>
                </div>
              )}
              {editor.showText && editor.text.trim() && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-soft">{editor.text}</p>
              )}
              {editor.showSource && !editor.showRating && editor.source.trim() && (
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-clay">
                  {editor.source}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <section
        className="border-t-4 border-ink bg-[#f4f1eb] p-3 text-left"
        aria-label={`Admin-only controls for ${product.name}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-deep">
              Admin only
            </p>
            <h3 className="mt-0.5 text-sm font-bold text-ink">Product card content controls</h3>
          </div>
          <span className="rounded-full border border-ink/15 bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-soft">
            Not customer-visible
          </span>
        </div>

        <label className="mt-3 block text-xs font-semibold text-ink">
          Editable text
          <textarea
            value={editor.text}
            onChange={(event) => update('text', event.target.value)}
            rows="3"
            className="mt-1.5 w-full resize-y rounded-md border border-clay/30 bg-white px-3 py-2 text-sm leading-relaxed outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
            placeholder="Enter the text to show beneath this product."
          />
        </label>

        <fieldset className="mt-3">
          <legend className="text-xs font-semibold text-ink">Editable 5-star rating</legend>
          <div className="mt-1 flex items-center">
            <Stars
              rating={editor.rating}
              interactive
              label={false}
              onChange={(rating) => update('rating', rating)}
            />
            <span className="ml-2 text-xs font-semibold tabular-nums text-ink-soft">{editor.rating}.0 / 5</span>
          </div>
        </fieldset>

        <label className="mt-3 block text-xs font-semibold text-ink">
          Optional source label
          <input
            type="text"
            value={editor.source}
            onChange={(event) => update('source', event.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-md border border-clay/30 bg-white px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
            placeholder="Example: Facebook Messenger"
          />
        </label>

        <div className="mt-3 border-t border-clay/20 pt-2">
          <p className="text-xs font-semibold text-ink">Show / Hide</p>
          <div className="mt-1 flex flex-wrap gap-x-4">
            <Toggle checked={editor.showText} label="Text" onChange={(value) => update('showText', value)} />
            <Toggle checked={editor.showRating} label="Rating" onChange={(value) => update('showRating', value)} />
            <label className={`inline-flex min-h-11 items-center gap-2 text-xs font-medium ${editor.showRating ? 'cursor-not-allowed text-clay' : 'cursor-pointer text-ink'}`}>
              <input
                type="checkbox"
                checked={editor.showSource}
                disabled={editor.showRating}
                onChange={(event) => update('showSource', event.target.checked)}
                className="h-4 w-4 rounded border-clay/40 accent-accent"
              />
              Source
            </label>
          </div>
          {editor.showRating && (
            <p className="mt-1 text-[10px] leading-relaxed text-clay">
              The source stays visible whenever a manually entered rating is shown.
            </p>
          )}
        </div>
      </section>
    </article>
  );
}

export default function ProductCardReviewControlsPreview() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchProducts()
      .then((catalog) => {
        if (active) setProducts((catalog.products || []).slice(0, 4));
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Could not load preview products.');
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="customer-page min-h-screen bg-[#f6f4ef]">
      <div className="bg-ink px-4 py-3 text-paper sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <p className="text-sm font-bold tracking-wide">MARIA CLARA ADMIN</p>
          <span className="rounded-full border border-paper/30 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em]">
            Product editor preview
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="rounded-xl border border-accent/30 bg-accent-soft/30 px-4 py-5 sm:px-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent-deep">
          Admin Visual Companion — Local Preview
        </p>
        <h1 className="display mt-2 text-3xl sm:text-5xl">Admin product-card controls</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">
          The editing fields are available only in Admin. Customers see only the compact content preview
          above each admin panel, based on the visibility settings you choose.
          Changes on this page are temporary and are not saved or published.
        </p>
      </header>

      {error && <p className="mt-8 text-sm text-accent-deep" role="alert">{error}</p>}
      {!error && !products.length && (
        <p className="mt-8 text-sm text-clay" aria-live="polite">Loading visual companion…</p>
      )}
      {!!products.length && (
        <section className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="Admin product card controls">
          {products.map((product) => (
            <EditableProductCard key={product.id} product={product} />
          ))}
        </section>
      )}
      </div>
    </main>
  );
}
