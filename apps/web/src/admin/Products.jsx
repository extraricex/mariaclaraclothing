import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminJson } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';

const STOCK_FILTERS = [['', 'All stock'], ['in_stock', 'In stock'], ['low_stock', 'Low stock'], ['sold_out', 'Sold out']];
const STATUS_FILTERS = [['', 'All statuses'], ['active', 'Active'], ['draft', 'Draft'], ['archived', 'Archived']];

export default function Products() {
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('');
  const [stock, setStock] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (stock) params.set('stock', stock);
    if (query) params.set('q', query);
    adminJson(`/api/admin/products?${params}`)
      .then((body) => { setProducts(body.products); setSummary(body.summary); })
      .catch((err) => setError(err.message));
  }, [status, stock, query]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Products</p>
          <h1 className="display mt-1 text-3xl">Catalog</h1>
        </div>
        <Link to="/admin/products/new" className="btn-ink">Add product</Link>
      </div>

      {summary && (
        <div className="mt-6 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.1em]">
          <span className="border border-line bg-paper px-4 py-2">Total {summary.total}</span>
          <span className="border border-line bg-paper px-4 py-2">Active {summary.active}</span>
          <span className="border border-line bg-paper px-4 py-2">Low stock <strong className="text-accent-deep">{summary.lowStock}</strong></span>
          <span className="border border-line bg-paper px-4 py-2">Sold out <strong className="text-accent-deep">{summary.soldOut}</strong></span>
        </div>
      )}
      {error && <p className="mt-4 text-sm text-accent-deep">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <select className="field max-w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="field max-w-40" value={stock} onChange={(e) => setStock(e.target.value)}>
          {STOCK_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input className="field max-w-72" placeholder="Search products" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="mt-6 overflow-x-auto border border-line bg-paper">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-clay">
              <th className="p-3">Product</th>
              <th className="p-3">Status</th>
              <th className="p-3">Inventory</th>
              <th className="p-3">Price</th>
              <th className="p-3">Collections</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.slug} className="border-b border-line/60 hover:bg-cream/60">
                <td className="p-3">
                  <Link to={`/admin/products/${encodeURIComponent(product.slug)}`} className="flex items-center gap-3">
                    {product.image && <img src={product.image} alt="" className="h-12 w-10 object-cover" />}
                    <span className="font-semibold text-accent-deep underline">{product.name}</span>
                  </Link>
                </td>
                <td className="p-3 text-xs uppercase">{product.status}</td>
                <td className="p-3">
                  {product.inventoryQuantity}
                  {product.inventoryQuantity > 0 && product.inventoryQuantity <= 12 && <span className="ml-2 text-[10px] font-bold uppercase text-accent-deep">Low</span>}
                  {product.inventoryQuantity === 0 && <span className="ml-2 text-[10px] font-bold uppercase text-clay">Out</span>}
                </td>
                <td className="p-3">{formatMoney(product.priceCents)}</td>
                <td className="p-3 text-xs text-clay">{(product.collections || []).join(', ')}</td>
              </tr>
            ))}
            {!products.length && <tr><td colSpan="5" className="p-6 text-center text-sm text-clay">No products match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
