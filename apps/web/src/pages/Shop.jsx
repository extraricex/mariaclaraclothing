import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard, { totalStock } from '../components/ProductCard.jsx';
import { fetchProducts } from '../lib/api.js';
import { DEFAULT_STOREFRONT_SETTINGS, loadStorefrontSettings } from '../lib/storeSettings.js';
import { collectionMembers, normalizeCollectionDefinitions } from '../lib/storefrontCollections.js';
import SEO from '../components/SEO.jsx';
import { breadcrumbStructuredData, INDEX_ROBOTS, NOINDEX_FOLLOW_ROBOTS } from '../lib/seo.js';

const VALID_SORTS = new Set(['featured', 'most_ordered', 'price_low', 'price_high', 'name', 'availability']);

function searchableText(product) {
  return [
    product.name, product.description, product.category, product.productType, product.vendor,
    ...(product.collections || []), ...(product.tags || []),
    ...(product.variants || []).flatMap((variant) => [variant.sku, variant.size])
  ].join(' ').toLowerCase();
}

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_STOREFRONT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState(params.get('q') || '');
  const [collection, setCollection] = useState(params.get('collection') || '');
  const [size, setSize] = useState(params.get('size') || '');
  const [availability, setAvailability] = useState(params.get('availability') || '');
  const [minimumPrice, setMinimumPrice] = useState('');
  const [maximumPrice, setMaximumPrice] = useState('');
  const requestedSort = params.get('sort') || 'featured';
  const [sort, setSort] = useState(VALID_SORTS.has(requestedSort) ? requestedSort : 'featured');

  useEffect(() => {
    let active = true;
    Promise.all([fetchProducts(), loadStorefrontSettings()])
      .then(([catalog, storefront]) => {
        if (!active) return;
        setProducts(catalog.products || []);
        setSettings(storefront);
      })
      .catch((requestError) => active && setError(requestError.message || 'Could not load the shop.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set('q', query.trim());
    if (collection) next.set('collection', collection);
    if (size) next.set('size', size);
    if (availability) next.set('availability', availability);
    if (sort !== 'featured') next.set('sort', sort);
    setParams(next, { replace: true });
  }, [availability, collection, query, setParams, size, sort]);

  const collections = useMemo(() => normalizeCollectionDefinitions(settings.collectionDefinitions || [])
    .filter((item) => item.visible && item.showOnShop)
    .filter((item) => collectionMembers(products, item).length > 0), [products, settings.collectionDefinitions]);
  const sizes = useMemo(() => [...new Set(products.flatMap((product) => (product.variants || [])
    .filter((variant) => Number(variant.stockQuantity || 0) > 0)
    .map((variant) => String(variant.size || '').trim())).filter(Boolean))], [products]);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const minimumCents = minimumPrice === '' ? null : Math.max(0, Math.round(Number(minimumPrice) * 100));
    const maximumCents = maximumPrice === '' ? null : Math.max(0, Math.round(Number(maximumPrice) * 100));
    const filtered = products
      .filter((product) => !needle || searchableText(product).includes(needle))
      .filter((product) => !collection || (product.collections || []).some((name) => String(name).toLowerCase() === collection.toLowerCase()))
      .filter((product) => !size || (product.variants || []).some((variant) => variant.size === size && Number(variant.stockQuantity || 0) > 0))
      .filter((product) => availability !== 'in_stock' || totalStock(product) > 0)
      .filter((product) => availability !== 'sold_out' || totalStock(product) <= 0)
      .filter((product) => minimumCents === null || Number(product.priceCents || 0) >= minimumCents)
      .filter((product) => maximumCents === null || Number(product.priceCents || 0) <= maximumCents);
    return filtered.sort((left, right) => {
      if (sort === 'most_ordered') {
        return Number(right.successfulOrderCount || 0) - Number(left.successfulOrderCount || 0)
          || Number(Boolean(right.featured)) - Number(Boolean(left.featured));
      }
      if (sort === 'price_low') return Number(left.priceCents) - Number(right.priceCents);
      if (sort === 'price_high') return Number(right.priceCents) - Number(left.priceCents);
      if (sort === 'name') return String(left.name).localeCompare(String(right.name));
      if (sort === 'availability') return Number(totalStock(right) > 0) - Number(totalStock(left) > 0);
      return Number(Boolean(right.featured)) - Number(Boolean(left.featured));
    });
  }, [availability, collection, maximumPrice, minimumPrice, products, query, size, sort]);

  function clearFilters() {
    setQuery(''); setCollection(''); setSize(''); setAvailability('');
    setMinimumPrice(''); setMaximumPrice(''); setSort('featured');
  }

  if (loading) return <div className="mx-auto min-h-[70vh] max-w-7xl px-5 py-16 text-sm text-clay" aria-busy="true">Loading shop...</div>;
  if (error) return <div className="mx-auto min-h-[70vh] max-w-7xl px-5 py-16 text-sm text-accent-deep" role="alert">{error}</div>;

  return (
    <div className="customer-page mx-auto max-w-7xl px-5 py-10 sm:py-14 lg:px-8">
      <SEO
        title="Shop Premium T-Shirts | Maria Clara Clothing"
        description="Shop Maria Clara Clothing oversized, regular-fit, and crop-box shirts with current size availability and nationwide delivery."
        canonical="/shop"
        robots={params.toString() ? NOINDEX_FOLLOW_ROBOTS : INDEX_ROBOTS}
        structuredData={breadcrumbStructuredData([{ name: 'Home', path: '/' }, { name: 'Shop' }])}
      />
      <p className="eyebrow">Shop</p>
      <h1 className="display mt-2 text-4xl sm:text-6xl">Find your next piece</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">Search real in-stock products and filter by collection, available size, or price.</p>

      <section className="mt-8 rounded-[8px] border border-line bg-white p-4 sm:p-5" aria-label="Product filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="sm:col-span-2"><span className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Search</span><input className="field mt-1" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, SKU, fit, or color" /></label>
          <label><span className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Collection</span><select className="field mt-1" value={collection} onChange={(event) => setCollection(event.target.value)}><option value="">All collections</option>{collections.map((item) => <option key={item.slug} value={item.name}>{item.name}</option>)}</select></label>
          <label><span className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Available size</span><select className="field mt-1" value={size} onChange={(event) => setSize(event.target.value)}><option value="">All sizes</option>{sizes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Availability</span><select className="field mt-1" value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="">All products</option><option value="in_stock">In stock</option><option value="sold_out">Sold out</option></select></label>
          <label><span className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Minimum price</span><input className="field mt-1" type="number" min="0" inputMode="decimal" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} placeholder="₱0" /></label>
          <label><span className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Maximum price</span><input className="field mt-1" type="number" min="0" inputMode="decimal" value={maximumPrice} onChange={(event) => setMaximumPrice(event.target.value)} placeholder="No maximum" /></label>
          <label><span className="text-xs font-semibold uppercase tracking-[0.12em] text-clay">Sort</span><select className="field mt-1" value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="most_ordered">Most ordered</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option><option value="name">Name</option><option value="availability">Availability</option></select></label>
        </div>
        <button type="button" className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-accent underline" onClick={clearFilters}>Clear filters</button>
      </section>

      <div className="mt-8 flex items-center justify-between border-b border-line pb-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">Products</h2>
        <p className="text-xs text-clay" aria-live="polite">{results.length} {results.length === 1 ? 'piece' : 'pieces'}</p>
      </div>
      {results.length ? (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-4">
          {results.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
        </div>
      ) : (
        <div className="py-16 text-center"><h2 className="display text-3xl">No matching pieces</h2><p className="mt-3 text-sm text-ink-soft">Try clearing a filter or searching for another size or style.</p><button type="button" className="btn-ghost mt-6" onClick={clearFilters}>Clear filters</button></div>
      )}
    </div>
  );
}
