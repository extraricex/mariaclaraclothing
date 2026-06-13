import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminFetch, adminJson, adminSend } from '../lib/adminApi.js';
import {
  DESCRIPTION_COLORS,
  DESCRIPTION_FONT_SIZES,
  DESCRIPTION_FONT_STYLES,
  DESCRIPTION_FONT_WEIGHTS,
  richStyleForCommand
} from './descriptionEditor.js';
import { sanitizeRichHtml } from '../lib/richText.js';
import { centsToPesoInput, pesoToCents } from '../lib/money.js';

const COLLECTIONS = ['New Arrivals', 'Freedom of Mind'];
const STATUSES = ['active', 'draft', 'archived'];
const DESCRIPTION_TOOLS = [
  ['paragraph', 'Paragraph'],
  ['heading', 'Heading'],
  ['bold', 'Bold'],
  ['italic', 'Italic'],
  ['underline', 'Underline'],
  ['bullet', 'Bullet list'],
  ['numbered', 'Numbered list'],
  ['link', 'Link']
];
const EMPTY_PRODUCT = {
  slug: '',
  name: '',
  description: '',
  category: 'T-Shirts',
  productType: 'Tshirt',
  vendor: 'Maria Clara',
  tags: [],
  themeTemplate: 'Default product',
  status: 'draft',
  featured: false,
  collections: [],
  priceCents: 0,
  compareAtPriceCents: null,
  images: [],
  variants: [{ size: 's', sku: '', priceCents: null, stockQuantity: 0 }]
};

export default function ProductEditor() {
  const { slug } = useParams();
  const isNew = slug === 'new';
  const navigate = useNavigate();
  const [product, setProduct] = useState(isNew ? EMPTY_PRODUCT : null);
  const [pricePeso, setPricePeso] = useState('');
  const [comparePeso, setComparePeso] = useState('');
  const [message, setMessage] = useState('');
  const descriptionEditorRef = useRef(null);

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

  useEffect(() => {
    if (!product || !descriptionEditorRef.current) return;
    descriptionEditorRef.current.innerHTML = sanitizeRichHtml(product.description || '');
  }, [product?.slug]);

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

  function tagsText() {
    return (product.tags || []).join(', ');
  }

  function variantPricePeso(variant) {
    return variant.priceCents === null || variant.priceCents === undefined
      ? pricePeso
      : centsToPesoInput(variant.priceCents);
  }

  const totalInventory = (product.variants || []).reduce((sum, variant) => sum + Number(variant.stockQuantity || 0), 0);
  const statusLabel = product.status ? product.status[0].toUpperCase() + product.status.slice(1) : 'Draft';
  const imageCount = product.images?.length || 0;

  function syncDescriptionFromEditor() {
    const html = sanitizeRichHtml(descriptionEditorRef.current?.innerHTML || '');
    update('description', html);
  }

  function selectionIsInsideDescription() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !descriptionEditorRef.current) return false;
    return descriptionEditorRef.current.contains(selection.getRangeAt(0).commonAncestorContainer);
  }

  function wrapSelectedDescription(style) {
    const editor = descriptionEditorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !selection.rangeCount || !selectionIsInsideDescription()) return false;
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    Object.entries(style).forEach(([property, value]) => {
      span.style[property] = value;
    });
    if (range.collapsed) {
      span.textContent = 'Styled text';
      range.insertNode(span);
      range.selectNodeContents(span);
    } else {
      try {
        range.surroundContents(span);
        range.selectNodeContents(span);
      } catch {
        const fragment = range.extractContents();
        span.appendChild(fragment);
        range.insertNode(span);
        range.selectNodeContents(span);
      }
    }
    selection.removeAllRanges();
    selection.addRange(range);
    syncDescriptionFromEditor();
    return true;
  }

  function applyRichDescriptionStyle(command, value = '') {
    descriptionEditorRef.current?.focus();
    const style = richStyleForCommand(command, value);
    if (Object.keys(style).length) {
      wrapSelectedDescription(style);
    }
  }

  function formatDescription(command) {
    descriptionEditorRef.current?.focus();
    if (command === 'bold') {
      applyRichDescriptionStyle('font-weight', '700');
    } else if (command === 'italic') {
      applyRichDescriptionStyle('italic');
    } else if (command === 'underline') {
      applyRichDescriptionStyle('underline');
    } else if (command === 'paragraph') {
      document.execCommand('formatBlock', false, 'p');
    } else if (command === 'heading') {
      applyRichDescriptionStyle('font-size', '28px');
      applyRichDescriptionStyle('font-weight', '700');
    } else if (command === 'bullet') {
      document.execCommand('insertUnorderedList');
    } else if (command === 'numbered') {
      document.execCommand('insertOrderedList');
    } else if (command === 'link') {
      const href = window.prompt('Enter link URL', 'https://');
      if (href) document.execCommand('createLink', false, href);
    }
    syncDescriptionFromEditor();
  }

  async function save() {
    setMessage('');
    const payload = {
      ...product,
      description: sanitizeRichHtml(descriptionEditorRef.current?.innerHTML || product.description || ''),
      priceCents: pesoToCents(pricePeso) ?? 0,
      compareAtPriceCents: comparePeso.trim() === '' ? null : pesoToCents(comparePeso),
      variants: product.variants.map((variant) => ({
        ...variant,
        priceCents: pesoToCents(variantPricePeso(variant)),
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
    if (isNew) {
      setMessage('Save the product before uploading photos.');
      return;
    }
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
    if (imageCount <= 1) {
      setMessage('Product must keep at least one photo.');
      return;
    }
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
    <div className="product-editor-shell">
      <Link to="/admin/products" className="text-xs font-semibold uppercase tracking-[0.12em] text-clay hover:text-accent">Products</Link>
      <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display min-w-0 text-2xl sm:text-3xl">{isNew ? 'New product' : product.name}</h1>
            <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold uppercase text-emerald-800">{statusLabel}</span>
          </div>
          <p className="mt-2 text-sm text-clay">Edit storefront product details, photos, publishing, pricing, inventory, and organization.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isNew && <button type="button" className="btn-ghost !px-4 !py-2.5 text-xs" onClick={duplicateProduct}>Duplicate</button>}
          {!isNew && <Link to={`/product/${encodeURIComponent(product.slug)}`} className="btn-ghost !px-4 !py-2.5 text-xs">View</Link>}
          {!isNew && <button type="button" className="btn-ghost !px-4 !py-2.5 text-xs !border-accent-deep !text-accent-deep" onClick={deleteProduct}>Delete</button>}
          <button type="button" className="btn-ink !px-5 !py-2.5 text-xs" onClick={save}>Save</button>
        </div>
      </div>
      {message && <p className="mt-3 text-sm text-accent-deep" role="status">{message}</p>}

      <div className="product-editor-grid mt-6">
        <div className="space-y-4">
          <section className="border border-line bg-paper p-6">
            <label className="block">
              <span className="eyebrow">Title</span>
              <input className="field mt-1" value={product.name} onChange={(e) => update('name', e.target.value)} />
            </label>
            <div className="mt-5">
              <span className="eyebrow">Description</span>
              <div className="description-toolbar mt-2 flex flex-wrap items-center gap-2 border border-line bg-cream p-2" aria-label="Description toolbar">
                {DESCRIPTION_TOOLS.map(([command, label]) => (
                  <button
                    key={command}
                    type="button"
                    className="border border-line bg-white px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-ink hover:text-accent"
                    onClick={() => formatDescription(command)}
                  >
                    {label}
                  </button>
                ))}
                <label className="text-xs font-semibold text-clay">
                  Font style
                  <select className="field mt-1 !px-2 !py-1.5 text-xs" onChange={(e) => applyRichDescriptionStyle(e.target.value)}>
                    {DESCRIPTION_FONT_STYLES.map((option) => <option key={option.command} value={option.command}>{option.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-clay">
                  Font size
                  <select className="field mt-1 !px-2 !py-1.5 text-xs" onChange={(e) => applyRichDescriptionStyle('font-size', e.target.value)}>
                    {DESCRIPTION_FONT_SIZES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-clay">
                  Font color
                  <select className="field mt-1 !px-2 !py-1.5 text-xs" onChange={(e) => applyRichDescriptionStyle('font-color', e.target.value)}>
                    {DESCRIPTION_COLORS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-clay">
                  Font weight
                  <select className="field mt-1 !px-2 !py-1.5 text-xs" onChange={(e) => applyRichDescriptionStyle('font-weight', e.target.value)}>
                    {DESCRIPTION_FONT_WEIGHTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
              <div
                ref={descriptionEditorRef}
                contentEditable
                suppressContentEditableWarning
                className="rich-description-editor min-h-64 rounded-b-[var(--radius-admin)] border border-t-0 border-line bg-white px-4 py-4 text-sm leading-7 text-ink outline-none focus:border-ink"
                aria-label="Product rich description editor"
                onInput={syncDescriptionFromEditor}
                onBlur={syncDescriptionFromEditor}
              />
            </div>
          </section>

          <section className="border border-line bg-paper p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Media</h2>
                <p className="mt-1 text-xs text-clay">Add photos and remove old product images. One photo is required.</p>
              </div>
              <label className={`btn-ghost cursor-pointer !px-4 !py-2 text-xs ${isNew ? 'pointer-events-none opacity-50' : ''}`}>
                Add photos
                <input type="file" accept="image/*" multiple hidden disabled={isNew} onChange={(e) => uploadImages(e.target.files)} />
              </label>
            </div>
            {isNew && <p className="mt-3 text-xs text-clay">Save this product before adding photos.</p>}
            {!isNew && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {product.images.map((image, index) => (
                  <figure key={index} className="group relative overflow-hidden border border-line bg-cream">
                    <img src={image.url} alt={image.altText || ''} className="aspect-[4/5] w-full object-cover" />
                    <figcaption className="flex items-center justify-between gap-2 border-t border-line bg-white px-2 py-2 text-[11px] text-clay">
                      <span>Photo {index + 1}</span>
                      <button
                        type="button"
                        className="font-bold uppercase text-accent-deep underline disabled:cursor-not-allowed disabled:text-clay disabled:no-underline"
                        onClick={() => deleteImage(index)}
                        disabled={imageCount <= 1}
                        title={imageCount <= 1 ? 'Product must keep at least one photo' : 'Remove photo'}
                      >
                        Remove photo
                      </button>
                    </figcaption>
                  </figure>
                ))}
                <label className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center border border-dashed border-line bg-cream text-center text-sm font-semibold text-clay hover:border-ink hover:text-ink">
                  <span className="text-3xl leading-none">+</span>
                  Add photos
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => uploadImages(e.target.files)} />
                </label>
              </div>
            )}
          </section>

          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Pricing</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Variants</h2>
              <p className="text-sm font-semibold text-ink">Total inventory: {totalInventory} available</p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.12em] text-clay">
                    <th className="py-2 pr-3">Size</th><th className="py-2 pr-3">SKU</th><th className="py-2 pr-3">Variant price</th><th className="py-2">Stock</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((variant, index) => (
                    <tr key={index} className="border-t border-line/60">
                      <td className="py-2 pr-3"><input className="field !px-2 !py-1.5" value={variant.size} onChange={(e) => updateVariant(index, 'size', e.target.value)} /></td>
                      <td className="py-2 pr-3"><input className="field !px-2 !py-1.5" value={variant.sku || ''} onChange={(e) => updateVariant(index, 'sku', e.target.value)} /></td>
                      <td className="py-2 pr-3"><input className="field !px-2 !py-1.5" inputMode="decimal" value={variantPricePeso(variant)} onChange={(e) => updateVariant(index, 'priceCents', pesoToCents(e.target.value) ?? 0)} /></td>
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
            </div>
            <button
              type="button"
              className="btn-ghost mt-4 !px-4 !py-2 text-xs"
              onClick={() => update('variants', [...product.variants, { size: 's', sku: '', priceCents: null, stockQuantity: 0 }])}
            >
              Add variant
            </button>
          </section>
        </div>

        <div className="space-y-4">
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
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Publishing</h2>
            <div className="mt-4 space-y-3 text-sm">
              <label className="flex items-center justify-between gap-3">
                <span>Online Store</span>
                <input type="checkbox" checked={product.status === 'active'} onChange={(e) => update('status', e.target.checked ? 'active' : 'draft')} />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Shop catalog</span>
                <input type="checkbox" checked={Boolean(product.featured)} onChange={(e) => update('featured', e.target.checked)} />
              </label>
            </div>
          </section>

          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Sales past 90 days</h2>
            <ul className="mt-3 space-y-2 text-sm text-clay">
              <li><strong className="text-ink">0</strong> units sold</li>
              <li><strong className="text-ink">0</strong> buyers</li>
              <li><strong className="text-ink">₱0.00</strong> net sales</li>
            </ul>
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
          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Product organization</h2>
            <label className="mt-4 block">
              <span className="eyebrow">Category</span>
              <input className="field mt-1" value={product.category || ''} onChange={(e) => update('category', e.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Product type</span>
              <input className="field mt-1" value={product.productType || ''} onChange={(e) => update('productType', e.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Vendor</span>
              <input className="field mt-1" value={product.vendor || ''} onChange={(e) => update('vendor', e.target.value)} />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Tags</span>
              <input
                className="field mt-1"
                value={tagsText()}
                onChange={(e) => update('tags', e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))}
                placeholder="black, cotton, oversized"
              />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Theme template</span>
              <input className="field mt-1" value={product.themeTemplate || ''} onChange={(e) => update('themeTemplate', e.target.value)} />
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}
