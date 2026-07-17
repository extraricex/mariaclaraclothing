import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import { CustomerButton } from '../components/ui/Button.jsx';
import { fetchProducts } from '../lib/api.js';
import { DEFAULT_STOREFRONT_SETTINGS, loadStorefrontSettings } from '../lib/storeSettings.js';
import { collectionMembers, normalizeCollectionDefinitions } from '../lib/storefrontCollections.js';
import Breadcrumbs from '../components/Breadcrumbs.jsx';

export default function Collection() {
  const { slug } = useParams();
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState(DEFAULT_STOREFRONT_SETTINGS.collectionDefinitions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([fetchProducts(), loadStorefrontSettings()])
      .then(([catalog, settings]) => {
        if (!active) return;
        setProducts(catalog.products || []);
        setCollections(settings.collectionDefinitions || DEFAULT_STOREFRONT_SETTINGS.collectionDefinitions);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Could not load this collection.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const collection = useMemo(() => normalizeCollectionDefinitions(collections)
    .find((candidate) => candidate.slug === String(slug || '').trim().toLowerCase()), [collections, slug]);
  const visible = collection?.visible && (collection.showOnShop || collection.showOnHomepage);
  const members = visible ? collectionMembers(products, collection) : [];

  useEffect(() => {
    if (!visible) return undefined;
    const previousTitle = document.title;
    const descriptionMeta = document.head.querySelector('meta[name="description"]');
    const previousDescription = descriptionMeta?.getAttribute('content') || '';
    let canonical = document.head.querySelector('link[rel="canonical"]');
    const createdCanonical = !canonical;
    const previousCanonical = canonical?.getAttribute('href') || '';
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    document.title = `${collection.name} | Maria Clara Clothing`;
    canonical.href = `${window.location.origin}/collections/${encodeURIComponent(collection.slug)}`;
    if (descriptionMeta) descriptionMeta.setAttribute('content', collection.description || `Shop ${collection.name} from Maria Clara Clothing.`);
    return () => {
      document.title = previousTitle;
      if (descriptionMeta) descriptionMeta.setAttribute('content', previousDescription);
      if (createdCanonical) canonical.remove();
      else canonical.setAttribute('href', previousCanonical);
    };
  }, [collection, visible]);

  if (loading) return <div className="mx-auto min-h-[45vh] max-w-7xl px-5 py-16 text-sm text-clay lg:px-8" aria-busy="true">Loading collection...</div>;

  if (error) {
    return <div className="mx-auto min-h-[45vh] max-w-7xl px-5 py-16 lg:px-8"><p className="text-sm text-accent-deep">{error}</p></div>;
  }

  if (!visible) {
    return (
      <section className="mx-auto min-h-[45vh] max-w-3xl px-5 py-16 text-center lg:px-8">
        <p className="eyebrow">Collection</p>
        <h1 className="display mt-3 text-4xl sm:text-6xl">Collection unavailable</h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-ink-soft">This collection is not currently available. Browse the active collections on our shop.</p>
        <CustomerButton as={Link} to="/" className="mt-7">Back to shop</CustomerButton>
      </section>
    );
  }

  return (
    <div className="pb-8">
      <section className="border-b border-line bg-ink text-paper">
        <div className={`mx-auto grid max-w-7xl items-center ${collection.imageUrl ? 'gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]' : ''} px-5 py-12 sm:py-16 lg:px-8`}>
          <div>
            <Breadcrumbs className="mb-6 [&_ol]:text-paper/60" items={[{ label: 'Home', to: '/' }, { label: 'Shop', to: '/shop' }, { label: collection.name }]} />
            <p className="eyebrow text-paper/60">Collection</p>
            <h1 className="display mt-3 text-4xl sm:text-6xl">{collection.name}</h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper/75">{collection.description}</p>
          </div>
          {collection.imageUrl && (
            <div className="mt-8 aspect-[16/9] overflow-hidden bg-paper/5 lg:mt-0">
              <img src={collection.imageUrl} alt={`${collection.name} collection`} className="h-full w-full object-cover" />
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-7xl px-5 sm:mt-14 lg:px-8">
        <div className="flex items-end justify-between gap-4 border-b border-line pb-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">Products</h2>
          <p className="text-xs text-clay">{members.length} {members.length === 1 ? 'piece' : 'pieces'}</p>
        </div>
        {members.length ? (
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-4">
            {members.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
          </div>
        ) : (
          <div className="border-b border-line py-16 text-center">
            <h2 className="display text-3xl">No pieces available right now</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-ink-soft">Browse the rest of the shop or check back for the next available piece.</p>
            <CustomerButton as={Link} to="/" variant="secondary" className="mt-7">Browse all products</CustomerButton>
          </div>
        )}
      </section>
    </div>
  );
}
