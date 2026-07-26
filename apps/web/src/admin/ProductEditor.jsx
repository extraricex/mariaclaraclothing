import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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
import {
  buildNewProductBody,
  moveQueuedProductImage,
  PRODUCT_IMAGE_ACCEPT,
  reorderQueuedProductImages,
  validateNewProduct,
  validateQueuedProductFiles
} from './newProductMedia.js';
import CollectionDropdown from './CollectionDropdown.jsx';
import QueuedProductMedia from './QueuedProductMedia.jsx';
import { productPath } from '../lib/productUrl.js';
import AdminConfirmDialog from './AdminConfirmDialog.jsx';
import SeoSearchPreview from './SeoSearchPreview.jsx';
import { productSeoAnalysis } from '../lib/seoAdmin.js';
import Stars from '../components/Stars.jsx';

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
  publicHandle: '',
  urlAliases: [],
  name: '',
  description: '',
  category: 'T-Shirts',
  productType: 'Tshirt',
  vendor: 'Maria Clara',
  tags: [],
  themeTemplate: 'Default product',
  status: 'active',
  featured: false,
  seo: {
    title: '',
    description: '',
    handle: '',
    mainKeyword: '',
    secondaryKeywords: [],
    imageAltText: '',
    canonicalUrl: '',
    indexable: true,
    ogTitle: '',
    ogDescription: '',
    ogImageUrl: '',
    feedTitle: '',
    marketplaceTitle: ''
  },
  metafields: { color: [], material: [], fit: [], fabricWeight: [], modelHeight: [], modelWearsSize: [] },
  reviewSettings: { reviewsEnabled: true, showRatingSummary: true },
  ratingSummary: {
    averageRating: 0,
    ratingCount: 0,
    publishedRatedReviews: 0,
    pendingReviews: 0,
    hiddenReviews: 0,
    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    hasRatings: false,
    lastRecalculatedAt: ''
  },
  commerceStats: {
    showStockStatus: null,
    lowStockThreshold: null,
    showExactRemainingStock: null,
    showSoldCount: null,
    historicalSoldQuantity: 0,
    historicalSoldSource: '',
    historicalSoldNote: '',
    historicalSoldUpdatedBy: '',
    historicalSoldUpdatedAt: ''
  },
  collections: [],
  priceCents: 0,
  parcelWeightGrams: 250,
  compareAtPriceCents: null,
  images: [],
  variants: [{ size: 's', sku: '', priceCents: null, stockQuantity: 0 }],
  productPage: {
    detailsText: '',
    shippingText: '',
    cardContent: {
      text: '',
      rating: null,
      source: '',
      showText: false,
      showRating: false,
      showSource: false
    },
    sections: [
      {
        title: 'Product details',
        items: ['Comfortable fit', 'Easy to style', 'Ready for everyday wear']
      }
    ],
    sizeChart: []
  }
};
const SIZE_CHART_FIELDS = ['size', 'width', 'length', 'sleeveLength', 'shoulderDropLength'];

export default function ProductEditor() {
  const { slug } = useParams();
  const isNew = slug === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const [product, setProduct] = useState(isNew ? EMPTY_PRODUCT : null);
  const [pricePeso, setPricePeso] = useState('');
  const [comparePeso, setComparePeso] = useState('');
  const [message, setMessage] = useState('');
  const [queuedImages, setQueuedImages] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pancakeSync, setPancakeSync] = useState(null);
  const [pancakeSyncBusy, setPancakeSyncBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [serverSeoWarnings, setServerSeoWarnings] = useState([]);
  const descriptionEditorRef = useRef(null);
  const queuedImagesRef = useRef([]);

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
    if (location.state?.message) {
      setMessage(location.state.message);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    if (isNew || !slug) return;
    adminJson(`/api/admin/integrations/pancake/products/status?slugs=${encodeURIComponent(slug)}`)
      .then((body) => setPancakeSync(body.products?.[0] || null))
      .catch((error) => setMessage(error.message));
  }, [slug, isNew]);

  useEffect(() => {
    if (isNew || !slug) return;
    adminJson('/api/admin/seo')
      .then((body) => {
        const row = (body.products || []).find((candidate) => candidate.slug === slug || candidate.handle === slug);
        setServerSeoWarnings(Array.isArray(row?.warnings) ? row.warnings : []);
      })
      .catch(() => setServerSeoWarnings([]));
  }, [isNew, slug]);

  useEffect(() => {
    if (!product || !descriptionEditorRef.current) return;
    descriptionEditorRef.current.innerHTML = sanitizeRichHtml(product.description || '');
  }, [product?.slug]);

  useEffect(() => {
    queuedImagesRef.current = queuedImages;
  }, [queuedImages]);

  useEffect(() => () => {
    queuedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }, []);

  if (!product) {
    return <p className="text-sm text-clay">{message || 'Loading product…'}</p>;
  }

  function update(field, value) {
    setProduct((previous) => ({ ...previous, [field]: value }));
  }

  function updateSeo(field, value) {
    setProduct((previous) => ({
      ...previous,
      seo: { ...(previous.seo || {}), [field]: value }
    }));
  }

  function clearFieldError(field) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateVariant(index, field, value) {
    setProduct((previous) => ({
      ...previous,
      variants: previous.variants.map((variant, i) => i === index ? { ...variant, [field]: value } : variant)
    }));
    if (field === 'stockQuantity') clearFieldError('inventory');
  }

  function updateProductPage(field, value) {
    setProduct((previous) => ({
      ...previous,
      productPage: {
        ...(previous.productPage || {}),
        [field]: value
      }
    }));
  }

  function updateProductCardContent(field, value) {
    setProduct((previous) => ({
      ...previous,
      productPage: {
        ...(previous.productPage || {}),
        cardContent: {
          ...(previous.productPage?.cardContent || {}),
          [field]: value,
          ...(field === 'showRating' && value ? { showSource: true } : {})
        }
      }
    }));
  }

  function updateCommerceStats(field, value) {
    setProduct((previous) => ({
      ...previous,
      commerceStats: {
        ...(previous.commerceStats || {}),
        [field]: value
      }
    }));
  }

  function metafieldText(field) {
    const value = product.metafields?.[field];
    return Array.isArray(value) ? value.join(', ') : String(value || '');
  }

  function updateMetafield(field, value) {
    setProduct((previous) => ({
      ...previous,
      metafields: {
        ...(previous.metafields || {}),
        [field]: String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
      }
    }));
  }

  function updateImage(index, changes) {
    setProduct((previous) => ({
      ...previous,
      images: previous.images.map((image, imageIndex) => imageIndex === index ? { ...image, ...changes } : image)
    }));
  }

  function updateSizeChartRow(index, field, value) {
    setProduct((previous) => {
      const previousProductPage = previous.productPage || {};
      const previousRows = Array.isArray(previousProductPage.sizeChart) ? previousProductPage.sizeChart : [];
      return {
        ...previous,
        productPage: {
          ...previousProductPage,
          sizeChart: previousRows.map((row, i) => i === index ? { ...row, [field]: value } : row)
        }
      };
    });
  }

  function addSizeChartRow() {
    setProduct((previous) => {
      const previousProductPage = previous.productPage || {};
      const previousRows = Array.isArray(previousProductPage.sizeChart) ? previousProductPage.sizeChart : [];
      return {
        ...previous,
        productPage: {
          ...previousProductPage,
          sizeChart: [
            ...previousRows,
            { size: '', width: '', length: '', sleeveLength: '', shoulderDropLength: '' }
          ]
        }
      };
    });
  }

  function removeSizeChartRow(index) {
    setProduct((previous) => {
      const previousProductPage = previous.productPage || {};
      const previousRows = Array.isArray(previousProductPage.sizeChart) ? previousProductPage.sizeChart : [];
      return {
        ...previous,
        productPage: {
          ...previousProductPage,
          sizeChart: previousRows.filter((_, i) => i !== index)
        }
      };
    });
  }

  function sizeChartRowHasValue(row) {
    return SIZE_CHART_FIELDS.some((field) => String(row?.[field] || '').trim() !== '');
  }

  function sizeChartRowIsComplete(row) {
    return SIZE_CHART_FIELDS.every((field) => String(row?.[field] || '').trim() !== '');
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
  const productPage = product.productPage || {};
  const productCardContent = productPage.cardContent || {
    text: '',
    rating: null,
    source: '',
    showText: false,
    showRating: false,
    showSource: false
  };
  const sizeChartRows = Array.isArray(productPage.sizeChart) ? productPage.sizeChart : [];
  const seoAnalysis = productSeoAnalysis(product);
  const seoWarnings = [...new Set([...seoAnalysis.warnings, ...serverSeoWarnings])];

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

  function queueNewProductImages(files) {
    try {
      const accepted = validateQueuedProductFiles(queuedImages.map((image) => image.file), [...files]);
      const existingCount = queuedImages.length;
      setQueuedImages([
        ...queuedImages,
        ...accepted.slice(existingCount).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))
      ]);
      clearFieldError('media');
      setMessage('');
    } catch (error) {
      setMessage(error.message);
    }
  }

  function removeQueuedImage(index) {
    setQueuedImages((current) => current.filter((image, imageIndex) => {
      if (imageIndex === index) URL.revokeObjectURL(image.previewUrl);
      return imageIndex !== index;
    }));
  }

  async function save() {
    setMessage('');
    let savedPancakeStatus = '';
    const partialSizeChartRow = sizeChartRows.some((row) => sizeChartRowHasValue(row) && !sizeChartRowIsComplete(row));
    if (partialSizeChartRow) {
      setMessage('Complete every size chart field before saving, or remove the incomplete row.');
      return;
    }
    const priceCents = pesoToCents(pricePeso);
    if (isNew) {
      const errors = validateNewProduct({
        product,
        priceCents,
        files: queuedImages.map((image) => image.file)
      });
      setFieldErrors(errors);
      if (Object.keys(errors).length) {
        setMessage(Object.values(errors)[0]);
        return;
      }
    }
    const completeSizeChartRows = sizeChartRows
      .filter(sizeChartRowIsComplete)
      .map((row) => ({
        size: String(row.size || '').trim(),
        width: String(row.width || '').trim(),
        length: String(row.length || '').trim(),
        sleeveLength: String(row.sleeveLength || '').trim(),
        shoulderDropLength: String(row.shoulderDropLength || '').trim()
      }));
    const payload = {
      ...product,
      description: sanitizeRichHtml(descriptionEditorRef.current?.innerHTML || product.description || ''),
      priceCents: priceCents ?? 0,
      compareAtPriceCents: comparePeso.trim() === '' ? null : pesoToCents(comparePeso),
      productPage: {
        ...(product.productPage || {}),
        sizeChart: completeSizeChartRows
      },
      variants: product.variants.map((variant) => ({
        ...variant,
        priceCents: pesoToCents(variantPricePeso(variant)),
        stockQuantity: Number(variant.stockQuantity) || 0
      }))
    };
    setActionBusy(true);
    try {
      if (isNew) {
        const body = await adminJson('/api/admin/products', {
          method: 'POST',
          body: buildNewProductBody(payload, queuedImages.map((image) => image.file))
        });
        queuedImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
        navigate(`/admin/products/${encodeURIComponent(body.product.slug)}`, { replace: true, state: { message: 'Product created successfully.' } });
      } else {
        const body = await adminSend('PUT', `/api/admin/products/${encodeURIComponent(slug)}`, payload);
        setProduct(body.product);
        if (body.pancakeSync) {
          setPancakeSync(body.pancakeSync);
          savedPancakeStatus = body.pancakeSync.status;
        }
        setPricePeso(centsToPesoInput(body.product.priceCents));
        setComparePeso(centsToPesoInput(body.product.compareAtPriceCents));
      }
      setMessage(['failed', 'blocked', 'missing_mapping'].includes(savedPancakeStatus) ? 'Changes saved locally. Pancake sync is pending automatic retry; resolve any mapping warning shown below.' : 'Changes saved successfully.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setActionBusy(false);
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
    setActionBusy(true);
    setMessage('Creating an independent draft copy...');
    try {
      const body = await adminSend('POST', `/api/admin/products/${encodeURIComponent(slug)}/duplicate`, {});
      navigate(`/admin/products/${encodeURIComponent(body.product.slug)}`, {
        state: { message: 'Product duplicated as a draft with zero stock and missing Pancake mapping.' }
      });
    } catch (error) {
      setMessage(error.message);
      setActionBusy(false);
    }
  }

  async function deleteProduct() {
    setActionBusy(true);
    try {
      await adminJson(`/api/admin/products/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      navigate('/admin/products', { state: { message: `${product.name} archived.` } });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setArchiveOpen(false);
      setActionBusy(false);
    }
  }

  async function restoreProduct() {
    setActionBusy(true);
    try {
      const body = await adminSend('POST', `/api/admin/products/${encodeURIComponent(slug)}/restore`, {});
      setProduct(body.product);
      setMessage('Product restored as a draft. Review inventory and mapping before publishing.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function manualPancakeSync() {
    setPancakeSyncBusy(true);
    setMessage('Syncing product to Pancake POS...');
    setPancakeSync((current) => ({ ...(current || {}), status: 'syncing' }));
    try {
      const body = await adminJson(`/api/admin/integrations/pancake/products/${encodeURIComponent(slug)}/sync`, { method: 'POST' });
      setPancakeSync(body.sync);
      setMessage('Product synced successfully to Pancake POS.');
    } catch (error) {
      if (error.body?.sync) setPancakeSync(error.body.sync);
      setMessage(error.message);
    } finally {
      setPancakeSyncBusy(false);
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
          {!isNew && <button type="button" className="btn-ghost !px-4 !py-2.5 text-xs" disabled={actionBusy} onClick={duplicateProduct}>{actionBusy ? 'Working...' : 'Duplicate'}</button>}
          {!isNew && <Link to={productPath(product)} className="btn-ghost !px-4 !py-2.5 text-xs">View</Link>}
          {!isNew && <button type="button" className="btn-ghost !px-4 !py-2.5 text-xs" disabled={pancakeSyncBusy || pancakeSync?.status === 'missing_mapping'} onClick={manualPancakeSync}>{pancakeSyncBusy ? 'Syncing...' : 'Sync to Pancake POS'}</button>}
          {!isNew && product.status === 'archived' && <button type="button" className="btn-ghost !px-4 !py-2.5 text-xs" disabled={actionBusy} onClick={restoreProduct}>Restore as draft</button>}
          {!isNew && product.status !== 'archived' && <button type="button" className="btn-ghost !px-4 !py-2.5 text-xs !border-accent-deep !text-accent-deep" disabled={actionBusy} onClick={() => setArchiveOpen(true)}>Delete</button>}
          <button type="button" className="btn-ink !px-5 !py-2.5 text-xs" disabled={actionBusy} onClick={save}>{actionBusy ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
      {message && <p className="mt-3 text-sm text-accent-deep" role="status">{message}</p>}
      {!isNew && pancakeSync && (
        <section className="mt-4 border border-line bg-paper p-4 text-xs text-clay" aria-label="Pancake product sync status">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <strong className="text-ink">Pancake: {pancakeSync.status?.replaceAll('_', ' ')}</strong>
            {pancakeSync.pancakeProductId && <span>Product ID: {pancakeSync.pancakeProductId}</span>}
            <span>Mapped variants: {pancakeSync.mappedVariantCount || 0}/{pancakeSync.totalVariantCount || 0}</span>
            {pancakeSync.lastSyncedAt && <time dateTime={pancakeSync.lastSyncedAt}>Last synced: {new Date(pancakeSync.lastSyncedAt).toLocaleString()}</time>}
            {pancakeSync.nextRetryAt && <time dateTime={pancakeSync.nextRetryAt}>Next retry: {new Date(pancakeSync.nextRetryAt).toLocaleString()}</time>}
            {pancakeSync.stockMismatch === true && <strong className="text-amber-300">Stock mismatch warning</strong>}
            {pancakeSync.lastErrorCode && <strong className="text-red-300">Error: {pancakeSync.lastErrorCode.replaceAll('_', ' ')}</strong>}
          </div>
          {pancakeSync.variantMappings?.length > 0 && (
            <div className="mt-3 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              {pancakeSync.variantMappings.map((mapping) => (
                <span key={mapping.localVariantId || mapping.sku} className="truncate" title={mapping.pancakeVariantId || 'Missing mapping'}>{mapping.size} · {mapping.sku} · Website {mapping.stockQuantity} · Pancake {mapping.pancakeStockQuantity ?? 'Unknown'} · {mapping.pancakeVariantId || 'Missing Pancake variant ID'}</span>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="product-editor-grid mt-6">
        <div className="space-y-4">
          <section className="border border-line bg-paper p-6">
            <label className="block">
              <span className="eyebrow">Title</span>
              <input className="field mt-1" value={product.name} onChange={(e) => {
                update('name', e.target.value);
                clearFieldError('details');
              }} />
              {fieldErrors.details && <span className="mt-2 block text-xs text-accent-deep" role="alert">{fieldErrors.details}</span>}
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
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Product page content</h2>
                <p className="mt-1 text-xs text-clay">Edit the product page tabs shown below the add-to-cart area.</p>
              </div>
              <button type="button" className="btn-ghost !px-4 !py-2 text-xs" onClick={addSizeChartRow}>Add size row</button>
            </div>
            <label className="mt-4 block">
              <span className="eyebrow">Product details</span>
              <textarea
                className="field mt-1 min-h-28"
                value={productPage.detailsText || ''}
                onChange={(e) => updateProductPage('detailsText', e.target.value)}
                placeholder="Fabric, fit, care, and other product notes"
              />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Shipping</span>
              <textarea
                className="field mt-1 min-h-24"
                value={productPage.shippingText || ''}
                onChange={(e) => updateProductPage('shippingText', e.target.value)}
                placeholder="Shipping terms shown on this product page"
              />
            </label>
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink">Size Chart</h3>
              {sizeChartRows.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-[0.12em] text-clay">
                        <th className="py-2 pr-3">Size</th>
                        <th className="py-2 pr-3">Width</th>
                        <th className="py-2 pr-3">Length</th>
                        <th className="py-2 pr-3">Sleeve length</th>
                        <th className="py-2 pr-3">Shoulder drop length</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sizeChartRows.map((row, index) => (
                        <tr key={index} className="border-t border-line/60">
                          <td className="py-2 pr-3"><input className="field !px-2 !py-1.5" value={row.size || ''} onChange={(e) => updateSizeChartRow(index, 'size', e.target.value)} /></td>
                          <td className="py-2 pr-3"><input className="field !px-2 !py-1.5" value={row.width || ''} onChange={(e) => updateSizeChartRow(index, 'width', e.target.value)} /></td>
                          <td className="py-2 pr-3"><input className="field !px-2 !py-1.5" value={row.length || ''} onChange={(e) => updateSizeChartRow(index, 'length', e.target.value)} /></td>
                          <td className="py-2 pr-3"><input className="field !px-2 !py-1.5" value={row.sleeveLength || ''} onChange={(e) => updateSizeChartRow(index, 'sleeveLength', e.target.value)} /></td>
                          <td className="py-2 pr-3"><input className="field !px-2 !py-1.5" value={row.shoulderDropLength || ''} onChange={(e) => updateSizeChartRow(index, 'shoulderDropLength', e.target.value)} /></td>
                          <td className="py-2 pl-2">
                            <button type="button" className="text-xs text-clay underline hover:text-accent" onClick={() => removeSizeChartRow(index)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-xs text-clay">No size chart rows yet.</p>
              )}
            </div>
          </section>

          <section className="border border-line bg-paper p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Media</h2>
                <p className="mt-1 text-xs text-clay">Add photos and remove old product images. One photo is required.</p>
              </div>
              {!isNew && (
                <label className="btn-ghost cursor-pointer !px-4 !py-2 text-xs">
                  Add photos
                  <input type="file" accept={PRODUCT_IMAGE_ACCEPT} multiple hidden onChange={(e) => uploadImages(e.target.files)} />
                </label>
              )}
            </div>
            {isNew && (
              <QueuedProductMedia
                images={queuedImages}
                error={fieldErrors.media}
                onAdd={queueNewProductImages}
                onRemove={removeQueuedImage}
                onReorder={(fromIndex, toIndex) => setQueuedImages((images) => reorderQueuedProductImages(images, fromIndex, toIndex))}
                onMove={(index, destination) => setQueuedImages((images) => moveQueuedProductImage(images, index, destination))}
              />
            )}
            {!isNew && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {product.images.map((image, index) => (
                  <figure key={index} className="group relative overflow-hidden border border-line bg-cream">
                    <img src={image.url} alt={image.altText || ''} className="product-photo-blend aspect-[4/5] w-full object-cover" />
                    <figcaption className="border-t border-line bg-white px-2 py-2 text-[11px] text-clay">
                      <div className="flex items-center justify-between gap-2">
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
                      </div>
                      <label className="mt-2 block">
                        <span className="font-semibold text-ink">Alt text</span>
                        <input className="field mt-1 !px-2 !py-1.5 text-xs" value={image.altText || ''} onChange={(event) => updateImage(index, { altText: event.target.value })} placeholder={`Describe ${product.name}`} />
                      </label>
                    </figcaption>
                  </figure>
                ))}
                <label className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center border border-dashed border-line bg-cream text-center text-sm font-semibold text-clay hover:border-ink hover:text-ink">
                  <span className="text-3xl leading-none">+</span>
                  Add photos
                  <input type="file" accept={PRODUCT_IMAGE_ACCEPT} multiple hidden onChange={(e) => uploadImages(e.target.files)} />
                </label>
              </div>
            )}
          </section>

          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Pricing</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="eyebrow">Price (₱)</span>
                <input className="field mt-1" name="pricePeso" inputMode="decimal" value={pricePeso} onChange={(e) => {
                  setPricePeso(e.target.value);
                  clearFieldError('pricing');
                }} />
              </label>
              <label className="block">
                <span className="eyebrow">Compare-at (₱)</span>
                <input className="field mt-1" name="comparePeso" inputMode="decimal" value={comparePeso} onChange={(e) => setComparePeso(e.target.value)} placeholder="Optional" />
              </label>
            </div>
            {fieldErrors.pricing && <p className="mt-2 text-xs text-accent-deep" role="alert">{fieldErrors.pricing}</p>}
            <label className="mt-4 block max-w-xs">
              <span className="eyebrow">Parcel weight (grams)</span>
              <input className="field mt-1" type="number" min="1" max="100000" value={product.parcelWeightGrams || 250} onChange={(e) => update('parcelWeightGrams', Number(e.target.value))} />
            </label>
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
                      <td className="py-2">
                        <input
                          className="field !px-2 !py-1.5"
                          type="number"
                          min="0"
                          aria-label={`Stock for variant ${index + 1}`}
                          value={variant.stockQuantity}
                          onChange={(e) => updateVariant(index, 'stockQuantity', e.target.value)}
                        />
                      </td>
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
            {fieldErrors.inventory && <p className="mt-2 text-xs text-accent-deep" role="alert">{fieldErrors.inventory}</p>}
          </section>

          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Inventory Display</h2>
            <p className="mt-2 text-xs text-clay">
              Website sales are calculated from eligible real orders and cannot be overwritten here. Only verified historical or external sales may be adjusted.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                ['showStockStatus', 'Show Stock Status'],
                ['showExactRemainingStock', 'Show Exact Remaining Stock'],
                ['showSoldCount', 'Show Sold Count']
              ].map(([field, label]) => (
                <label key={field} className="block">
                  <span className="eyebrow">{label}</span>
                  <select
                    className="field mt-1"
                    value={product.commerceStats?.[field] === null || product.commerceStats?.[field] === undefined
                      ? 'inherit'
                      : product.commerceStats[field] ? 'on' : 'off'}
                    onChange={(event) => updateCommerceStats(
                      field,
                      event.target.value === 'inherit' ? null : event.target.value === 'on'
                    )}
                  >
                    <option value="inherit">Use global setting</option>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </label>
              ))}
              <label className="block">
                <span className="eyebrow">Low Stock Threshold</span>
                <input
                  className="field mt-1"
                  type="number"
                  min="1"
                  max="999"
                  placeholder="Use global setting"
                  value={product.commerceStats?.lowStockThreshold ?? ''}
                  onChange={(event) => updateCommerceStats(
                    'lowStockThreshold',
                    event.target.value === '' ? null : Number(event.target.value)
                  )}
                />
              </label>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="eyebrow">Verified Historical Sold Quantity</span>
                <input
                  className="field mt-1"
                  type="number"
                  min="0"
                  step="1"
                  value={product.commerceStats?.historicalSoldQuantity ?? 0}
                  onChange={(event) => updateCommerceStats('historicalSoldQuantity', Number(event.target.value))}
                />
              </label>
              <label className="block">
                <span className="eyebrow">Historical Sales Source</span>
                <input
                  className="field mt-1"
                  maxLength="200"
                  placeholder="e.g. Verified TikTok Shop sales as of July 2026"
                  value={product.commerceStats?.historicalSoldSource || ''}
                  onChange={(event) => updateCommerceStats('historicalSoldSource', event.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="eyebrow">Historical Sales Note</span>
                <textarea
                  className="field mt-1"
                  rows="3"
                  maxLength="1000"
                  placeholder="Optional verification details or migration source"
                  value={product.commerceStats?.historicalSoldNote || ''}
                  onChange={(event) => updateCommerceStats('historicalSoldNote', event.target.value)}
                />
              </label>
            </div>

            <dl className="mt-6 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
              {[
                ['Current sellable stock', product.commerceStatsCalculated?.currentSellableStock ?? totalInventory],
                ['Website eligible units sold', product.commerceStatsCalculated?.websiteEligibleUnitsSold ?? 0],
                ['Refund or return deduction', product.commerceStatsCalculated?.refundOrReturnDeduction ?? 0],
                ['Historical verified quantity', product.commerceStats?.historicalSoldQuantity ?? 0],
                ['Final displayed sold count', product.commerceStatsCalculated?.finalDisplayedSoldCount ?? product.commerceStats?.historicalSoldQuantity ?? 0],
                ['Last recalculated', product.commerceStatsCalculated?.lastRecalculatedTime
                  ? new Date(product.commerceStatsCalculated.lastRecalculatedTime).toLocaleString()
                  : 'Recalculates after save']
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-clay">{label}</dt>
                  <dd className="mt-0.5 font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {(product.commerceStats?.historicalSoldUpdatedBy || product.commerceStats?.historicalSoldUpdatedAt) && (
              <p className="mt-4 text-xs text-clay">
                Historical adjustment last updated by {product.commerceStats.historicalSoldUpdatedBy || 'admin'}
                {product.commerceStats.historicalSoldUpdatedAt
                  ? ` on ${new Date(product.commerceStats.historicalSoldUpdatedAt).toLocaleString()}`
                  : ''}.
              </p>
            )}
          </section>

          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Product card content</h2>
            <p className="mt-2 text-xs leading-relaxed text-clay">
              These controls are visible only in Admin. Enabled content appears below the product price
              on customer-facing product cards. Manually entered ratings require a visible source.
            </p>

            <label className="mt-5 block">
              <span className="eyebrow">Card text</span>
              <textarea
                className="field mt-1"
                rows="3"
                maxLength="280"
                placeholder="Enter a short product-card note"
                value={productCardContent.text || ''}
                onChange={(event) => updateProductCardContent('text', event.target.value)}
              />
              <span className="mt-1 block text-[11px] text-clay">
                {String(productCardContent.text || '').length}/280 characters
              </span>
            </label>

            <fieldset className="mt-5">
              <legend className="eyebrow">Five-star rating</legend>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Stars
                  rating={productCardContent.rating || 0}
                  interactive
                  label={false}
                  onChange={(rating) => updateProductCardContent('rating', rating)}
                />
                <span className="text-sm font-semibold tabular-nums">
                  {productCardContent.rating ? `${Number(productCardContent.rating).toFixed(1)} / 5` : 'Not set'}
                </span>
                {productCardContent.rating && (
                  <button
                    type="button"
                    className="text-xs text-clay underline hover:text-accent"
                    onClick={() => {
                      updateProductCardContent('rating', null);
                      updateProductCardContent('showRating', false);
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </fieldset>

            <label className="mt-5 block">
              <span className="eyebrow">Source label</span>
              <input
                className="field mt-1"
                maxLength="120"
                placeholder="e.g. Previous website or Facebook Messenger"
                value={productCardContent.source || ''}
                onChange={(event) => updateProductCardContent('source', event.target.value)}
              />
              <span className="mt-1 block text-[11px] text-clay">
                Optional unless the manually entered star rating is shown.
              </span>
            </label>

            <fieldset className="mt-5 border-t border-line pt-4">
              <legend className="eyebrow">Customer display</legend>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={productCardContent.showText === true}
                    onChange={(event) => updateProductCardContent('showText', event.target.checked)}
                  />
                  Show text
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={productCardContent.showRating === true}
                    onChange={(event) => updateProductCardContent('showRating', event.target.checked)}
                  />
                  Show rating
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={productCardContent.showSource === true}
                    disabled={productCardContent.showRating === true}
                    onChange={(event) => updateProductCardContent('showSource', event.target.checked)}
                  />
                  Show source
                </label>
              </div>
              {productCardContent.showRating && !String(productCardContent.source || '').trim() && (
                <p className="mt-3 text-xs text-accent-deep" role="alert">
                  Add a source label before saving a visible manually entered rating.
                </p>
              )}
            </fieldset>
          </section>
        </div>

        <div className="space-y-4">
          <section className="border border-line bg-paper p-6">
            <div className="block">
              <label className="eyebrow" htmlFor="product-publication-status">Status</label>
              <select id="product-publication-status" className="field mt-1" value={product.status} onChange={(e) => {
                update('status', e.target.value);
                clearFieldError('inventory');
              }}>
                {STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
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
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Product reviews</h2>
            <div className="mt-4 space-y-3 text-sm">
              <label className="flex items-center justify-between gap-3">
                <span>Reviews enabled for this product</span>
                <input
                  type="checkbox"
                  checked={product.reviewSettings?.reviewsEnabled !== false}
                  onChange={(event) => update('reviewSettings', {
                    ...(product.reviewSettings || {}),
                    reviewsEnabled: event.target.checked
                  })}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Show rating summary</span>
                <input
                  type="checkbox"
                  checked={product.reviewSettings?.showRatingSummary !== false}
                  onChange={(event) => update('reviewSettings', {
                    ...(product.reviewSettings || {}),
                    showRatingSummary: event.target.checked
                  })}
                />
              </label>
            </div>
            <p className="mt-3 text-xs text-clay">Disabling reviews hides them without deleting any review records.</p>
            {!isNew && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="eyebrow">Calculated rating summary</p>
                <p className="mt-3 text-sm font-semibold">
                  {Number(product.ratingSummary?.ratingCount || 0) > 0
                    ? `${Number(product.ratingSummary?.averageRating || 0).toFixed(1)} out of 5`
                    : 'No ratings yet'}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="text-clay">Published rated reviews</dt><dd className="mt-1 font-semibold">{Number(product.ratingSummary?.publishedRatedReviews || 0).toLocaleString('en-PH')}</dd></div>
                  <div><dt className="text-clay">Pending reviews</dt><dd className="mt-1 font-semibold">{Number(product.ratingSummary?.pendingReviews || 0).toLocaleString('en-PH')}</dd></div>
                  <div><dt className="text-clay">Hidden reviews</dt><dd className="mt-1 font-semibold">{Number(product.ratingSummary?.hiddenReviews || 0).toLocaleString('en-PH')}</dd></div>
                  <div><dt className="text-clay">Last recalculated</dt><dd className="mt-1 font-semibold">{product.ratingSummary?.lastRecalculatedAt ? new Date(product.ratingSummary.lastRecalculatedAt).toLocaleString('en-PH') : 'Not calculated'}</dd></div>
                </dl>
                <div className="mt-4 space-y-1 text-xs" aria-label="Published rating distribution">
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <div key={rating} className="flex items-center justify-between gap-3">
                      <span>{rating} {rating === 1 ? 'star' : 'stars'}</span>
                      <strong>{Number(product.ratingSummary?.ratingDistribution?.[rating] || 0).toLocaleString('en-PH')}</strong>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-clay">Read-only. The average updates from published review records and cannot be overridden here.</p>
              </div>
            )}
          </section>

          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Collections</h2>
            <CollectionDropdown
              value={product.collections || []}
              onChange={(collections) => {
                update('collections', collections);
                clearFieldError('collections');
              }}
            />
            {fieldErrors.collections && <p className="mt-2 text-xs text-accent-deep" role="alert">{fieldErrors.collections}</p>}
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

          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Product facts</h2>
            <p className="mt-2 text-xs leading-relaxed text-clay">Only enter confirmed facts. Leave unavailable model details blank.</p>
            {[
              ['color', 'Color', 'Black'],
              ['material', 'Material', '100% cotton'],
              ['fit', 'Fit', 'Oversized fit'],
              ['fabricWeight', 'Fabric weight', '240 GSM'],
              ['modelHeight', 'Model height', 'Optional, e.g. 5′6″'],
              ['modelWearsSize', 'Model wears size', 'Optional, e.g. Medium']
            ].map(([field, label, placeholder]) => (
              <label key={field} className="mt-4 block">
                <span className="eyebrow">{label}</span>
                <input className="field mt-1" value={metafieldText(field)} onChange={(event) => updateMetafield(field, event.target.value)} placeholder={placeholder} />
              </label>
            ))}
          </section>

          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Search & sharing</h2>
            <p className="mt-2 text-xs leading-relaxed text-clay">Optional custom fields override the safe storefront fallbacks. Warnings never block saving.</p>
            <SeoSearchPreview
              title={seoAnalysis.fallbacks.title}
              description={seoAnalysis.fallbacks.description}
              url={seoAnalysis.fallbacks.canonical}
              score={seoAnalysis.score}
              warnings={seoWarnings}
            />
            <label className="mt-4 block">
              <span className="eyebrow">SEO title</span>
              <input className="field mt-1" value={product.seo?.title || ''} onChange={(event) => updateSeo('title', event.target.value)} placeholder={seoAnalysis.fallbacks.title} />
              <span className={`mt-1 block text-[11px] ${String(product.seo?.title || '').length > 70 ? 'text-amber-700' : 'text-clay'}`}>{String(product.seo?.title || '').length} characters · soft guidance: about 50–70</span>
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Meta description</span>
              <textarea className="field mt-1 min-h-24" value={product.seo?.description || ''} onChange={(event) => updateSeo('description', event.target.value)} placeholder="Describe the product’s confirmed fabric, fit, color, and customer benefit." />
              <span className={`mt-1 block text-[11px] ${String(product.seo?.description || '').length > 160 ? 'text-amber-700' : 'text-clay'}`}>{String(product.seo?.description || '').length} characters · soft guidance: about 120–160</span>
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Main search keyword</span>
              <input className="field mt-1" value={product.seo?.mainKeyword || ''} onChange={(event) => updateSeo('mainKeyword', event.target.value)} placeholder="One product-specific phrase" />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Secondary keywords</span>
              <input className="field mt-1" value={(product.seo?.secondaryKeywords || []).join(', ')} onChange={(event) => updateSeo('secondaryKeywords', event.target.value.split(',').map((keyword) => keyword.trim()).filter(Boolean))} placeholder="Related phrases, comma separated" />
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Main image alt text</span>
              <input className="field mt-1" value={product.seo?.imageAltText || ''} onChange={(event) => updateSeo('imageAltText', event.target.value)} placeholder={`${product.name || 'Product'}, front view`} />
              <span className="mt-1 block text-[11px] text-clay">Fallback for the first product image. Keep angle-specific alt text on every gallery image below.</span>
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Canonical URL override</span>
              <input className="field mt-1" value={product.seo?.canonicalUrl || ''} onChange={(event) => updateSeo('canonicalUrl', event.target.value)} placeholder={seoAnalysis.fallbacks.pathname} autoCapitalize="none" spellCheck="false" />
              <span className="mt-1 block text-[11px] text-clay">Leave blank to use the clean product URL. Use only an HTTPS URL or a site-relative path when consolidation is genuinely required.</span>
            </label>
            <label className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span><strong className="block text-ink">Search engine visibility</strong><span className="text-xs text-clay">Allow this active product to be indexed</span></span>
              <input type="checkbox" checked={product.seo?.indexable !== false} onChange={(event) => updateSeo('indexable', event.target.checked)} />
            </label>

            <div className="mt-5 border-t border-line pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em]">Open Graph sharing</h3>
              <label className="mt-4 block">
                <span className="eyebrow">Open Graph title</span>
                <input className="field mt-1" value={product.seo?.ogTitle || ''} onChange={(event) => updateSeo('ogTitle', event.target.value)} placeholder={seoAnalysis.fallbacks.title} />
              </label>
              <label className="mt-4 block">
                <span className="eyebrow">Open Graph description</span>
                <textarea className="field mt-1 min-h-20" value={product.seo?.ogDescription || ''} onChange={(event) => updateSeo('ogDescription', event.target.value)} placeholder={seoAnalysis.fallbacks.description} />
              </label>
              <label className="mt-4 block">
                <span className="eyebrow">Open Graph image URL</span>
                <input className="field mt-1" value={product.seo?.ogImageUrl || ''} onChange={(event) => updateSeo('ogImageUrl', event.target.value)} placeholder={product.images?.[0]?.url || 'https://... or /uploads/...'} />
              </label>
            </div>

            <div className="mt-5 border-t border-line pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em]">Channel titles</h3>
              <label className="mt-4 block">
                <span className="eyebrow">Product feed title</span>
                <input className="field mt-1" value={product.seo?.feedTitle || ''} onChange={(event) => updateSeo('feedTitle', event.target.value)} placeholder={product.name} />
                <span className={`mt-1 block text-[11px] ${String(product.seo?.feedTitle || '').length > 150 ? 'text-amber-700' : 'text-clay'}`}>{String(product.seo?.feedTitle || '').length}/150 Merchant Center maximum</span>
              </label>
              <label className="mt-4 block">
                <span className="eyebrow">Marketplace title</span>
                <input className="field mt-1" value={product.seo?.marketplaceTitle || ''} onChange={(event) => updateSeo('marketplaceTitle', event.target.value)} placeholder={product.name} />
              </label>
            </div>
            <p className="mt-4 text-xs text-clay">The storefront metadata, social preview, canonical URL, Product schema, and product feed use these saved fields or their documented fallbacks.</p>
          </section>

          <section className="border border-line bg-paper p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Storefront URL</h2>
            <label className="mt-4 block">
              <span className="eyebrow">Public handle</span>
              <input
                className="field mt-1"
                value={product.publicHandle || ''}
                onChange={(event) => update('publicHandle', event.target.value)}
                placeholder="Generated from the product title"
                autoCapitalize="none"
                spellCheck="false"
              />
            </label>
            <p className="mt-3 break-all text-xs text-clay">
              /product/{product.publicHandle || 'generated-after-save'}
            </p>
            {!isNew && (
              <div className="mt-4 border-t border-line pt-4 text-xs text-clay">
                <p><strong className="text-ink">Product ID:</strong> {product.id || product.slug}</p>
                <p className="mt-1"><strong className="text-ink">Internal slug:</strong> {product.slug}</p>
                {(product.urlAliases || []).length > 0 && (
                  <div className="mt-3">
                    <p className="font-semibold uppercase tracking-[0.1em] text-ink">Redirected previous handles</p>
                    <ul className="mt-2 space-y-1">
                      {product.urlAliases.map((alias) => <li key={alias} className="break-all">/product/{alias}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
      <AdminConfirmDialog
        open={archiveOpen}
        title={`Delete ${product.name}?`}
        description="Delete this product? It will be removed from the shop, but previous order records will remain available."
        warning="The product will be archived locally. Its Pancake POS product will not be deleted, and it will show in Archived Products for restoration."
        confirmLabel="Delete / archive"
        danger
        busy={actionBusy}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={deleteProduct}
      />
    </div>
  );
}
