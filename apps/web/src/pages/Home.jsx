import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchProducts, fetchSiteContent } from '../lib/api.js';
import { DEFAULT_STOREFRONT_SETTINGS, loadStorefrontSettings } from '../lib/storeSettings.js';
import { buildStorefrontCollectionSections } from '../lib/storefrontCollections.js';
import ProductCard from '../components/ProductCard.jsx';
import CollectionBanner from '../components/CollectionBanner.jsx';
import { CustomerButton } from '../components/ui/Button.jsx';
import { CustomerCard } from '../components/ui/Card.jsx';
import { recentlyViewedProducts } from '../lib/recentlyViewed.js';
import { preloadResponsiveImage, responsiveImageAttributes } from '../lib/responsiveImage.js';
import SEO from '../components/SEO.jsx';
import { absoluteSeoUrl, storefrontOrigin } from '../lib/seo.js';

function initialHeroBanners() {
  const image = document.querySelector('#seo-fallback .seo-fallback-image');
  const url = image?.getAttribute('src') || '';
  if (!url) return [];
  return [{
    url,
    altText: image.getAttribute('alt') || 'Maria Clara Clothing',
    sortOrder: 0
  }];
}

function CollectionSection({ id, index, title, blurb, slug, products, compactTop = false, eagerImages = false, deferRendering = false }) {
  if (!products.length) return null;
  const visibleProducts = products.slice(0, 8);
  return (
    <section id={id} className={`mx-auto max-w-7xl scroll-mt-36 px-5 lg:px-8 ${deferRendering ? 'storefront-deferred-section' : ''} ${compactTop ? 'mt-4 sm:mt-6 lg:mt-8' : 'mt-8 sm:mt-14 lg:mt-20'}`}>
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
      <div className="storefront-product-grid storefront-product-grid--mobile-two mt-6 sm:mt-8">
        {visibleProducts.map((product, i) => (
          <ProductCard key={product.id} product={product} index={i} eager={eagerImages && i < 4} />
        ))}
      </div>
    </section>
  );
}

function CollectionLoadingSkeleton() {
  return (
    <section className="mx-auto min-h-[95vh] max-w-7xl px-5 pt-8 lg:px-8" aria-busy="true" aria-label="Loading collections">
      <div className="border-t border-[var(--customer-border)] pt-6">
        <div className="h-3 w-24 rounded bg-line" />
        <div className="mt-3 h-9 w-56 max-w-full rounded bg-line" />
      </div>
      <div className="storefront-product-grid storefront-product-grid--mobile-two mt-6">
        {[0, 1, 2, 3].map((item) => <div key={item} className="aspect-[4/5] rounded bg-line/70" />)}
      </div>
    </section>
  );
}

export default function Home() {
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [banners, setBanners] = useState(initialHeroBanners);
  const [collectionBanner, setCollectionBanner] = useState(null);
  const [siteLogo, setSiteLogo] = useState(null);
  const [collections, setCollections] = useState(DEFAULT_STOREFRONT_SETTINGS.collectionDefinitions);
  const [storefrontSettings, setStorefrontSettings] = useState(DEFAULT_STOREFRONT_SETTINGS);
  const [recentProducts, setRecentProducts] = useState([]);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [error, setError] = useState('');
  const heroTouchStartX = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([fetchProducts(), fetchSiteContent(), loadStorefrontSettings()])
      .then(([catalogResult, contentResult, settingsResult]) => {
        if (!active) return;
        if (catalogResult.status === 'fulfilled') setProducts(catalogResult.value.products || []);
        else setError(catalogResult.reason?.message || 'Could not load products.');
        if (contentResult.status === 'fulfilled') {
          setBanners(contentResult.value.siteContent?.homepageBanners || []);
          setCollectionBanner(contentResult.value.siteContent?.collectionBanner || null);
          setSiteLogo(contentResult.value.siteContent?.logo || null);
        }
        if (settingsResult.status === 'fulfilled') {
          setStorefrontSettings(settingsResult.value);
          setCollections(settingsResult.value.collectionDefinitions || DEFAULT_STOREFRONT_SETTINGS.collectionDefinitions);
        }
        setCatalogLoaded(true);
      });
    return () => { active = false; };
  }, []);

  const collectionSections = buildStorefrontCollectionSections(products, collections);
  const activeBanner = banners[activeHeroIndex] || banners[0] || null;
  const heroCopy = storefrontSettings.hero || DEFAULT_STOREFRONT_SETTINGS.hero;
  const onlinePaymentEnabled = storefrontSettings.paymentMethods?.some((method) => method.id === 'paymongo');
  const freeShippingEnabled = Boolean(storefrontSettings.shipping?.freeShippingEnabled);
  const freeShippingMinimumItems = Math.max(1, Number(storefrontSettings.shipping?.freeShippingMinimumItems || 2));
  const seoOrigin = storefrontOrigin();
  const storeName = storefrontSettings.storeName || 'Maria Clara Clothing';
  const socialProfiles = Object.values(storefrontSettings.socialLinks || {})
    .map((url) => absoluteSeoUrl(url, seoOrigin))
    .filter(Boolean);
  const storeLogo = absoluteSeoUrl(siteLogo?.url, seoOrigin);
  const homeStructuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'OnlineStore',
      '@id': `${seoOrigin}/#store`,
      name: storeName,
      url: `${seoOrigin}/`,
      ...(storeLogo ? { logo: storeLogo } : {}),
      ...(storefrontSettings.contactEmail ? { email: storefrontSettings.contactEmail } : {}),
      ...(storefrontSettings.contactNumber ? { telephone: storefrontSettings.contactNumber } : {}),
      ...(storefrontSettings.storeAddress ? { address: { '@type': 'PostalAddress', streetAddress: storefrontSettings.storeAddress, addressCountry: 'PH' } } : {}),
      ...(socialProfiles.length ? { sameAs: socialProfiles } : {})
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${seoOrigin}/#website`,
      name: storeName,
      url: `${seoOrigin}/`,
      publisher: { '@id': `${seoOrigin}/#store` }
    }
  ];

  useEffect(() => {
    setRecentProducts(recentlyViewedProducts(products, { limit: 4 }));
  }, [products]);

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

  useEffect(() => {
    if (banners.length < 2) return undefined;
    const nextBanner = banners[(activeHeroIndex + 1) % banners.length];
    const timer = window.setTimeout(() => {
      const preload = new Image();
      preloadResponsiveImage(preload, nextBanner.url);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [activeHeroIndex, banners]);

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
      {catalogLoaded && (
        <SEO
          title={storefrontSettings.seo?.title}
          description={storefrontSettings.seo?.description}
          canonical="/"
          image={storefrontSettings.seo?.imageUrl || activeBanner?.url}
          imageAlt={activeBanner?.altText || 'Maria Clara Clothing'}
          structuredData={homeStructuredData}
        />
      )}
      <section
        className="customer-hero grain relative -mt-[97px] min-h-[min(58svh,430px)] touch-pan-y overflow-hidden bg-ink text-center text-paper sm:min-h-[min(68svh,560px)] lg:-mt-[105px] lg:min-h-[min(78vh,720px)]"
        onTouchStart={handleHeroTouchStart}
        onTouchEnd={handleHeroTouchEnd}
      >
        <div className="aspect-[2200/825] w-full" aria-hidden="true" />
        <div className="absolute inset-0 overflow-hidden">
          {activeBanner && (
            <img
              key={activeBanner.url}
              src={activeBanner.url}
              alt={activeBanner.altText || 'Maria Clara Clothing'}
              fetchPriority="high"
              loading="eager"
              width="2200"
              height="825"
              {...responsiveImageAttributes(activeBanner.url)}
              className="hero-slide absolute inset-0 h-full w-full object-cover object-center opacity-100 contrast-[1.05] saturate-[1.04]"
            />
          )}
        </div>
        <div className="absolute inset-0 bg-ink/35 sm:bg-ink/40" />
        <div className="absolute inset-0 z-10 flex items-end justify-start px-5 pb-12 pt-28 text-left sm:px-8 sm:pb-16 lg:px-12 lg:pb-20">
          <div className="flex max-w-3xl flex-col items-start">
            <h1 className="display reveal reveal-2 text-[clamp(1.65rem,8vw,2.35rem)] leading-[0.9] sm:text-6xl lg:text-7xl">
              {heroCopy.title}<br /><span className="text-[var(--customer-accent-soft)]">{heroCopy.highlight}</span>
            </h1>
            <p className="reveal reveal-3 mt-3 max-w-xs text-xs leading-relaxed text-paper/85 sm:text-[13px] lg:mt-6 lg:max-w-sm lg:text-sm">
              {heroCopy.subtitle}
            </p>
            <div className="reveal reveal-4 mt-3 flex flex-wrap justify-start sm:mt-8">
              <CustomerButton as="a" href={heroCopy.primaryButtonLink} className="customer-compact-button !bg-accent hover:!bg-accent-deep">{heroCopy.primaryButtonText}</CustomerButton>
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

      {!catalogLoaded && <CollectionLoadingSkeleton />}
      {catalogLoaded && error && (
        <div className="mx-auto min-h-[70vh] max-w-7xl px-5 pt-16 text-sm text-accent-deep lg:px-8" role="alert">{error}</div>
      )}

      {catalogLoaded && !error && collectionSections.map((section, sectionIndex) => {
        const isFreedomOfMind = String(section.slug || '').trim().toLowerCase() === 'freedom-of-mind';
        const hasCollectionBanner = Boolean(isFreedomOfMind && collectionBanner?.visible && collectionBanner?.desktopImage?.url);
        return (
          <Fragment key={section.title}>
            {isFreedomOfMind && <CollectionBanner banner={collectionBanner} />}
            <CollectionSection
              {...section}
              compactTop={hasCollectionBanner}
              eagerImages={sectionIndex === 0}
              deferRendering={sectionIndex > 0}
            />
          </Fragment>
        );
      })}

      {recentProducts.length > 0 && (
        <section className="mx-auto mt-16 max-w-7xl px-5 lg:px-8" aria-labelledby="recently-viewed-heading">
          <div className="flex items-end justify-between gap-4 border-t border-[var(--customer-border)] pt-6">
            <div>
              <p className="eyebrow">Continue browsing</p>
              <h2 id="recently-viewed-heading" className="display mt-2 text-3xl sm:text-5xl">Recently viewed</h2>
            </div>
            <Link to="/shop" className="text-action text-xs font-semibold uppercase tracking-[0.14em] text-accent hover:text-accent-deep">View all</Link>
          </div>
          <div className="storefront-product-grid storefront-product-grid--mobile-two mt-6">
            {recentProducts.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
          </div>
        </section>
      )}

      <section className="storefront-deferred-section mx-auto mt-24 max-w-7xl px-5 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            onlinePaymentEnabled
              ? ['COD + Online', 'Choose Cash on Delivery or continue to secure online checkout through PayMongo.']
              : ['COD', 'Cash on delivery nationwide. Pay the rider when your order arrives.'],
            ['240 GSM', 'A heavier fabric weight with a more structured feel. Check each product page for confirmed material and fit details.'],
            ['Ready to ship', 'Orders are prepared carefully for secure packing and nationwide delivery.'],
            freeShippingEnabled
              ? [`${freeShippingMinimumItems} = Free`, `Add any ${freeShippingMinimumItems} piece${freeShippingMinimumItems === 1 ? '' : 's'} and shipping is on us, anywhere in the Philippines.`]
              : ['Nationwide', 'Your delivery fee is calculated from the address and items in your order.']
          ].map(([title, body]) => (
            <CustomerCard key={title} className="p-6">
              <p className="display text-3xl text-accent">{title}</p>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{body}</p>
            </CustomerCard>
          ))}
        </div>
      </section>

      <section className="storefront-deferred-section mx-auto mt-24 max-w-7xl px-5 lg:px-8">
        <div className="border-t border-[var(--customer-border)] pt-6">
          <p className="eyebrow">Don't overthink it</p>
          <p className="display mt-2 max-w-3xl text-3xl leading-tight sm:text-5xl">
            Pick a shirt. We deliver. <span className="text-accent">Pay cash when it arrives.</span>
          </p>
          <CustomerButton as={Link} to="/faq" variant="secondary" className="mt-8">How payment works</CustomerButton>
        </div>
      </section>
    </div>
  );
}
