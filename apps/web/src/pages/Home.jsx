import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProducts, fetchSiteContent } from '../lib/api.js';
import { DEFAULT_STOREFRONT_SETTINGS, loadStorefrontSettings } from '../lib/storeSettings.js';
import { buildStorefrontCollectionSections } from '../lib/storefrontCollections.js';
import ProductCard from '../components/ProductCard.jsx';

function CollectionSection({ id, index, title, blurb, products }) {
  if (!products.length) return null;
  return (
    <section id={id} className="mx-auto mt-20 max-w-7xl px-5 lg:px-8">
      <div className="hairline flex flex-wrap items-end justify-between gap-4 pt-6">
        <div>
          <p className="eyebrow">{index} / Collection</p>
          <h2 className="display mt-2 text-3xl sm:text-5xl">{title}</h2>
        </div>
        <p className="max-w-xs text-sm text-ink-soft">{blurb}</p>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
        {products.map((product, i) => (
          <ProductCard key={product.id} product={product} index={i} />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [products, setProducts] = useState([]);
  const [banners, setBanners] = useState([]);
  const [collectionNames, setCollectionNames] = useState(DEFAULT_STOREFRONT_SETTINGS.storefrontCollections);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProducts()
      .then((body) => setProducts(body.products))
      .catch((err) => setError(err.message));
    fetchSiteContent()
      .then((body) => setBanners(body.siteContent?.homepageBanners || []))
      .catch(() => {});
    loadStorefrontSettings()
      .then((settings) => setCollectionNames(settings.storefrontCollections || DEFAULT_STOREFRONT_SETTINGS.storefrontCollections));
  }, []);

  const collectionSections = buildStorefrontCollectionSections(products, collectionNames);

  return (
    <div className="pb-4">
      <section className="grain relative flex min-h-[520px] items-center justify-center overflow-hidden bg-ink px-5 py-20 text-center text-paper sm:min-h-[620px] lg:px-8">
        {banners.map((banner, index) => (
          <img
            key={`${banner.url}-${index}`}
            src={banner.url}
            alt={index === activeHeroIndex ? banner.altText || 'Maria Clara Clothing' : ''}
            aria-hidden={index !== activeHeroIndex}
            className={`hero-slide absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${index === activeHeroIndex ? 'opacity-100' : 'opacity-0'}`}
          />
        ))}
        <div className="absolute inset-0 bg-ink/55" />
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center">
          <p className="eyebrow reveal reveal-1 text-accent">Philippine streetwear · est. Imus, Cavite</p>
          <h1 className="display reveal reveal-2 mt-4 text-5xl leading-[0.95] sm:text-7xl lg:text-8xl">
            100%<br />Pure<br /><span className="text-accent">Cotton</span>
          </h1>
          <p className="reveal reveal-3 mt-6 max-w-sm text-sm leading-relaxed text-paper/80">
            Oversized and crop-box tees in 240 GSM premium cotton. Pay cash when it
            arrives — free shipping when you grab two.
          </p>
          <div className="reveal reveal-4 mt-8 flex flex-wrap justify-center gap-3">
            <a href="#new-arrivals" className="btn-ink !bg-accent hover:!bg-accent-deep">Shop new arrivals</a>
            <a href="#freedom-of-mind" className="btn-ghost !border-paper/40 !text-paper hover:!border-accent hover:!text-accent">Freedom of Mind</a>
          </div>
          {banners.length > 1 && (
            <div className="mt-10 flex items-center justify-center" aria-label="Homepage banner slides">
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
        <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-3">
          {[
            ['COD', 'Cash on delivery, nationwide. We text to confirm before anything ships.'],
            ['240 GSM', 'Dense, structured cotton that holds its shape wash after wash.'],
            ['2 = Free', 'Add any two pieces and shipping is on us, anywhere in the Philippines.']
          ].map(([title, body]) => (
            <div key={title} className="bg-paper p-8">
              <p className="display text-3xl text-accent">{title}</p>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-7xl px-5 lg:px-8">
        <div className="hairline pt-6">
          <p className="eyebrow">Don't overthink it</p>
          <p className="display mt-2 max-w-3xl text-3xl leading-tight sm:text-5xl">
            Pick a shirt. We deliver. <span className="text-accent">You pay at the door.</span>
          </p>
          <Link to="/faq" className="btn-ghost mt-8">How COD works</Link>
        </div>
      </section>
    </div>
  );
}
