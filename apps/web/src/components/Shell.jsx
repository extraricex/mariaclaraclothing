import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { cartQuantity, useCart } from '../lib/cart.js';
import { fetchSiteContent } from '../lib/api.js';

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

function CartIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-bag" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1a2.5 2.5 0 0 1 2.5 2.5V4h-5v-.5A2.5 2.5 0 0 1 8 1m3.5 3v-.5a3.5 3.5 0 1 0-7 0V4H1v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4zM2 5h12v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export default function Shell() {
  const items = useCart();
  const count = cartQuantity(items);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logo, setLogo] = useState(null);

  useEffect(() => {
    fetchSiteContent()
      .then((body) => setLogo(body.siteContent?.logo || null))
      .catch(() => {});
  }, []);

  const logoMarkup = logo?.url ? (
    <img src={logo.url} alt={logo.altText || 'Maria Clara Clothing'} className="h-[65px] max-w-[205px] object-contain lg:h-[73px] lg:max-w-[230px]" />
  ) : (
    <span className="display text-[45px] tracking-tight lg:text-[49px]">
      Maria<span className="text-accent">Clara</span>
    </span>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Ticker />
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

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-24 bg-ink text-paper">
        <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
          {logo?.url ? (
            <div className="inline-flex bg-paper p-3">
              <img src={logo.url} alt={logo.altText || 'Maria Clara Clothing'} className="max-h-20 max-w-64 object-contain" />
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
