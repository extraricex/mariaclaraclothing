import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchProducts, fetchSiteContent } from '../lib/api.js';
import { DEFAULT_STOREFRONT_SETTINGS, loadStorefrontSettings } from '../lib/storeSettings.js';
import { buildStorefrontCollectionSections } from '../lib/storefrontCollections.js';
import ProductCard from '../components/ProductCard.jsx';
import { CustomerButton } from '../components/ui/Button.jsx';
import { CustomerCard } from '../components/ui/Card.jsx';

function CollectionSection({ id, index, title, blurb, slug, products }) {
  if (!products.length) return null;
  return (
    <section id={id} className="mx-auto mt-8 max-w-7xl scroll-mt-36 px-5 sm:mt-14 lg:mt-20 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-[var(--customer-border)] pt-6">
        <div>
          <p className="eyebrow">{index} / Collection</p>
          <h2 className="display mt-2 text-3xl sm:text-5xl">{title}</h2>
        </div>
        <div className="max-w-xs">
          <p className="text-sm text-ink-soft">{blurb}</p>
          <Link to={`/collections/${encodeURIComponent(slug)}`} className="text-action mt-3 inline-block text-xs font-semibold uppercase tracking-[0.14em] text-accent hover:text-accent-deep">
            View collection
          </Link>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 sm:mt-8 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-4">
        {products.map((product, i) => (
          <ProductCard key={product.id} product={product} index={i} />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [banners, setBanners] = useState([]);
  const [collections, setCollections] = useState(DEFAULT_STOREFRONT_SETTINGS.collectionDefinitions);
  const [storefrontSettings, setStorefrontSettings] = useState(DEFAULT_STOREFRONT_SETTINGS);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [error, setError] = useState('');
  const heroTouchStartX = useRef(null);

  useEffect(() => {
    fetchProducts()
      .then((body) => setProducts(body.products))
      .catch((err) => setError(err.message));
    fetchSiteContent()
      .then((body) => setBanners(body.siteContent?.homepageBanners || []))
      .catch(() => {});
    loadStorefrontSettings()
      .then((settings) => {
        setStorefrontSettings(settings);
        setCollections(settings.collectionDefinitions || DEFAULT_STOREFRONT_SETTINGS.collectionDefinitions);
      });
  }, []);

  const collectionSections = buildStorefrontCollectionSections(products, collections);
  const activeBanner = banners[activeHeroIndex] || banners[0] || null;
  const heroCopy = storefrontSettings.hero || DEFAULT_STOREFRONT_SETTINGS.hero;

  useEffect(() => {
    if (!location.hash || !collectionSections.length) return undefined;
    let targetId = '';
    try {
      targetId = decodeURIComponent(location.hash.slice(1));
    } catch (_error) {
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, collectionSections.length]);

  useEffect(() => {
    if (activeHeroIndex >= banners.length) setActiveHeroIndex(0);
  }, [activeHeroIndex, banners.length]);

  useEffect(() => {
    if (banners.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setActiveHeroIndex((index) => (index + 1) % banners.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [banners.length]);

  function showPreviousHero() {
    if (banners.length < 2) return;
    setActiveHeroIndex((index) => (index - 1 + banners.length) % banners.length);
  }

  function showNextHero() {
    if (banners.length < 2) return;
    setActiveHeroIndex((index) => (index + 1) % banners.length);
  }

  function handleHeroTouchStart(event) {
    heroTouchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleHeroTouchEnd(event) {
    if (heroTouchStartX.current === null || banners.length < 2) return;
    const endX = event.changedTouches[0]?.clientX ?? heroTouchStartX.current;
    const delta = endX - heroTouchStartX.current;
    heroTouchStartX.current = null;
    if (Math.abs(delta) < 42) return;
    if (delta < 0) showNextHero();
    else showPreviousHero();
  }

  return (
    <div className="customer-page pb-4">
      <section
        className="customer-hero grain relative -mt-[97px] min-h-[min(58svh,430px)] touch-pan-y overflow-hidden bg-ink text-center text-paper sm:min-h-[min(68svh,560px)] lg:-mt-[105px] lg:min-h-[min(78vh,720px)]"
        onTouchStart={handleHeroTouchStart}
        onTouchEnd={handleHeroTouchEnd}
      >
        {activeBanner ? (
          <img
            src={activeBanner.url}
            alt=""
            aria-hidden="true"
            className="block h-auto w-full select-none opacity-0"
          />
        ) : (
          <div className="aspect-[2200/825] w-full" aria-hidden="true" />
        )}
        <div className="absolute inset-0 overflow-hidden">
          {banners.map((banner, index) => (
            <img
              key={`${banner.url}-${index}`}
              src={banner.url}
              alt={index === activeHeroIndex ? banner.altText || 'Maria Clara Clothing' : ''}
              aria-hidden={index !== activeHeroIndex}
              className="hero-slide absolute inset-0 h-full w-full object-cover object-center opacity-100 contrast-[1.05] saturate-[1.04] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ transform: `translateX(${(index - activeHeroIndex) * 100}%)` }}
            />
          ))}
        </div>
        <div className="absolute inset-0 bg-ink/35 sm:bg-ink/40" />
        <div className="absolute inset-0 z-10 flex items-end justify-start px-5 pb-12 pt-28 text-left sm:px-8 sm:pb-16 lg:px-12 lg:pb-20">
          <div className="flex max-w-3xl flex-col items-start">
            <h1 className="display reveal reveal-2 text-[clamp(1.65rem,8vw,2.35rem)] leading-[0.9] sm:text-6xl lg:text-7xl">
              {heroCopy.title}<br /><span className="text-[var(--customer-accent-soft)]">{heroCopy.highlight}</span>
            </h1>
            <p className="reveal reveal-3 mt-4 hidden max-w-xs text-[13px] leading-relaxed text-paper/85 lg:mt-6 lg:block lg:max-w-sm lg:text-sm">
              {heroCopy.subtitle}
            </p>
            <div className="reveal reveal-4 mt-3 flex flex-wrap justify-start gap-1.5 sm:mt-8 sm:gap-3">
              <CustomerButton as="a" href={heroCopy.primaryButtonLink} className="customer-compact-button !bg-accent hover:!bg-accent-deep">{heroCopy.primaryButtonText}</CustomerButton>
              <CustomerButton as="a" href={heroCopy.secondaryButtonLink} variant="inverse" className="customer-compact-button">{heroCopy.secondaryButtonText}</CustomerButton>
            </div>
          </div>
          {banners.length > 1 && (
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center justify-center sm:bottom-3" aria-label="Homepage banner slides">
              {banners.map((banner, index) => (
                <button
                  key={`${banner.url}-dot-${index}`}
                  type="button"
                  className="carousel-dot"
                  aria-label={`Show banner ${index + 1}`}
                  aria-current={index === activeHeroIndex ? 'true' : undefined}
                  onClick={() => setActiveHeroIndex(index)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {error && (
        <p className="mx-auto mt-16 max-w-7xl px-5 text-sm text-accent-deep lg:px-8">{error}</p>
      )}

      {collectionSections.map((section) => <CollectionSection key={section.title} {...section} />)}

      <section className="mx-auto mt-24 max-w-7xl px-5 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['COD', 'Cash on delivery nationwide. Pay the rider when your order arrives.'],
            ['240 GSM', 'Dense, structured cotton that holds its shape wash after wash.'],
            ['Ready to ship', 'Orders are prepared carefully for secure packing and nationwide delivery.'],
            ['2 = Free', 'Add any two pieces and shipping is on us, anywhere in the Philippines.']
          ].map(([title, body]) => (
            <CustomerCard key={title} className="p-6">
              <p className="display text-3xl text-accent">{title}</p>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{body}</p>
            </CustomerCard>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-7xl px-5 lg:px-8">
        <div className="border-t border-[var(--customer-border)] pt-6">
          <p className="eyebrow">Don't overthink it</p>
          <p className="display mt-2 max-w-3xl text-3xl leading-tight sm:text-5xl">
            Pick a shirt. We deliver. <span className="text-accent">You pay at the door.</span>
          </p>
          <CustomerButton as={Link} to="/faq" variant="secondary" className="mt-8">How COD works</CustomerButton>
        </div>
      </section>
    </div>
  );
}
