import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminFetch, adminJson, adminSend } from '../lib/adminApi.js';
import { centsToPesoInput, pesoToCents } from '../lib/money.js';

const COLLECTIONS = ['New Arrivals', 'Freedom of Mind'];
const STATUSES = ['active', 'draft', 'archived'];
const EMPTY_PRODUCT = {
  slug: '',
  name: '',
  description: '',
  status: 'draft',
  featured: false,
  collections: [],
  priceCents: 0,
  compareAtPriceCents: null,
  images: [],
  variants: [{ size: 'One Size', sku: '', stockQuantity: 0 }]
};

export default function ProductEditor() {
  const { slug } = useParams();
  const isNew = slug === 'new';
  const navigate = useNavigate();
  const [product, setProduct] = useState(isNew ? EMPTY_PRODUCT : null);
  const [pricePeso, setPricePeso] = useState('');
  const [comparePeso, setComparePeso] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isNew) return;
    adminJson(`/api/admin/products/${encodeURIComponent(slug)}`)
      .then((body) => {
        setProduct(body.product);
        setPricePeso(centsToPesoInput(body.product.priceCents));
        setComparePeso(centsToPesoInput(body.product.compareAtPriceCents));
      })
      .catch((err) => setMessage(err.message));
  }, [slug, isNew]);

  if (!product) {
    return <p className="text-sm text-clay">{message || 'Loading product…'}</p>;
  }

  function update(field, value) {
    setProduct((previous) => ({ ...previous, [field]: value }));
  }

  function updateVariant(index, field, value) {
    setProduct((previous) => ({
      ...previous,
      variants: previous.variants.map((variant, i) => i === index ? { ...variant, [field]: value } : variant)
    }));
  }

  async function save() {
    setMessage('');
    const payload = {
      ...product,
      priceCents: pesoToCents(pricePeso) ?? 0,
      compareAtPriceCents: comparePeso.trim() === '' ? null : pesoToCents(comparePeso),
      variants: product.variants.map((variant) => ({
        ...variant,
        stockQuantity: Number(variant.stockQuantity) || 0
      }))
    };
    try {
      if (isNew) {
        const body = await adminSend('POST', '/api/admin/products', payload);
        navigate(`/admin/products/${encodeURIComponent(body.product.slug)}`, { replace: true });
      } else {
        const body = await adminSend('PUT', `/api/admin/products/${encodeURIComponent(slug)}`, payload);
        setProduct(body.product);
        setPricePeso(centsToPesoInput(body.product.priceCents));
        setComparePeso(centsToPesoInput(body.product.compareAtPriceCents));
      }
      setMessage('Changes saved successfully.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function uploadImages(files) {
    if (!files.length) return;
    const formData = new FormData();
    [...files].forEach((file) => formData.append('images', file));
    try {
      const response = await adminFetch(`/api/admin/products/${encodeURIComponent(slug)}/images`, {
        method: 'POST',
        body: formData
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Upload failed.');
      setProduct(body.product);
      setMessage('Images uploaded.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteImage(index) {
    try {
      const body = await adminJson(`/api/admin/products/${encodeURIComponent(slug)}/images/${index}`, { method: 'DELETE' });
      setProduct(body.product);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function duplicateProduct() {
    try {
      const body = await adminSend('POST', `/api/admin/products/${encodeURIComponent(slug)}/duplicate`, {});
      navigate(`/admin/products/${encodeURIComponent(body.product.slug)}`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteProduct() {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      await adminJson(`/api/admin/products/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      navigate('/admin/products');
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div className="max-w-4xl">
      <Link to="/admin/products" className="text-xs uppercase tracking-[0.12em] text-clay hover:text-accent">← Products</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-3xl">{isNew ? 'New product' : product.name}</h1>
        <div className="flex gap-2">
          {!isNew && <button type="button" className="btn-ghost" onClick={duplicateProduct}>Duplicate</button>}
          {!isNew && <button type="button" className="btn-ghost !border-accent-deep !text-accent-deep" onClick={deleteProduct}>Delete</button>}
          <button type="button" className="btn-ink" onClick={save}>Save</button>
        </div>
      </div>
      {message && <p className="mt-3 text-sm text-accent-deep" role="status">{message}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <section className="border border-line bg-paper p-6">
            <label className="block">
              <span className="eyebrow">Name</span>
              <input className="field mt-1" value={product.name} onChange={(e) => update('name', e.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Description</span>
              <textarea className="field mt-1" rows="5" value={product.description} onChange={(e) => update('description', e.target.value)} />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <label className="block">
                <span className="eyebrow">Price (₱)</span>
                <input className="field mt-1" name="pricePeso" inputMode="decimal" value={pricePeso} onChange={(e) => setPricePeso(e.target.value)} />
              </label>
              <label className="block">
                <span className="eyebrow">Compare-at (₱)</span>
                <input className="field mt-1" name="comparePeso" inputMode="decimal" value={comparePeso} onChange={(e) => setComparePeso(e.target.value)} placeholder="Optional" />
              </label>
            </div>
          </section>

          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Variants</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.12em] text-clay">
                  <th className="py-2 pr-3">Size</th><th className="py-2 pr-3">SKU</th><th className="py-2">Stock</th><th></th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((variant, index) => (
                  <tr key={index} className="border-t border-line/60">
                    <td className="py-2 pr-3"><input className="field !px-2 !py-1.5" value={variant.size} onChange={(e) => updateVariant(index, 'size', e.target.value)} /></td>
                    <td className="py-2 pr-3"><input className="field !px-2 !py-1.5" value={variant.sku || ''} onChange={(e) => updateVariant(index, 'sku', e.target.value)} /></td>
                    <td className="py-2"><input className="field !px-2 !py-1.5" type="number" min="0" value={variant.stockQuantity} onChange={(e) => updateVariant(index, 'stockQuantity', e.target.value)} /></td>
                    <td className="py-2 pl-2">
                      <button
                        type="button"
                        className="text-xs text-clay underline hover:text-accent"
                        onClick={() => update('variants', product.variants.filter((_, i) => i !== index))}
                        disabled={product.variants.length === 1}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="btn-ghost mt-4 !px-4 !py-2 text-xs"
              onClick={() => update('variants', [...product.variants, { size: '', sku: '', stockQuantity: 0 }])}
            >
              Add variant
            </button>
          </section>

          {!isNew && (
            <section className="border border-line bg-paper p-6">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Images</h2>
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {product.images.map((image, index) => (
                  <figure key={index} className="relative">
                    <img src={image.url} alt={image.altText || ''} className="aspect-[4/5] w-full object-cover" />
                    <button
                      type="button"
                      className="absolute right-1 top-1 bg-ink/80 px-2 py-0.5 text-[10px] font-bold uppercase text-paper hover:bg-accent"
                      onClick={() => deleteImage(index)}
                      disabled={product.images.length === 1}
                    >
                      ✕
                    </button>
                  </figure>
                ))}
              </div>
              <label className="btn-ghost mt-4 cursor-pointer !px-4 !py-2 text-xs">
                Upload images
                <input type="file" accept="image/*" multiple hidden onChange={(e) => uploadImages(e.target.files)} />
              </label>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="border border-line bg-paper p-6">
            <label className="block">
              <span className="eyebrow">Status</span>
              <select className="field mt-1" value={product.status} onChange={(e) => update('status', e.target.value)}>
                {STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(product.featured)} onChange={(e) => update('featured', e.target.checked)} />
              Featured product
            </label>
          </section>
          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Collections</h2>
            {COLLECTIONS.map((collection) => (
              <label key={collection} className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={(product.collections || []).includes(collection)}
                  onChange={(e) => update(
                    'collections',
                    e.target.checked
                      ? [...(product.collections || []), collection]
                      : (product.collections || []).filter((item) => item !== collection)
                  )}
                />
                {collection}
              </label>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
