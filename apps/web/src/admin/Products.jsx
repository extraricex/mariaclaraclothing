import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminJson } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';
import useAdminCollections from './useAdminCollections.js';

const STOCK_FILTERS = [['', 'All stock'], ['in_stock', 'In stock'], ['low_stock', 'Low stock'], ['sold_out', 'Sold out']];
const STATUS_FILTERS = [['', 'All statuses'], ['active', 'Active'], ['draft', 'Draft'], ['archived', 'Archived']];
const CATEGORY_FILTERS = [['', 'All categories'], ['T-Shirts', 'T-Shirts'], ['Apparel', 'Apparel'], ['Uncategorized', 'Uncategorized']];
const VENDOR_FILTERS = [['', 'All vendors'], ['Maria Clara', 'Maria Clara'], ['Maria Clara Clothing', 'Maria Clara Clothing']];
const SORT_OPTIONS = [
  ['name_asc', 'Name A-Z'],
  ['name_desc', 'Name Z-A'],
  ['inventory_asc', 'Inventory low-high'],
  ['inventory_desc', 'Inventory high-low']
];
const PRODUCT_VIEWS = [
  ['all', 'All', { status: '', stock: '' }],
  ['active', 'Active', { status: 'active', stock: '' }],
  ['draft', 'Draft', { status: 'draft', stock: '' }],
  ['archived', 'Archived', { status: 'archived', stock: '' }],
  ['low_stock', 'Low stock', { status: '', stock: 'low_stock' }],
  ['sold_out', 'Sold out', { status: '', stock: 'sold_out' }]
];

function statusBadgeClass(status) {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'draft') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'archived') return 'border-stone-200 bg-stone-100 text-stone-700';
  return 'border-line bg-cream text-clay';
}

function inventoryBadgeClass(product) {
  if (product.inventoryQuantity === 0) return 'border-stone-300 bg-stone-100 text-stone-700';
  if (product.inventoryQuantity <= 12) return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
}

function productViewCount(key, summary) {
  if (!summary) return null;
  const counts = {
    all: summary.total,
    active: summary.active,
    draft: summary.draft,
    archived: summary.archived,
    low_stock: summary.lowStock,
    sold_out: summary.soldOut
  };
  return Number.isFinite(counts[key]) ? counts[key] : null;
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m14.2 14.2 3.3 3.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8.5" cy="8.5" r="5.7" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export default function Products() {
  const { collections } = useAdminCollections();
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('');
  const [stock, setStock] = useState('');
  const [collection, setCollection] = useState('');
  const [category, setCategory] = useState('');
  const [vendor, setVendor] = useState('');
  const [sort, setSort] = useState('name_asc');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState('all');
  const [selectedProducts, setSelectedProducts] = useState(() => new Set());
  const [pancakeStatuses, setPancakeStatuses] = useState({});
  const [pancakeBusy, setPancakeBusy] = useState(() => new Set());
  const [pancakeMessage, setPancakeMessage] = useState('');

  async function loadPancakeStatuses(records) {
    const slugs = (records || []).map((product) => product.slug).filter(Boolean);
    if (!slugs.length) return;
    try {
      const body = await adminJson(`/api/admin/integrations/pancake/products/status?slugs=${encodeURIComponent(slugs.join(','))}`);
      setPancakeStatuses((current) => ({ ...current, ...Object.fromEntries((body.products || []).map((item) => [item.productSlug, item])) }));
    } catch (requestError) {
      setPancakeMessage(requestError.message);
    }
  }

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (stock) params.set('stock', stock);
    if (collection) params.set('collection', collection);
    if (category) params.set('category', category);
    if (vendor) params.set('vendor', vendor);
    if (sort) params.set('sort', sort);
    if (query) params.set('q', query);
    adminJson(`/api/admin/products?${params}`)
      .then((body) => {
        setProducts(body.products);
        setSummary(body.summary);
        loadPancakeStatuses(body.products);
      })
      .catch((err) => setError(err.message));
  }, [status, stock, collection, category, vendor, sort, query]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setSelectedProducts((previous) => {
      const visibleSlugs = new Set(products.map((product) => product.slug));
      return new Set([...previous].filter((slug) => visibleSlugs.has(slug)));
    });
  }, [products]);

  function selectProductView(key, viewFilters) {
    setActiveView(key);
    setStatus(viewFilters.status);
    setStock(viewFilters.stock);
    setSelectedProducts(new Set());
  }

  function toggleProductSelection(slug) {
    setSelectedProducts((previous) => {
      const next = new Set(previous);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function toggleAllProducts(event) {
    if (event.target.checked) {
      setSelectedProducts(new Set(products.map((product) => product.slug)));
      return;
    }
    setSelectedProducts(new Set());
  }

  const allVisibleSelected = products.length > 0 && selectedProducts.size === products.length;

  async function syncProduct(slug) {
    setPancakeBusy((current) => new Set(current).add(slug));
    setPancakeMessage('Syncing product to Pancake POS...');
    setPancakeStatuses((current) => ({ ...current, [slug]: { ...(current[slug] || {}), productSlug: slug, status: 'syncing' } }));
    try {
      const body = await adminJson(`/api/admin/integrations/pancake/products/${encodeURIComponent(slug)}/sync`, { method: 'POST' });
      setPancakeStatuses((current) => ({ ...current, [slug]: body.sync }));
      setPancakeMessage('Product synced successfully to Pancake POS.');
    } catch (requestError) {
      if (requestError.body?.sync) setPancakeStatuses((current) => ({ ...current, [slug]: requestError.body.sync }));
      setPancakeMessage(requestError.message);
    } finally {
      setPancakeBusy((current) => {
        const next = new Set(current);
        next.delete(slug);
        return next;
      });
    }
  }

  async function syncSelectedProducts() {
    for (const slug of selectedProducts) await syncProduct(slug);
  }

  async function applyOversizedTemplate() {
    setPancakeMessage('Checking oversized products...');
    try {
      const preview = await adminJson('/api/admin/products/templates/oversized/preview');
      if (!preview.count) {
        setPancakeMessage('No oversized products were detected.');
        return;
      }
      const names = preview.products.map((product) => product.name).join('\n');
      if (!window.confirm(`Apply the oversized content template to ${preview.count} products?\n\n${names}`)) {
        setPancakeMessage('Oversized template update cancelled.');
        return;
      }
      const result = await adminSend('POST', '/api/admin/products/templates/oversized/apply', {
        slugs: preview.products.map((product) => product.slug)
      });
      setPancakeMessage(`Oversized template applied to ${result.count} products.`);
      load();
    } catch (requestError) {
      setPancakeMessage(requestError.message);
    }
  }

  function syncLabel(sync) {
    const labels = {
      syncing: 'Syncing...', synced: 'Synced', failed: 'Sync failed',
      missing_mapping: 'Missing mapping', blocked: 'Blocked', never_synced: 'Not synced'
    };
    return labels[sync?.status] || 'Checking mapping';
  }

  return (
    <div>
      <div className="admin-mobile-stack items-start justify-between">
        <div>
          <p className="eyebrow">Products</p>
          <h1 className="display mt-1 text-3xl">Products</h1>
          <p className="mt-2 max-w-2xl text-sm text-clay">Manage catalog visibility, inventory, organization, and storefront product records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary">Import</button>
          <button type="button" className="btn-secondary">Export</button>
          <button type="button" className="btn-secondary">More actions</button>
          <button type="button" className="btn-secondary" onClick={applyOversizedTemplate}>Apply oversized template</button>
          <Link to="/admin/products/new" className="btn-ink">Add product</Link>
        </div>
      </div>

      {summary && (
        <div className="mt-6 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.1em] text-clay">
          <span className="border border-line bg-paper px-4 py-2">Total {summary.total}</span>
          <span className="border border-line bg-paper px-4 py-2">Active {summary.active}</span>
          <span className="border border-line bg-paper px-4 py-2">Low stock <strong className="text-accent-deep">{summary.lowStock}</strong></span>
          <span className="border border-line bg-paper px-4 py-2">Sold out <strong className="text-accent-deep">{summary.soldOut}</strong></span>
        </div>
      )}
      {error && <p className="mt-4 text-sm text-accent-deep">{error}</p>}
      {pancakeMessage && <p className="mt-4 text-sm text-accent-deep" role="status">{pancakeMessage}</p>}

      <div className="mt-6 border border-line bg-paper">
        <div className="product-view-tabs border-b border-line px-3 pt-3">
          {PRODUCT_VIEWS.map(([key, label, viewFilters]) => {
            const count = productViewCount(key, summary);
            const isActive = activeView === key;
            return (
              <button
                type="button"
                key={key}
                onClick={() => selectProductView(key, viewFilters)}
                className={`border-b-2 px-3 py-2 text-sm font-semibold ${isActive ? 'border-accent-deep text-accent-deep' : 'border-transparent text-clay hover:border-line hover:text-ink'}`}
              >
                {label}{count !== null && <span className="ml-2 text-xs font-normal text-clay">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="product-filter-toolbar p-3" aria-label="Product filters">
          <label className="product-search-field">
            <span className="text-clay"><SearchIcon /></span>
            <input
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-clay"
              placeholder="Search products by title, SKU, category, or status"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <select className="field min-w-0" value={status} onChange={(e) => { setStatus(e.target.value); setActiveView('all'); }}>
              {STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="field min-w-0" value={stock} onChange={(e) => { setStock(e.target.value); setActiveView('all'); }}>
              {STOCK_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="field min-w-0" value={collection} onChange={(e) => setCollection(e.target.value)}>
              <option value="">All collections</option>
              {collections.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <select className="field min-w-0" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="field min-w-0" value={vendor} onChange={(e) => setVendor(e.target.value)}>
              {VENDOR_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="field min-w-0" value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        {selectedProducts.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-cream px-3 py-2 text-sm">
            <span className="font-semibold text-accent-deep">{selectedProducts.size} selected</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary">Set as active</button>
              <button type="button" className="btn-secondary">Archive</button>
              <button type="button" className="btn-secondary" disabled={pancakeBusy.size > 0} onClick={syncSelectedProducts}>Sync selected to Pancake</button>
              <button type="button" className="btn-secondary">More actions</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-clay">
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    aria-label="Select all products"
                    checked={allVisibleSelected}
                    onChange={toggleAllProducts}
                  />
                </th>
                <th className="p-3">Product</th>
                <th className="p-3">Product status</th>
                <th className="p-3">Inventory</th>
                <th className="p-3">Product organization</th>
                <th className="p-3">Sales channels</th>
                <th className="p-3">Price</th>
                <th className="p-3">Pancake POS</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const sync = pancakeStatuses[product.slug];
                const busy = pancakeBusy.has(product.slug);
                return (
                <tr key={product.slug} className="border-b border-line/60 hover:bg-cream/60">
                  <td className="p-3 align-middle">
                    <input
                      type="checkbox"
                      aria-label={`Select ${product.name}`}
                      checked={selectedProducts.has(product.slug)}
                      onChange={() => toggleProductSelection(product.slug)}
                    />
                  </td>
                  <td className="p-3">
                    <Link to={`/admin/products/${encodeURIComponent(product.slug)}`} className="flex items-center gap-3">
                      {product.image ? (
                        <img src={product.image} alt="" className="product-photo-blend h-12 w-10 border border-line object-cover" />
                      ) : (
                        <span className="h-12 w-10 border border-line bg-cream" aria-hidden="true" />
                      )}
                      <span>
                        <span className="block font-semibold text-accent-deep underline">{product.name}</span>
                        <span className="block text-xs text-clay">{product.slug}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex border px-2 py-1 text-[11px] font-bold uppercase ${statusBadgeClass(product.status)}`}>{product.status}</span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex border px-2 py-1 text-[11px] font-bold uppercase ${inventoryBadgeClass(product)}`}>
                      {product.inventoryQuantity === 0 ? 'Sold out' : `${product.inventoryQuantity} in stock`}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-clay">
                    <span className="block font-semibold text-ink">{product.category || 'Uncategorized'}</span>
                    <span className="block">Vendor: {product.vendor || 'Maria Clara Clothing'}</span>
                    <span className="block">Collections: {(product.collections || []).join(', ') || 'None'}</span>
                  </td>
                  <td className="p-3 text-xs text-clay">
                    <span className="inline-flex border border-line bg-cream px-2 py-1 font-semibold text-ink">Online Store</span>
                  </td>
                  <td className="p-3">{formatMoney(product.priceCents)}</td>
                  <td className="p-3 text-xs">
                    <span className={`block font-semibold ${sync?.status === 'synced' ? 'text-emerald-400' : sync?.status === 'failed' || sync?.status === 'missing_mapping' ? 'text-red-300' : 'text-clay'}`}>{syncLabel(sync)}</span>
                    {sync?.pancakeProductId && <span className="mt-1 block max-w-44 truncate text-clay" title={sync.pancakeProductId}>Product ID: {sync.pancakeProductId}</span>}
                    {Number.isInteger(sync?.mappedVariantCount) && <span className="block text-clay">Variants: {sync.mappedVariantCount}/{sync.totalVariantCount} mapped</span>}
                    {sync?.lastSyncedAt && <time className="block text-clay" dateTime={sync.lastSyncedAt}>Last sync: {new Date(sync.lastSyncedAt).toLocaleString()}</time>}
                    {sync?.stockMismatch === true && <span className="mt-1 block font-semibold text-amber-300">Stock mismatch warning</span>}
                    {sync?.lastErrorCode && <span className="block text-red-300">{sync.lastErrorCode.replaceAll('_', ' ')}</span>}
                    <button type="button" className="btn-ghost mt-2 !px-3 !py-1.5 text-[10px]" disabled={busy || sync?.status === 'missing_mapping'} onClick={() => syncProduct(product.slug)}>
                      {busy ? 'Syncing...' : 'Sync to Pancake POS'}
                    </button>
                  </td>
                </tr>
                );
              })}
              {!products.length && <tr><td colSpan="8" className="p-6 text-center text-sm text-clay">No products match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
