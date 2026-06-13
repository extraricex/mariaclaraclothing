import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminJson } from '../lib/adminApi.js';

const STOCK_FILTERS = [['', 'All stock'], ['in_stock', 'In stock'], ['low_stock', 'Low stock'], ['sold_out', 'Sold out']];

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (stock) params.set('stock', stock);
    if (query) params.set('q', query);
    params.set('sort', 'inventory_asc');
    adminJson(`/api/admin/products?${params}`)
      .then((body) => setProducts(body.products || []))
      .catch((error) => setMessage(error.message));
  }, [stock, query]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => ({
    products: products.length,
    available: products.reduce((sum, product) => sum + Number(product.inventoryQuantity || 0), 0),
    lowStock: products.filter((product) => product.stockStatus === 'low_stock').length,
    soldOut: products.filter((product) => product.stockStatus === 'sold_out').length
  }), [products]);

  return (
    <div>
      <div>
        <p className="eyebrow">Products / Inventory</p>
        <h1 className="display mt-1 text-3xl">Inventory</h1>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Metric label="Products" value={totals.products} />
        <Metric label="Available stock" value={totals.available} />
        <Metric label="Low stock" value={totals.lowStock} />
        <Metric label="Sold out" value={totals.soldOut} />
      </div>

      {message && <p className="mt-4 text-sm text-accent-deep">{message}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <select className="field max-w-44" value={stock} onChange={(event) => setStock(event.target.value)}>
          {STOCK_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input className="field max-w-72" placeholder="Search product or SKU" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>

      <div className="mt-6 overflow-x-auto border border-line bg-paper">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-clay">
              <th className="p-3">Product</th>
              <th className="p-3">Stock status</th>
              <th className="p-3">Total stock</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.slug} className="border-b border-line/60 hover:bg-cream/60">
                <td className="p-3">
                  <p className="font-semibold">{product.name}</p>
                  <p className="text-xs text-clay">{product.vendor} · {product.category}</p>
                </td>
                <td className="p-3 text-xs uppercase">{product.stockStatus?.replace('_', ' ')}</td>
                <td className="p-3">{product.inventoryQuantity}</td>
                <td className="p-3">
                  <Link to={`/admin/products/${encodeURIComponent(product.slug)}`} className="text-xs font-semibold uppercase tracking-[0.1em] text-accent underline">
                    Edit stock
                  </Link>
                </td>
              </tr>
            ))}
            {!products.length && <tr><td colSpan="4" className="p-6 text-center text-sm text-clay">No inventory records match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="border border-line bg-paper p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-clay">{label}</p>
      <p className="mt-2 text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}
