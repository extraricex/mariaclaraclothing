import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminJson, adminSend } from '../lib/adminApi.js';

const STOREFRONT_COLLECTIONS = ['New Arrivals', 'Freedom of Mind'];

function inCollection(product, collectionName) {
  return (product.collections || []).includes(collectionName);
}

export default function Collections() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [active, setActive] = useState(STOREFRONT_COLLECTIONS[0]);
  const [status, setStatus] = useState('');

  function load() {
    adminJson('/api/admin/products?sort=name_asc')
      .then((body) => setProducts(body.products))
      .catch((err) => setStatus(err.message));
  }

  useEffect(load, []);

  async function saveCollections(slug, change) {
    setStatus('Saving collection...');
    try {
      const { product } = await adminJson(`/api/admin/products/${encodeURIComponent(slug)}`);
      const current = Array.isArray(product.collections) ? product.collections : [];
      const next = [...new Set(change(current))].map((name) => String(name || '').trim()).filter(Boolean);
      await adminSend('PUT', `/api/admin/products/${encodeURIComponent(slug)}`, { ...product, collections: next });
      setStatus('Collection updated.');
      load();
    } catch (error) {
      setStatus(error.message);
    }
  }

  const members = products
    .filter((product) => inCollection(product, active))
    .sort((a, b) => a.name.localeCompare(b.name));
  const available = products
    .filter((product) => !inCollection(product, active))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-4xl">
      <p className="eyebrow">Collections</p>
      <h1 className="display mt-1 text-3xl">Storefront collections</h1>
      <p className="mt-2 text-sm text-ink-soft">
        These two collections power the homepage sections. Adding or removing a product here
        updates the storefront immediately.
      </p>
      {status && <p className="mt-3 text-sm text-accent-deep" role="status">{status}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        {STOREFRONT_COLLECTIONS.map((name) => {
          const count = products.filter((product) => inCollection(product, name)).length;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setActive(name)}
              className={`border px-4 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                name === active ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'
              }`}
            >
              {name} <span className={name === active ? 'text-accent' : 'text-clay'}>({count})</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <select
          className="field max-w-md"
          value=""
          disabled={!available.length}
          onChange={(e) => e.target.value && saveCollections(e.target.value, (collections) => [...collections, active])}
        >
          <option value="">{available.length ? `Add product to ${active}…` : 'All products are in this collection'}</option>
          {available.map((product) => (
            <option key={product.slug} value={product.slug}>{product.name}</option>
          ))}
        </select>
      </div>

      <div className="mt-5 space-y-2">
        {members.map((product) => (
          <article key={product.slug} className="flex items-center gap-4 border border-line bg-paper p-3">
            <img src={product.image || '/brand/logo.png'} alt="" className="h-14 w-11 object-cover" />
            <div className="flex-1">
              <strong className="block text-sm">{product.name}</strong>
              <span className="text-xs text-clay">{product.status || 'active'} · {Number(product.inventoryQuantity || 0)} in stock</span>
            </div>
            <button
              type="button"
              className="btn-ghost !px-4 !py-2 text-xs"
              onClick={() => navigate(`/admin/products/${encodeURIComponent(product.slug)}`)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn-ghost !border-accent-deep !px-4 !py-2 text-xs !text-accent-deep"
              onClick={() => saveCollections(product.slug, (collections) => collections.filter((name) => name !== active))}
            >
              Remove
            </button>
          </article>
        ))}
        {!members.length && (
          <div className="border border-line bg-paper p-8 text-center">
            <h2 className="text-sm font-semibold">No products in {active}</h2>
            <p className="mt-1 text-sm text-clay">Add products with the selector above to show them on the customer homepage.</p>
          </div>
        )}
      </div>
    </div>
  );
}
