import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adminJson, adminSend } from '../lib/adminApi.js';
import { invalidateStorefrontSettings } from '../lib/storeSettings.js';
import { collectionMembers } from '../lib/storefrontCollections.js';
import useAdminCollections from './useAdminCollections.js';
import SeoSearchPreview from './SeoSearchPreview.jsx';
import { collectionSeoAnalysis } from '../lib/seoAdmin.js';

function acceptedCollectionNames(collection) {
  return new Set([collection?.name, ...(collection?.aliases || [])]
    .map((name) => String(name || '').trim().toLowerCase()).filter(Boolean));
}

function inCollection(product, collection) {
  const accepted = acceptedCollectionNames(collection);
  return (product.collections || []).some((name) => accepted.has(String(name || '').trim().toLowerCase()));
}

function draftFrom(collection) {
  return collection ? {
    ...collection,
    aliases: [...(collection.aliases || [])],
    urlAliases: [...(collection.urlAliases || [])],
    secondaryKeywords: [...(collection.secondaryKeywords || [])]
  } : null;
}

export default function Collections() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { collectionDefinitions, error: collectionError, reload: reloadCollections } = useAdminCollections();
  const [products, setProducts] = useState([]);
  const [activeSlug, setActiveSlug] = useState('new-arrivals');
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [savingCollection, setSavingCollection] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [serverSeoWarnings, setServerSeoWarnings] = useState([]);

  const activeCollection = useMemo(() => collectionDefinitions.find((collection) => collection.slug === activeSlug) || collectionDefinitions[0] || null, [activeSlug, collectionDefinitions]);

  useEffect(() => {
    const requestedSlug = String(searchParams.get('collection') || '').trim().toLowerCase();
    if (requestedSlug && requestedSlug !== activeSlug && collectionDefinitions.some((collection) => collection.slug === requestedSlug)) {
      setActiveSlug(requestedSlug);
    }
  }, [activeSlug, collectionDefinitions, searchParams]);

  function loadProducts() {
    adminJson('/api/admin/products?sort=name_asc')
      .then((body) => setProducts(body.products || []))
      .catch((error) => setStatus(error.message));
  }

  useEffect(loadProducts, []);

  useEffect(() => {
    if (!activeCollection) return;
    if (activeCollection.slug !== activeSlug) setActiveSlug(activeCollection.slug);
    setDraft(draftFrom(activeCollection));
    setImageFile(null);
  }, [activeCollection, activeSlug]);

  useEffect(() => {
    if (!activeCollection?.slug) return;
    adminJson('/api/admin/seo')
      .then((body) => {
        const row = (body.collections || []).find((candidate) => candidate.slug === activeCollection.slug);
        setServerSeoWarnings(Array.isArray(row?.warnings) ? row.warnings : []);
      })
      .catch(() => setServerSeoWarnings([]));
  }, [activeCollection?.slug]);

  async function addCollection(event) {
    event.preventDefault();
    setSavingCollection(true);
    setStatus('Adding collection...');
    try {
      const body = await adminSend('POST', '/api/admin/collections', { name: newCollectionName });
      const created = body.collectionDefinitions?.find((collection) => collection.name.toLowerCase() === newCollectionName.trim().toLowerCase());
      invalidateStorefrontSettings();
      await reloadCollections();
      if (created) setActiveSlug(created.slug);
      setNewCollectionName('');
      setStatus('Collection added. Review its storefront settings and assign products below.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSavingCollection(false);
    }
  }

  async function saveCollectionSettings(event) {
    event.preventDefault();
    if (!activeCollection || !draft) return;
    setSavingCollection(true);
    setStatus('Saving collection settings...');
    try {
      const body = await adminSend('PUT', `/api/admin/collections/${encodeURIComponent(activeCollection.slug)}`, draft);
      let saved = body.collectionDefinitions?.find((collection) => collection.name.toLowerCase() === draft.name.trim().toLowerCase());
      if (imageFile && saved) {
        const form = new FormData();
        form.append('image', imageFile);
        const uploaded = await adminJson(`/api/admin/collections/${encodeURIComponent(saved.slug)}/image`, { method: 'POST', body: form });
        saved = uploaded.collection || saved;
      }
      invalidateStorefrontSettings();
      await reloadCollections();
      if (saved) setActiveSlug(saved.slug);
      setImageFile(null);
      setStatus('Collection settings saved. Customer pages update immediately.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSavingCollection(false);
    }
  }

  async function saveProductCollections(slug, change) {
    if (!activeCollection) return;
    setStatus('Saving product assignment...');
    try {
      const { product } = await adminJson(`/api/admin/products/${encodeURIComponent(slug)}`);
      const current = Array.isArray(product.collections) ? product.collections : [];
      const next = [...new Set(change(current))].map((name) => String(name || '').trim()).filter(Boolean);
      await adminSend('PUT', `/api/admin/products/${encodeURIComponent(slug)}`, { ...product, collections: next });
      setStatus('Product assignment updated.');
      loadProducts();
    } catch (error) {
      setStatus(error.message);
    }
  }

  const members = activeCollection ? collectionMembers(products, activeCollection).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const available = activeCollection ? products.filter((product) => !inCollection(product, activeCollection)).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const seoAnalysis = draft ? collectionSeoAnalysis(draft, members.length) : null;
  const seoWarnings = seoAnalysis ? [...new Set([...seoAnalysis.warnings, ...serverSeoWarnings])] : [];

  function removeAssignment(collections) {
    const accepted = acceptedCollectionNames(activeCollection);
    return collections.filter((name) => !accepted.has(String(name || '').trim().toLowerCase()));
  }

  return (
    <div className="max-w-6xl">
      <p className="eyebrow">Products</p>
      <h1 className="display mt-1 text-3xl">Collections</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">Control collection pages, Homepage sections, Shop navigation, display order, and product assignments from one place.</p>
      {(status || collectionError) && <p className="mt-3 text-sm text-accent-deep" role="status">{status || collectionError}</p>}

      <form className="mt-5 flex max-w-xl flex-col gap-2 sm:flex-row" onSubmit={addCollection}>
        <label className="sr-only" htmlFor="new-collection-name">New collection name</label>
        <input id="new-collection-name" className="field flex-1" maxLength="60" placeholder="New collection name" value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} />
        <button type="submit" className="btn-ink whitespace-nowrap" disabled={savingCollection || !newCollectionName.trim()}>{savingCollection ? 'Saving...' : 'Create collection'}</button>
      </form>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {collectionDefinitions.map((collection) => {
          const count = products.filter((product) => inCollection(product, collection)).length;
          return (
            <button key={collection.slug} type="button" onClick={() => setActiveSlug(collection.slug)} className={`shrink-0 border px-4 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${collection.slug === activeCollection?.slug ? 'border-ink bg-ink text-paper' : 'border-line hover:border-ink'}`}>
              {collection.name} <span className={collection.slug === activeCollection?.slug ? 'text-accent' : 'text-clay'}>({count})</span>
            </button>
          );
        })}
      </div>

      {draft && activeCollection && (
        <form className="mt-5 border-y border-line py-6" onSubmit={saveCollectionSettings}>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="text-sm font-semibold">Collection name
              <input className="field mt-2" maxLength="60" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
            </label>
            <label className="text-sm font-semibold">Slug
              <input className="field mt-2" maxLength="80" value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') })} required />
            </label>
            <label className="text-sm font-semibold md:col-span-2">Description
              <textarea className="field mt-2 min-h-24" maxLength="500" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </label>
            <label className="text-sm font-semibold md:col-span-2">Concise introduction above product grid
              <textarea className="field mt-2 min-h-20" value={draft.introText || ''} onChange={(event) => setDraft({ ...draft, introText: event.target.value })} placeholder="Briefly explain the collection and products customers will find." />
            </label>
            <label className="text-sm font-semibold md:col-span-2">Supporting text below product grid
              <textarea className="field mt-2 min-h-28" value={draft.supportingText || ''} onChange={(event) => setDraft({ ...draft, supportingText: event.target.value })} placeholder="Optional useful details about fit, fabric, styling, or the collection story." />
            </label>
            <label className="text-sm font-semibold">Image URL
              <input className="field mt-2" placeholder="https://... or /uploads/..." value={draft.imageUrl} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} />
            </label>
            <label className="text-sm font-semibold">Upload image
              <input className="field mt-2 file:mr-3 file:border-0 file:bg-ink file:px-3 file:py-2 file:text-xs file:font-semibold file:text-paper" type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] || null)} />
            </label>
            <label className="text-sm font-semibold">Sort order
              <input className="field mt-2" type="number" min="0" max="9999" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} />
            </label>
            <div className="grid gap-3 text-sm sm:grid-cols-3 md:col-span-2">
              <label className="flex items-center gap-2"><input type="checkbox" checked={draft.visible} onChange={(event) => setDraft({ ...draft, visible: event.target.checked })} /> Enabled</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={draft.showOnHomepage} onChange={(event) => setDraft({ ...draft, showOnHomepage: event.target.checked })} /> Show on Homepage</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={draft.showOnShop} onChange={(event) => setDraft({ ...draft, showOnShop: event.target.checked })} /> Show in Shop categories</label>
            </div>

            <section className="border-t border-line pt-5 md:col-span-2" aria-labelledby="collection-seo-heading">
              <h2 id="collection-seo-heading" className="text-sm font-semibold uppercase tracking-[0.12em]">Search & sharing</h2>
              <p className="mt-2 text-xs leading-relaxed text-clay">Warnings are advisory and do not block saving. Empty collections are automatically noindex on the storefront.</p>
              {seoAnalysis && (
                <SeoSearchPreview
                  title={seoAnalysis.fallbacks.title}
                  description={seoAnalysis.fallbacks.description}
                  url={seoAnalysis.fallbacks.canonical}
                  score={seoAnalysis.score}
                  warnings={seoWarnings}
                />
              )}
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold">SEO title
                  <input className="field mt-2" value={draft.seoTitle || ''} onChange={(event) => setDraft({ ...draft, seoTitle: event.target.value })} placeholder={seoAnalysis?.fallbacks.title} />
                  <span className={`mt-1 block text-[11px] ${String(draft.seoTitle || '').length > 70 ? 'text-amber-700' : 'text-clay'}`}>{String(draft.seoTitle || '').length} characters · soft guidance: about 50–70</span>
                </label>
                <label className="text-sm font-semibold">Main search keyword
                  <input className="field mt-2" value={draft.mainKeyword || ''} onChange={(event) => setDraft({ ...draft, mainKeyword: event.target.value })} placeholder="One collection-level commercial phrase" />
                </label>
                <label className="text-sm font-semibold md:col-span-2">Meta description
                  <textarea className="field mt-2 min-h-24" value={draft.metaDescription || ''} onChange={(event) => setDraft({ ...draft, metaDescription: event.target.value })} placeholder="Describe the collection and its confirmed customer value." />
                  <span className={`mt-1 block text-[11px] ${String(draft.metaDescription || '').length > 160 ? 'text-amber-700' : 'text-clay'}`}>{String(draft.metaDescription || '').length} characters · soft guidance: about 120–160</span>
                </label>
                <label className="text-sm font-semibold md:col-span-2">Secondary keywords
                  <input className="field mt-2" value={(draft.secondaryKeywords || []).join(', ')} onChange={(event) => setDraft({ ...draft, secondaryKeywords: event.target.value.split(',').map((keyword) => keyword.trim()).filter(Boolean) })} placeholder="Closely related phrases, comma separated" />
                </label>
                <label className="text-sm font-semibold">Canonical URL override
                  <input className="field mt-2" value={draft.canonicalUrl || ''} onChange={(event) => setDraft({ ...draft, canonicalUrl: event.target.value })} placeholder={`/collections/${draft.slug}`} autoCapitalize="none" spellCheck="false" />
                </label>
                <label className="text-sm font-semibold">Open Graph image URL
                  <input className="field mt-2" value={draft.ogImageUrl || ''} onChange={(event) => setDraft({ ...draft, ogImageUrl: event.target.value })} placeholder={draft.imageUrl || 'https://... or /uploads/...'} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm md:col-span-2">
                  <span><strong className="block text-ink">Search engine visibility</strong><span className="text-xs text-clay">Allow this non-empty, enabled collection to be indexed</span></span>
                  <input type="checkbox" checked={draft.indexable !== false} onChange={(event) => setDraft({ ...draft, indexable: event.target.checked })} />
                </label>
              </div>
              {(draft.urlAliases || []).length > 0 && (
                <div className="mt-5 border-t border-line pt-4 text-xs text-clay">
                  <p className="font-semibold uppercase tracking-[0.1em] text-ink">Redirected previous collection slugs</p>
                  <ul className="mt-2 space-y-1">
                    {draft.urlAliases.map((alias) => <li key={alias} className="break-all">/collections/{alias}</li>)}
                  </ul>
                </div>
              )}
            </section>
          </div>
          {draft.imageUrl && <img src={draft.imageUrl} alt="Collection preview" className="mt-5 aspect-[16/5] w-full max-w-2xl object-cover" width="1600" height="500" loading="lazy" />}
          <button type="submit" className="btn-ink mt-5" disabled={savingCollection}>{savingCollection ? 'Saving...' : 'Save collection settings'}</button>
        </form>
      )}

      <section className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Linked products</h2>
            <p className="mt-1 text-sm text-clay">{members.length ? `${members.length} product${members.length === 1 ? '' : 's'} linked.` : 'No products are linked yet.'}</p>
          </div>
          <select className="field max-w-md" value="" disabled={!available.length} aria-label={`Add product to ${activeCollection?.name || 'collection'}`} onChange={(event) => event.target.value && saveProductCollections(event.target.value, (collections) => [...collections, activeCollection.name])}>
            <option value="">{available.length ? `Add product to ${activeCollection?.name}...` : 'All products are in this collection'}</option>
            {available.map((product) => <option key={product.slug} value={product.slug}>{product.name}</option>)}
          </select>
        </div>

        <div className="mt-5 space-y-2">
          {members.map((product) => (
            <article key={product.slug} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 border border-line bg-paper p-3 sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]">
              <img src={product.image || '/brand/logo.png'} alt="" className="product-photo-blend h-14 w-11 object-cover" />
              <div className="min-w-0"><strong className="block truncate text-sm">{product.name}</strong><span className="text-xs text-clay">{product.status || 'active'} · {Number(product.inventoryQuantity || 0)} in stock</span></div>
              <button type="button" className="btn-ghost !px-4 !py-2 text-xs" onClick={() => navigate(`/admin/products/${encodeURIComponent(product.slug)}`)}>Edit</button>
              <button type="button" className="btn-ghost !border-red-500/50 !px-4 !py-2 text-xs !text-red-300 hover:!border-red-400 hover:!text-red-200" onClick={() => saveProductCollections(product.slug, removeAssignment)}>Remove</button>
            </article>
          ))}
          {!members.length && (
            <div className="border border-line bg-paper p-8 text-center"><h3 className="text-sm font-semibold">No products in {activeCollection?.name}</h3><p className="mt-1 text-sm text-clay">Use the selector above, or assign this collection in the product editor.</p></div>
          )}
        </div>
      </section>
    </div>
  );
}
