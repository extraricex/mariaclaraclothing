import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { CART_DRAWER_EVENT, cartQuantity, getCartSessionId, removeFromCart, updateQuantity, useCart } from '../lib/cart.js';
import { useCustomerLoggedIn } from '../lib/customerAuth.js';
import { createCheckoutQuote, fetchActivePromoNotification, fetchProducts, fetchSiteContent } from '../lib/api.js';
import { formatMoney } from '../lib/money.js';
import { setMetaTrackingConsent, trackFacebookInitiateCheckout } from '../lib/metaPixel.js';
import { applySeoTags, loadStorefrontSettings } from '../lib/storeSettings.js';
import { freeShippingOffer, selectNewArrivalRecommendation } from '../lib/storefrontSupport.js';
import useModalFocus from '../hooks/useModalFocus.js';
import PageTransition from './PageTransition.jsx';

const TICKER_ITEMS = [
  'Free shipping on 2+ items',
  'Cash on delivery nationwide',
  '240 GSM premium cotton',
  'Ships via J&T Express'
];

const NAV_LINKS = [
  { to: '/', label: 'Shop' },
  { to: '/faq', label: 'FAQ' },
  { to: '/shipping-returns', label: 'Shipping & Returns' },
  { to: '/terms', label: 'Terms' }
];
const FREE_SHIPPING_OFFER_DISMISSED = 'maria-clara-free-shipping-offer-dismissed';
const RECOMMENDATION_DISMISSED = 'maria-clara-new-arrival-recommendation-dismissed';

function Ticker({ items }) {
  const sequence = [...items, ...items, ...items];
  return (
    <div className="overflow-hidden bg-ink py-2 text-paper">
      <div className="ticker-track flex w-max gap-10">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 gap-10" aria-hidden={copy === 1}>
            {sequence.map((item, index) => (
              <span key={index} className="flex items-center gap-10 text-[11px] font-semibold uppercase tracking-[0.22em]">
                {item}
                <span className="text-accent">✺</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function promoDismissalKey(notification) {
  return `maria-clara-promo-notification-dismissed:${notification?.promoId || 'current'}`;
}

function PromoNotification({ notification, onClose }) {
  if (!notification) return null;
  return (
    <div className="promo-notification border-b border-accent/30 bg-accent/10 text-ink">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-2.5 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] leading-relaxed">
          {notification.text}
        </p>
        <button
          type="button"
          className="text-action touch-target shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-accent-deep hover:text-ink"
          aria-label="Close promo notification"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function PrivacyDialog({ onChoice, onClose }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/35 p-4 sm:items-center" role="presentation">
      <div className="w-full max-w-lg border border-line bg-paper p-5 shadow-2xl" role="dialog" aria-modal="true" aria-label="Privacy choices">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Privacy choices</p>
            <p className="mt-1 text-sm text-ink-soft">Allow optional Meta analytics to help us measure store visits and purchases. The store works without it.</p>
          </div>
          <button type="button" className="text-action text-xs uppercase tracking-[0.12em] text-clay hover:text-ink" onClick={onClose}>Close</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-ink !px-5 !py-2 text-xs" onClick={() => onChoice('accepted')}>Allow analytics</button>
          <button type="button" className="btn-ghost !px-5 !py-2 text-xs" onClick={() => onChoice('declined')}>Decline</button>
        </div>
      </div>
    </div>
  );
}

function FreeShippingAside({ offer, onClose }) {
  if (!offer) return null;
  return (
    <aside className="relative border border-paper/30 bg-ink p-3.5 text-paper shadow-2xl sm:p-4" aria-label="Free shipping offer">
      <button type="button" className="absolute right-2 top-2 h-8 w-8 text-paper/60 hover:text-paper" aria-label="Close free shipping offer" onClick={onClose}>×</button>
      <p className="pr-7 text-xs font-bold uppercase tracking-[0.13em]">{offer.title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-paper/70">{offer.body}</p>
      {offer.state !== 'unlocked' && <a href="/#new-arrivals" className="text-action mt-3 inline-block text-[11px] font-semibold uppercase tracking-[0.14em] underline">Shop now</a>}
    </aside>
  );
}

function ProductRecommendation({ product, onClose, onNavigate }) {
  if (!product) return null;
  const image = product.images[0];
  return (
    <aside className="relative flex items-center gap-3 border border-line bg-paper p-2.5 shadow-2xl" aria-label="You may also like">
      <Link to={`/product/${encodeURIComponent(product.slug)}`} className="flex min-w-0 flex-1 items-center gap-3" onClick={onNavigate}>
        <img
          src={image.url}
          alt={image.altText || product.name}
          className="product-photo-blend h-16 w-14 shrink-0 object-contain sm:h-[4.5rem] sm:w-16"
          loading="lazy"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-clay">You may also like</span>
          <span className="mt-1 block truncate text-xs font-semibold">{product.name}</span>
          <span className="mt-1 block text-[11px] font-semibold">{formatMoney(product.priceCents)} · <span className="underline">View</span></span>
        </span>
      </Link>
      <button type="button" className="absolute right-1 top-1 h-8 w-8 text-clay hover:text-ink" aria-label="Close product recommendation" onClick={onClose}>×</button>
    </aside>
  );
}

function OfferDock({ offer, product, offerCount, mobileOffersOpen, dockRef, onToggle, onNavigate, onCloseOffer, onCloseProduct }) {
  if (!offerCount) return null;
  return (
    <div ref={dockRef} className="pointer-events-none fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-2 z-[45] w-[min(15rem,calc(100vw-5.5rem))] sm:bottom-4 sm:left-4 sm:w-72">
      <div id="storefront-offer-cards" className={`${mobileOffersOpen ? 'grid' : 'hidden'} pointer-events-auto mb-2 gap-2 sm:grid`}>
        <ProductRecommendation product={product} onClose={onCloseProduct} onNavigate={onNavigate} />
        <FreeShippingAside offer={offer} onClose={onCloseOffer} />
      </div>
      <button
        type="button"
        className="pointer-events-auto inline-flex h-11 items-center rounded-full bg-ink px-4 text-[10px] font-bold uppercase tracking-[0.13em] text-paper shadow-2xl sm:hidden"
        aria-expanded={mobileOffersOpen}
        aria-controls="storefront-offer-cards"
        onClick={onToggle}
      >
        Offers · {offerCount}
      </button>
    </div>
  );
}

function MessengerSupportLink({ href }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-2 z-[45] flex h-11 items-center gap-2 rounded-full border border-paper/30 bg-ink px-3 text-paper shadow-2xl transition-transform hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:bottom-4 sm:right-4 sm:h-14 sm:gap-3 sm:px-4"
      aria-label="Chat Support — open Messenger"
      title="Chat Support — open Messenger"
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.11em]"><span className="hidden sm:inline">Chat Support</span><span className="sm:hidden">Chat</span></span>
      <svg viewBox="0 0 24 24" className="h-5 w-5 sm:h-7 sm:w-7" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 9.2 9.2 0 0 1-3.8-.8L3 21l1.4-4.4A8.2 8.2 0 0 1 3 12C3 7.3 7 4 12 4s9 3 9 7.5Z" />
        <path d="m7.5 14 3-3 2.3 2 3.7-3" />
      </svg>
    </a>
  );
}

function CartIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-bag" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1a2.5 2.5 0 0 1 2.5 2.5V4h-5v-.5A2.5 2.5 0 0 1 8 1m3.5 3v-.5a3.5 3.5 0 1 0-7 0V4H1v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4zM2 5h12v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function CartDrawer({ items, quote, quoteError, open, onClose }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  useModalFocus({ open, containerRef: dialogRef, initialFocusRef: closeButtonRef, onClose });

  const subtotal = items.reduce((sum, item) => sum + Number(item.unitPriceCents || 0) * Number(item.quantity || 0), 0);
  const displaySubtotal = quote?.subtotalCents ?? subtotal;
  const displayDiscount = quote?.discountTotalCents ?? 0;
  const displayShipping = quote?.shippingFeeCents;
  const displayTotal = quote?.totalCents ?? Math.max(0, displaySubtotal - displayDiscount);

  function checkout() {
    trackFacebookInitiateCheckout(
      items,
      quote || { subtotalCents: displaySubtotal, totalCents: displayTotal },
      `checkout:${getCartSessionId()}`
    );
    onClose();
  }

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <button
        type="button"
        tabIndex={-1}
        className={`absolute inset-0 bg-ink/35 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
        aria-label="Close cart drawer"
        onClick={onClose}
      />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        inert={open ? undefined : ''}
        tabIndex={-1}
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-paper shadow-2xl transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="eyebrow">Cart</p>
            <h2 id="cart-drawer-title" className="display text-3xl">Your cart</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="touch-target inline-flex items-center text-sm font-semibold uppercase tracking-[0.14em] text-clay hover:text-ink" onClick={onClose}>
            Close
          </button>
        </div>

        {!items.length ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="display text-3xl">Your cart is empty</p>
            <button type="button" className="btn-ink mt-6" onClick={onClose}>Continue shopping</button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5">
              {quoteError && <p className="mt-4 border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent-deep">{quoteError}</p>}
              <div className="divide-y divide-line">
                {items.map((item) => (
                  <article key={item.variantId} className="flex gap-4 py-5">
                    <Link
                      to={`/product/${encodeURIComponent(item.slug || String(item.productId).replace(/^catalog-/, ''))}`}
                      className="aspect-[4/5] w-16 shrink-0 self-start overflow-hidden bg-cream sm:w-20"
                      onClick={onClose}
                    >
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="product-photo-blend block h-full w-full object-contain"
                          loading="lazy"
                        />
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold leading-snug">{item.productName}</h3>
                          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-clay">Size {item.size}</p>
                        </div>
                        <p className="text-sm font-semibold">{formatMoney(Number(item.unitPriceCents) * Number(item.quantity))}</p>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center border border-line">
                          <button type="button" className="touch-target px-3 py-1.5" aria-label="Decrease quantity" onClick={() => updateQuantity(item.variantId, Number(item.quantity) - 1)}>−</button>
                          <span className="min-w-8 text-center text-sm">{item.quantity}</span>
                          <button type="button" className="touch-target px-3 py-1.5" aria-label="Increase quantity" onClick={() => updateQuantity(item.variantId, Number(item.quantity) + 1)}>+</button>
                        </div>
                        <button type="button" className="text-xs uppercase tracking-[0.12em] text-clay underline hover:text-accent" onClick={() => removeFromCart(item.variantId)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="border-t border-line px-5 py-5">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd>{formatMoney(displaySubtotal)}</dd></div>
                {displayDiscount > 0 && <div className="flex justify-between text-[#2f7d32]"><dt>Discount</dt><dd>-{formatMoney(displayDiscount)}</dd></div>}
                <div className="flex justify-between"><dt className="text-ink-soft">Shipping</dt><dd>{quote?.freeShippingUnlocked ? 'Free' : 'Calculated at checkout'}</dd></div>
                <div className="flex justify-between border-t border-line pt-3 text-base font-semibold"><dt>Total</dt><dd>{formatMoney(displayTotal)}</dd></div>
              </dl>
              <div className="mt-5 grid gap-2">
                <Link to="/checkout" className="btn-ink text-center" onClick={checkout}>Checkout</Link>
                <Link to="/cart" className="btn-ghost text-center" onClick={onClose}>View cart</Link>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export default function Shell() {
  const location = useLocation();
  const items = useCart();
  const count = cartQuantity(items);
  const loggedIn = useCustomerLoggedIn();
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [headerLogo, setHeaderLogo] = useState(null);
  const [footerLogo, setFooterLogo] = useState(null);
  const [storeInfo, setStoreInfo] = useState(null);
  const [promoNotification, setPromoNotification] = useState(null);
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [mobileOffersOpen, setMobileOffersOpen] = useState(false);
  const [recommendationDismissed, setRecommendationDismissed] = useState(() => {
    try {
      return window.sessionStorage.getItem(RECOMMENDATION_DISMISSED) === 'true';
    } catch (_error) {
      return false;
    }
  });
  const [freeShippingOfferDismissed, setFreeShippingOfferDismissed] = useState(() => {
    try {
      return window.sessionStorage.getItem(FREE_SHIPPING_OFFER_DISMISSED) === 'true';
    } catch (_error) {
      return false;
    }
  });
  const menuButtonRef = useRef(null);
  const offerDockRef = useRef(null);
  const closeCartDrawer = useCallback(() => setCartDrawerOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function handleMenuKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        window.requestAnimationFrame(() => menuButtonRef.current?.focus());
      }
    }
    document.addEventListener('keydown', handleMenuKeyDown);
    return () => document.removeEventListener('keydown', handleMenuKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    function loadSiteContent() {
      fetchSiteContent()
        .then((body) => {
          setHeaderLogo(body.siteContent?.logo || null);
          setFooterLogo(body.siteContent?.footerLogo || body.siteContent?.logo || null);
        })
        .catch(() => {});
    }

    loadSiteContent();
    window.addEventListener('maria-clara-site-content-changed', loadSiteContent);
    return () => window.removeEventListener('maria-clara-site-content-changed', loadSiteContent);
  }, []);

  useEffect(() => {
    loadStorefrontSettings().then(setStoreInfo);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((body) => {
        if (!cancelled) setRecommendation(selectNewArrivalRecommendation(body.products));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMobileOffersOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOffersOpen) return undefined;
    function closeMobileOffers(event) {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && offerDockRef.current?.contains(event.target)) return;
      setMobileOffersOpen(false);
    }
    document.addEventListener('keydown', closeMobileOffers);
    document.addEventListener('pointerdown', closeMobileOffers);
    return () => {
      document.removeEventListener('keydown', closeMobileOffers);
      document.removeEventListener('pointerdown', closeMobileOffers);
    };
  }, [mobileOffersOpen]);

  useEffect(() => {
    let cancelled = false;
    fetchActivePromoNotification()
      .then((body) => {
        if (cancelled) return;
        const notification = body.notification || null;
        if (!notification) {
          setPromoNotification(null);
          return;
        }
        if (window.sessionStorage.getItem(promoDismissalKey(notification)) === 'true') {
          setPromoNotification(null);
          return;
        }
        setPromoNotification(notification);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applySeoTags(storeInfo?.seo);
  }, [storeInfo]);

  useEffect(() => {
    function openDrawer() {
      setCartDrawerOpen(true);
    }

    window.addEventListener(CART_DRAWER_EVENT, openDrawer);
    return () => window.removeEventListener(CART_DRAWER_EVENT, openDrawer);
  }, []);

  useEffect(() => {
    if (!cartDrawerOpen || !items.length) {
      setQuote(null);
      setQuoteError('');
      return;
    }
    let cancelled = false;
    createCheckoutQuote({ cartSessionId: getCartSessionId(), items })
      .then((body) => {
        if (cancelled) return;
        setQuote(body.quote || null);
        setQuoteError('');
      })
      .catch((error) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [cartDrawerOpen, items]);

  const logoMarkup = headerLogo?.url ? (
    <img src={headerLogo.url} alt={headerLogo.altText || 'Maria Clara Clothing'} className="h-[65px] max-w-[205px] object-contain lg:h-[73px] lg:max-w-[230px]" />
  ) : (
    <span className="display truncate text-[32px] tracking-tight sm:text-[40px] lg:text-[49px]">
      Maria<span className="text-accent">Clara</span>
    </span>
  );

  function closePromoNotification() {
    if (promoNotification) {
      window.sessionStorage.setItem(promoDismissalKey(promoNotification), 'true');
    }
    setPromoNotification(null);
  }

  function chooseTrackingConsent(value) {
    setMetaTrackingConsent(value);
    setPrivacyDialogOpen(false);
  }

  function dismissFreeShippingOffer() {
    setFreeShippingOfferDismissed(true);
    try {
      window.sessionStorage.setItem(FREE_SHIPPING_OFFER_DISMISSED, 'true');
    } catch (_error) {
      // Keep the current-page dismissal even when storage is unavailable.
    }
  }

  function dismissRecommendation() {
    setRecommendationDismissed(true);
    try {
      window.sessionStorage.setItem(RECOMMENDATION_DISMISSED, 'true');
    } catch (_error) {
      // Keep the current-page dismissal even when storage is unavailable.
    }
  }

  const shippingOffer = freeShippingOffer(storeInfo?.shipping, count);
  const visibleShippingOffer = freeShippingOfferDismissed ? null : shippingOffer;
  const visibleRecommendation = recommendationDismissed ? null : recommendation;
  const offerCount = Number(Boolean(visibleShippingOffer)) + Number(Boolean(visibleRecommendation));

  return (
    <div className="flex min-h-screen flex-col">
      <Ticker items={storeInfo?.ticker || TICKER_ITEMS} />
      <PromoNotification notification={promoNotification} onClose={closePromoNotification} />
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl min-w-0 items-center justify-between gap-2 px-4 py-4 sm:gap-4 sm:px-5 lg:gap-6 lg:px-8">
          <button
            ref={menuButtonRef}
            type="button"
            className="text-action touch-target text-[12px] font-semibold uppercase tracking-[0.18em] lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="storefront-mobile-menu"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
          <Link to="/" className="flex min-w-0 shrink items-center lg:shrink-0">
            {logoMarkup}
          </Link>
          <nav className="hidden items-center gap-8 lg:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `text-[12px] font-semibold uppercase tracking-[0.18em] transition-colors text-action hover:text-accent ${isActive ? 'text-accent' : 'text-ink'}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-6">
          <Link to={loggedIn ? '/account' : '/login'} className="text-action hidden text-[12px] font-semibold uppercase tracking-[0.18em] hover:text-accent sm:block">
            {loggedIn ? 'Account' : 'Log in'}
          </Link>
          <Link to="/cart" className="relative flex h-9 w-9 items-center justify-center hover:text-accent" aria-label="Cart">
            <CartIcon />
            {count > 0 && (
              <span className="absolute -right-4 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-paper">
                {count}
              </span>
            )}
          </Link>
          </div>
        </div>
        {menuOpen && (
          <nav id="storefront-mobile-menu" className="flex flex-col border-t border-line lg:hidden">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className="text-action border-b border-line px-5 py-4 text-[13px] font-semibold uppercase tracking-[0.18em]"
              >
                {link.label}
              </NavLink>
            ))}
            <NavLink
              to={loggedIn ? '/account' : '/login'}
              onClick={() => setMenuOpen(false)}
              className="text-action border-b border-line px-5 py-4 text-[13px] font-semibold uppercase tracking-[0.18em] text-accent"
            >
              {loggedIn ? 'My account' : 'Log in / Register'}
            </NavLink>
          </nav>
        )}
      </header>

      <CartDrawer
        items={items}
        quote={quote}
        quoteError={quoteError}
        open={cartDrawerOpen}
        onClose={closeCartDrawer}
      />

      <OfferDock
        offer={visibleShippingOffer}
        product={visibleRecommendation}
        offerCount={offerCount}
        mobileOffersOpen={mobileOffersOpen}
        dockRef={offerDockRef}
        onToggle={() => setMobileOffersOpen((open) => !open)}
        onNavigate={() => setMobileOffersOpen(false)}
        onCloseOffer={dismissFreeShippingOffer}
        onCloseProduct={dismissRecommendation}
      />
      <MessengerSupportLink href={storeInfo?.messengerUrl} />
      {privacyDialogOpen && <PrivacyDialog onChoice={chooseTrackingConsent} onClose={() => setPrivacyDialogOpen(false)} />}

      <main className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>

      <footer className="mt-24 bg-ink text-paper">
        <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
          {footerLogo?.url ? (
            <div className="inline-flex">
              <img src={footerLogo.url} alt={footerLogo.altText || 'Maria Clara Clothing'} className="max-h-20 max-w-64 object-contain brightness-0 invert" />
            </div>
          ) : (
            <p className="display text-4xl leading-none sm:text-6xl lg:text-7xl">
              Maria<span className="text-accent">Clara</span>
            </p>
          )}
          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            <div>
              <p className="eyebrow text-paper/60">Shop</p>
              <ul className="mt-3 space-y-2 text-sm text-paper/80">
                <li><Link to="/" className="text-action hover:text-accent">All products</Link></li>
                <li><Link to="/cart" className="text-action hover:text-accent">Cart</Link></li>
              </ul>
            </div>
            <div>
              <p className="eyebrow text-paper/60">Help</p>
              <ul className="mt-3 space-y-2 text-sm text-paper/80">
                <li><Link to="/faq" className="text-action hover:text-accent">FAQ</Link></li>
                <li><Link to="/shipping-returns" className="text-action hover:text-accent">Shipping & returns</Link></li>
                <li><Link to="/terms" className="text-action hover:text-accent">Terms of service</Link></li>
              </ul>
            </div>
            <div>
              <p className="eyebrow text-paper/60">Promise</p>
              <p className="mt-3 max-w-xs text-sm text-paper/80">
                Premium 240 GSM cotton, cut oversized. Cash on delivery anywhere in the Philippines —
                we text before we ship.
              </p>
              {storeInfo && (storeInfo.contactEmail || storeInfo.contactNumber) && (
                <ul className="mt-4 space-y-1 text-sm text-paper/80">
                  {storeInfo.contactEmail && (
                    <li><a className="text-action hover:text-accent" href={`mailto:${storeInfo.contactEmail}`}>{storeInfo.contactEmail}</a></li>
                  )}
                  {storeInfo.contactNumber && <li>{storeInfo.contactNumber}</li>}
                </ul>
              )}
              {storeInfo && Object.values(storeInfo.socialLinks || {}).some(Boolean) && (
                <ul className="mt-3 flex gap-4 text-sm text-paper/80">
                  {Object.entries(storeInfo.socialLinks).filter(([, url]) => url).map(([name, url]) => (
                    <li key={name}>
                      <a className="text-action capitalize hover:text-accent" href={url} target="_blank" rel="noreferrer">{name}</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-paper/20 pt-6 text-xs uppercase tracking-[0.18em] text-paper/50">
            <p>© {new Date().getFullYear()} Maria Clara Clothing · Philippine streetwear</p>
            <button type="button" className="text-action hover:text-accent" onClick={() => setPrivacyDialogOpen(true)}>Privacy choices</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
