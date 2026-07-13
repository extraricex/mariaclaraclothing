import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminDownload, adminJson, adminSend } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';
import AdminActionMenu from './AdminActionMenu.jsx';
import AdminConfirmDialog from './AdminConfirmDialog.jsx';
import ProductImportDialog from './ProductImportDialog.jsx';
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
  const navigate = useNavigate();
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
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, hasPrevious: false, hasNext: false });
  const [importOpen, setImportOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [archiveRequest, setArchiveRequest] = useState(null);

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
    params.set('page', String(page));
    params.set('pageSize', '25');
    setError('');
    adminJson(`/api/admin/products?${params}`)
      .then((body) => {
        setProducts(body.products);
        setSummary(body.summary);
        setPagination(body.pagination || { page: 1, totalPages: 1, total: body.products.length, hasPrevious: false, hasNext: false });
        loadPancakeStatuses(body.products);
      })
      .catch((err) => setError(err.message));
  }, [status, stock, collection, category, vendor, sort, query, page]);

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
    setPage(1);
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

  function filterBody() {
    return {
      status, stock, collection, category, vendor, sort, q: query,
      selectedSlugs: [...selectedProducts]
    };
  }

  async function exportProducts() {
    setPancakeMessage('Preparing product CSV...');
    try {
      await adminDownload('/api/admin/products/export', filterBody(), `maria-clara-products-${new Date().toISOString().slice(0, 10)}.csv`);
      setPancakeMessage(`${selectedProducts.size ? `${selectedProducts.size} selected` : 'Filtered'} products exported.`);
    } catch (requestError) {
      setPancakeMessage(requestError.message);
    }
  }

  async function bulkAction(action, options = {}) {
    if (!selectedProducts.size) return;
    setActionBusy(true);
    setPancakeMessage(`Applying ${action.replaceAll('_', ' ')}...`);
    try {
      const body = await adminSend('POST', '/api/admin/products/bulk', {
        slugs: [...selectedProducts], action, ...options
      });
      setPancakeMessage(`${body.count} products updated successfully.`);
      setSelectedProducts(new Set());
      load();
    } catch (requestError) {
      setPancakeMessage(requestError.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function duplicateProduct(product) {
    setActionBusy(true);
    setPancakeMessage(`Duplicating ${product.name}...`);
    try {
      const body = await adminSend('POST', `/api/admin/products/${encodeURIComponent(product.slug)}/duplicate`, {});
      navigate(`/admin/products/${encodeURIComponent(body.product.slug)}`, {
        state: { message: `“${body.product.name}” created as a draft with zero stock and no Pancake mapping.` }
      });
    } catch (requestError) {
      setPancakeMessage(requestError.message);
      setActionBusy(false);
    }
  }

  async function updateProductStatus(product, nextStatus) {
    setActionBusy(true);
    try {
      await adminSend('PATCH', `/api/admin/products/${encodeURIComponent(product.slug)}/status`, { status: nextStatus });
      setPancakeMessage(`${product.name} updated to ${nextStatus}.`);
      load();
    } catch (requestError) {
      setPancakeMessage(requestError.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function restoreProduct(product) {
    setActionBusy(true);
    try {
      await adminSend('POST', `/api/admin/products/${encodeURIComponent(product.slug)}/restore`, {});
      setPancakeMessage(`${product.name} restored as a draft.`);
      load();
    } catch (requestError) {
      setPancakeMessage(requestError.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmArchive() {
    const request = archiveRequest;
    if (!request) return;
    setActionBusy(true);
    try {
      if (request.products.length === 1) {
        await adminJson(`/api/admin/products/${encodeURIComponent(request.products[0].slug)}`, { method: 'DELETE' });
      } else {
        await adminSend('POST', '/api/admin/products/bulk', { slugs: request.products.map((product) => product.slug), action: 'archive' });
      }
      setPancakeMessage(`${request.products.length} product${request.products.length === 1 ? '' : 's'} archived. Pancake products were not deleted.`);
      setSelectedProducts(new Set());
      setArchiveRequest(null);
      load();
    } catch (requestError) {
      setPancakeMessage(requestError.message);
    } finally {
      setActionBusy(false);
    }
  }

  function collectionAction(action) {
    const name = window.prompt(`${action === 'add_collection' ? 'Add to' : 'Remove from'} collection:`)?.trim();
    if (name) bulkAction(action, { collection: name });
  }

  function syncLabel(sync) {
    const labels = {
      syncing: 'Syncing...', synced: 'Synced', failed: 'Sync failed',
      pending_sync: 'Pending sync', missing_mapping: 'Missing mapping', blocked: 'Blocked', never_synced: 'Not synced'
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
          <button type="button" className="btn-secondary" onClick={() => setImportOpen(true)}>Import CSV</button>
          <button type="button" className="btn-secondary" disabled={actionBusy} onClick={exportProducts}>Export CSV</button>
          <AdminActionMenu
            disabled={actionBusy}
            items={[
              { label: 'Export filtered products', onSelect: exportProducts },
              { label: 'Apply oversized template', onSelect: applyOversizedTemplate }
            ]}
          />
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
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <select className="field min-w-0" value={status} onChange={(e) => { setStatus(e.target.value); setActiveView('all'); setPage(1); }}>
              {STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="field min-w-0" value={stock} onChange={(e) => { setStock(e.target.value); setActiveView('all'); setPage(1); }}>
              {STOCK_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="field min-w-0" value={collection} onChange={(e) => { setCollection(e.target.value); setPage(1); }}>
              <option value="">All collections</option>
              {collections.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <select className="field min-w-0" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
              {CATEGORY_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="field min-w-0" value={vendor} onChange={(e) => { setVendor(e.target.value); setPage(1); }}>
              {VENDOR_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="field min-w-0" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
              {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        {selectedProducts.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-cream px-3 py-2 text-sm">
            <span className="font-semibold text-accent-deep">{selectedProducts.size} selected</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" disabled={actionBusy} onClick={() => bulkAction('publish')}>Publish</button>
              <button type="button" className="btn-secondary" disabled={actionBusy} onClick={() => setArchiveRequest({ products: products.filter((product) => selectedProducts.has(product.slug)) })}>Delete / archive</button>
              <button type="button" className="btn-secondary" disabled={pancakeBusy.size > 0} onClick={syncSelectedProducts}>Sync selected to Pancake</button>
              <AdminActionMenu
                label="More actions"
                disabled={actionBusy}
                items={[
                  { label: 'Unpublish to draft', onSelect: () => bulkAction('unpublish') },
                  { label: 'Restore as draft', onSelect: () => bulkAction('restore') },
                  { label: 'Add to collection', onSelect: () => collectionAction('add_collection') },
                  { label: 'Remove from collection', onSelect: () => collectionAction('remove_collection') },
                  { label: 'Export selected', onSelect: exportProducts }
                ]}
              />
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
                <th className="p-3 text-right">Actions</th>
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
                      <span className="min-w-0 max-w-72">
                        <span className="block truncate font-semibold text-accent-deep underline" title={product.name}>{product.name}</span>
                        <span className="block text-xs text-clay">/product/{product.publicHandle || product.slug}</span>
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
                    {sync?.nextRetryAt && <time className="block text-clay" dateTime={sync.nextRetryAt}>Retry: {new Date(sync.nextRetryAt).toLocaleString()}</time>}
                    {sync?.stockMismatch === true && <span className="mt-1 block font-semibold text-amber-300">Stock mismatch warning</span>}
                    {sync?.lastErrorCode && <span className="block text-red-300">{sync.lastErrorCode.replaceAll('_', ' ')}</span>}
                    <button type="button" className="btn-ghost mt-2 !px-3 !py-1.5 text-[10px]" disabled={busy || sync?.status === 'missing_mapping'} onClick={() => syncProduct(product.slug)}>
                      {busy ? 'Syncing...' : 'Sync to Pancake POS'}
                    </button>
                  </td>
                  <td className="p-3 text-right">
                    <AdminActionMenu
                      label="Actions"
                      buttonClassName="btn-secondary !px-3 !py-1.5 text-xs"
                      disabled={actionBusy || busy}
                      items={[
                        { label: 'Edit', onSelect: () => navigate(`/admin/products/${encodeURIComponent(product.slug)}`) },
                        { label: 'Duplicate', onSelect: () => duplicateProduct(product) },
                        product.status === 'active'
                          ? { label: 'Unpublish to draft', onSelect: () => updateProductStatus(product, 'draft') }
                          : { label: 'Publish', onSelect: () => updateProductStatus(product, 'active') },
                        product.status === 'archived'
                          ? { label: 'Restore as draft', onSelect: () => restoreProduct(product) }
                          : { label: 'Archive', danger: true, onSelect: () => setArchiveRequest({ products: [product] }) },
                        { label: 'Export product', onSelect: async () => {
                          try {
                            await adminDownload('/api/admin/products/export', { selectedSlugs: [product.slug] }, `${product.slug}.csv`);
                            setPancakeMessage(`${product.name} exported.`);
                          } catch (requestError) {
                            setPancakeMessage(requestError.message);
                          }
                        } },
                        { label: 'Sync to Pancake POS', disabled: sync?.status === 'missing_mapping', onSelect: () => syncProduct(product.slug) },
                        product.status !== 'archived' && { label: 'Delete product', danger: true, onSelect: () => setArchiveRequest({ products: [product] }) }
                      ]}
                    />
                  </td>
                </tr>
                );
              })}
              {!products.length && <tr><td colSpan="9" className="p-6 text-center text-sm text-clay">No products match. Adjust the filters or add a product.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-line p-3 text-sm text-clay sm:flex-row sm:items-center sm:justify-between">
          <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} matching products</span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary !px-3 !py-1.5" disabled={!pagination.hasPrevious} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
            <button type="button" className="btn-secondary !px-3 !py-1.5" disabled={!pagination.hasNext} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </div>
      </div>
      <ProductImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={() => {
        setPancakeMessage('Product import completed. Review draft products and Pancake mappings before publishing.');
        setImportOpen(false);
        setPage(1);
        load();
      }} />
      <AdminConfirmDialog
        open={Boolean(archiveRequest)}
        title={archiveRequest?.products?.length === 1 ? `Delete ${archiveRequest.products[0].name}?` : `Delete ${archiveRequest?.products?.length || 0} products?`}
        description="Delete this product? It will be removed from the shop, but previous order records will remain available."
        warning="This archives the local product. It does not delete the connected Pancake POS product or its mapping history."
        confirmLabel="Delete / archive"
        danger
        busy={actionBusy}
        onCancel={() => setArchiveRequest(null)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
