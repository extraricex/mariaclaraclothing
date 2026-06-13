import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminJson } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';

const STOCK_FILTERS = [['', 'All stock'], ['in_stock', 'In stock'], ['low_stock', 'Low stock'], ['sold_out', 'Sold out']];
const STATUS_FILTERS = [['', 'All statuses'], ['active', 'Active'], ['draft', 'Draft'], ['archived', 'Archived']];
const COLLECTION_FILTERS = [['', 'All collections'], ['New Arrivals', 'New Arrivals'], ['Freedom of Mind', 'Freedom of Mind']];
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
      .then((body) => { setProducts(body.products); setSummary(body.summary); })
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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Products</p>
          <h1 className="display mt-1 text-3xl">Products</h1>
          <p className="mt-2 max-w-2xl text-sm text-clay">Manage catalog visibility, inventory, organization, and storefront product records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary">Import</button>
          <button type="button" className="btn-secondary">Export</button>
          <button type="button" className="btn-secondary">More actions</button>
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
              {COLLECTION_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
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
                        <img src={product.image} alt="" className="h-12 w-10 border border-line object-cover" />
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
                </tr>
              ))}
              {!products.length && <tr><td colSpan="7" className="p-6 text-center text-sm text-clay">No products match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
