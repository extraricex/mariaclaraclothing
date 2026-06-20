import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
<<<<<<< Updated upstream
import { cartQuantity, useCart } from '../lib/cart.js';
import { fetchSiteContent } from '../lib/api.js';
=======
import { CART_DRAWER_EVENT, cartQuantity, removeFromCart, updateQuantity, useCart } from '../lib/cart.js';
import { useCustomerLoggedIn } from '../lib/customerAuth.js';
import { fetchActivePromoNotification, fetchSiteContent, quoteCart } from '../lib/api.js';
import { formatMoney } from '../lib/money.js';
import { applySeoTags, loadStorefrontSettings } from '../lib/storeSettings.js';
>>>>>>> Stashed changes

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

function Ticker() {
  const sequence = [...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS];
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
          className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-accent-deep hover:text-ink"
          aria-label="Close promo notification"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
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
  const subtotal = items.reduce((sum, item) => sum + Number(item.unitPriceCents || 0) * Number(item.quantity || 0), 0);
  const displaySubtotal = quote?.subtotalCents ?? subtotal;
  const displayDiscount = quote?.discountTotalCents ?? 0;
  const displayShipping = quote?.shippingFeeCents ?? 0;
  const displayTotal = quote?.totalCents ?? Math.max(0, displaySubtotal - displayDiscount + displayShipping);

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <button
        type="button"
        className={`absolute inset-0 bg-ink/35 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
        aria-label="Close cart drawer"
        onClick={onClose}
      />
      <aside className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-paper shadow-2xl transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="eyebrow">Cart</p>
            <h2 className="display text-3xl">Your cart</h2>
          </div>
          <button type="button" className="text-sm font-semibold uppercase tracking-[0.14em] text-clay hover:text-ink" onClick={onClose}>
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
                    <Link to={`/product/${encodeURIComponent(item.slug || String(item.productId).replace(/^catalog-/, ''))}`} className="h-24 w-18 shrink-0 overflow-hidden bg-cream" onClick={onClose}>
                      {item.imageUrl && <img src={item.imageUrl} alt={item.productName} className="h-full w-full object-cover" loading="lazy" />}
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
                          <button type="button" className="px-3 py-1.5" aria-label="Decrease quantity" onClick={() => updateQuantity(item.variantId, Number(item.quantity) - 1)}>−</button>
                          <span className="min-w-8 text-center text-sm">{item.quantity}</span>
                          <button type="button" className="px-3 py-1.5" aria-label="Increase quantity" onClick={() => updateQuantity(item.variantId, Number(item.quantity) + 1)}>+</button>
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
                <div className="flex justify-between"><dt className="text-ink-soft">Shipping</dt><dd>{quote?.freeShippingUnlocked ? 'Free' : formatMoney(displayShipping)}</dd></div>
                <div className="flex justify-between border-t border-line pt-3 text-base font-semibold"><dt>Total</dt><dd>{formatMoney(displayTotal)}</dd></div>
              </dl>
              <div className="mt-5 grid gap-2">
                <Link to="/checkout" className="btn-ink text-center" onClick={onClose}>Checkout</Link>
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
  const items = useCart();
  const count = cartQuantity(items);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [headerLogo, setHeaderLogo] = useState(null);
  const [footerLogo, setFooterLogo] = useState(null);
<<<<<<< Updated upstream
=======
  const [storeInfo, setStoreInfo] = useState(null);
  const [promoNotification, setPromoNotification] = useState(null);
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
=======
  useEffect(() => {
    loadStorefrontSettings().then(setStoreInfo);
  }, []);

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
    quoteCart({ items, shippingFeeCents: 0 })
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

>>>>>>> Stashed changes
  const logoMarkup = headerLogo?.url ? (
    <img src={headerLogo.url} alt={headerLogo.altText || 'Maria Clara Clothing'} className="h-[65px] max-w-[205px] object-contain lg:h-[73px] lg:max-w-[230px]" />
  ) : (
    <span className="display text-[45px] tracking-tight lg:text-[49px]">
      Maria<span className="text-accent">Clara</span>
    </span>
  );

  function closePromoNotification() {
    if (promoNotification) {
      window.sessionStorage.setItem(promoDismissalKey(promoNotification), 'true');
    }
    setPromoNotification(null);
  }

  return (
    <div className="flex min-h-screen flex-col">
<<<<<<< Updated upstream
      <Ticker />
=======
      <Ticker items={storeInfo?.ticker || TICKER_ITEMS} />
      <PromoNotification notification={promoNotification} onClose={closePromoNotification} />
>>>>>>> Stashed changes
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 lg:px-8">
          <button
            type="button"
            className="text-[12px] font-semibold uppercase tracking-[0.18em] lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
          <Link to="/" className="flex shrink-0 items-center">
            {logoMarkup}
          </Link>
          <nav className="hidden items-center gap-8 lg:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `text-[12px] font-semibold uppercase tracking-[0.18em] transition-colors hover:text-accent ${isActive ? 'text-accent' : 'text-ink'}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/cart" className="relative flex h-9 w-9 items-center justify-center hover:text-accent" aria-label="Cart">
            <CartIcon />
            {count > 0 && (
              <span className="absolute -right-4 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-paper">
                {count}
              </span>
            )}
          </Link>
        </div>
        {menuOpen && (
          <nav className="flex flex-col border-t border-line lg:hidden">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className="border-b border-line px-5 py-4 text-[13px] font-semibold uppercase tracking-[0.18em]"
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <CartDrawer
        items={items}
        quote={quote}
        quoteError={quoteError}
        open={cartDrawerOpen}
        onClose={() => setCartDrawerOpen(false)}
      />

      <main className="flex-1">
        <Outlet />
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
                <li><Link to="/" className="hover:text-accent">All products</Link></li>
                <li><Link to="/cart" className="hover:text-accent">Cart</Link></li>
              </ul>
            </div>
            <div>
              <p className="eyebrow text-paper/60">Help</p>
              <ul className="mt-3 space-y-2 text-sm text-paper/80">
                <li><Link to="/faq" className="hover:text-accent">FAQ</Link></li>
                <li><Link to="/shipping-returns" className="hover:text-accent">Shipping & returns</Link></li>
                <li><Link to="/terms" className="hover:text-accent">Terms of service</Link></li>
              </ul>
            </div>
            <div>
              <p className="eyebrow text-paper/60">Promise</p>
              <p className="mt-3 max-w-xs text-sm text-paper/80">
                Premium 240 GSM cotton, cut oversized. Cash on delivery anywhere in the Philippines —
                we text before we ship.
              </p>
            </div>
          </div>
          <p className="mt-12 border-t border-paper/20 pt-6 text-xs uppercase tracking-[0.18em] text-paper/50">
            © {new Date().getFullYear()} Maria Clara Clothing · Philippine streetwear
          </p>
        </div>
      </footer>
    </div>
  );
}
