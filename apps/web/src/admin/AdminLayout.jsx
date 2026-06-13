import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { fetchSiteContent } from '../lib/api.js';
import { adminJson, clearAdminToken, getAdminToken } from '../lib/adminApi.js';

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/discounts', label: 'Discounts' },
  { to: '/admin/banners', label: 'Website content' },
  { to: '/admin/settings', label: 'Settings' }
];

const ORDER_SUBNAV = [
  { to: '/admin/orders/draft', label: 'Draft' },
  { to: '/admin/orders/abandoned-checkout', label: 'Abandoned Checkout' }
];

const PRODUCT_SUBNAV = [
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/collections', label: 'Collections' },
  { to: '/admin/inventory', label: 'Inventory' }
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [adminLogo, setAdminLogo] = useState(null);
  const [ordersMenuOpen, setOrdersMenuOpen] = useState(false);
  const [productsMenuOpen, setProductsMenuOpen] = useState(false);

  useEffect(() => {
    if (!getAdminToken()) {
      navigate('/admin/login', { replace: true });
      return;
    }
    adminJson('/api/admin/session')
      .then(() => setReady(true))
      .catch(() => {});
  }, [navigate]);

  useEffect(() => {
    fetchSiteContent()
      .then((body) => setAdminLogo(body.siteContent?.logo || null))
      .catch(() => {});
  }, []);

  if (!ready) {
    return <div className="p-10 text-sm text-clay">Checking session…</div>;
  }

  const brandMarkup = adminLogo?.url ? (
    <img src={adminLogo.url} alt={adminLogo.altText || 'Maria Clara Clothing'} className="max-h-14 max-w-36 object-contain" />
  ) : (
    <span className="display text-lg">Maria<span className="text-accent">Clara</span></span>
  );

  return (
    <div className="admin-shell">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-paper px-5 py-8 lg:flex">
        <Link to="/admin" className="flex min-h-14 items-center">{brandMarkup}</Link>
        <p className="eyebrow mt-1">Admin</p>
        <nav className="mt-10 flex flex-col gap-1">
          <div>
            <div className="flex items-stretch">
              <NavLink
                to="/admin/orders"
                className={({ isActive }) =>
                  `flex-1 rounded-l-[var(--radius-admin)] px-3 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                    isActive || location.pathname.startsWith('/admin/orders') ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-cream'
                  }`}
              >
                Orders
              </NavLink>
              <button
                type="button"
                className={`rounded-r-[var(--radius-admin)] border-l border-paper/20 px-3 text-[13px] font-semibold transition-colors ${
                  location.pathname.startsWith('/admin/orders') ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-cream'
                }`}
                aria-label={ordersMenuOpen ? 'Collapse orders menu' : 'Expand orders menu'}
                aria-expanded={ordersMenuOpen}
                onClick={() => setOrdersMenuOpen((open) => !open)}
              >
                {ordersMenuOpen ? '-' : '+'}
              </button>
            </div>
            {ordersMenuOpen && (
              <div className="ml-4 flex flex-col gap-1 border-l border-line py-2 pl-2">
                {ORDER_SUBNAV.map((item) => (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    className={({ isActive }) =>
                      `block cursor-pointer rounded-md border px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                        isActive
                          ? 'border-accent bg-accent text-paper shadow-sm'
                          : 'border-line bg-paper text-ink-soft hover:border-accent hover:bg-cream hover:text-accent-deep'
                      }`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
          {NAV.map((item) => (
            item.to === '/admin/products' ? (
              <div key={item.to}>
                <div className="flex items-stretch">
                  <NavLink
                    to="/admin/products"
                    className={({ isActive }) =>
                      `flex-1 rounded-l-[var(--radius-admin)] px-3 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                        isActive || location.pathname.startsWith('/admin/products') || location.pathname.startsWith('/admin/collections') || location.pathname.startsWith('/admin/inventory')
                          ? 'bg-ink text-paper'
                          : 'text-ink-soft hover:bg-cream'
                      }`}
                  >
                    Products
                  </NavLink>
                  <button
                    type="button"
                    className={`rounded-r-[var(--radius-admin)] border-l border-paper/20 px-3 text-[13px] font-semibold transition-colors ${
                      location.pathname.startsWith('/admin/products') || location.pathname.startsWith('/admin/collections') || location.pathname.startsWith('/admin/inventory')
                        ? 'bg-ink text-paper'
                        : 'text-ink-soft hover:bg-cream'
                    }`}
                    aria-label={productsMenuOpen ? 'Collapse products menu' : 'Expand products menu'}
                    aria-expanded={productsMenuOpen}
                    onClick={() => setProductsMenuOpen((open) => !open)}
                  >
                    {productsMenuOpen ? '-' : '+'}
                  </button>
                </div>
                {productsMenuOpen && (
                  <div className="ml-4 flex flex-col gap-1 border-l border-line py-2 pl-2">
                    {PRODUCT_SUBNAV.map((subitem) => (
                      <NavLink
                        key={subitem.label}
                        to={subitem.to}
                        className={({ isActive }) =>
                          `block cursor-pointer rounded-md border px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                            isActive
                              ? 'border-accent bg-accent text-paper shadow-sm'
                              : 'border-line bg-paper text-ink-soft hover:border-accent hover:bg-cream hover:text-accent-deep'
                          }`}
                      >
                        {subitem.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-[var(--radius-admin)] px-3 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                    isActive ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-cream'
                  }`}
              >
                {item.label}
              </NavLink>
            )
          ))}
        </nav>
        <div className="mt-auto space-y-3 pt-10">
          <Link to="/" className="block text-xs uppercase tracking-[0.12em] text-clay hover:text-accent">← View store</Link>
          <button
            type="button"
            className="text-xs uppercase tracking-[0.12em] text-clay underline hover:text-accent"
            onClick={() => { clearAdminToken(); navigate('/admin/login'); }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <div className="admin-mobile-nav">
          {NAV.slice(0, 1).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `text-[11px] font-semibold uppercase tracking-[0.1em] ${isActive ? 'text-accent' : 'text-ink-soft'}`}>
              {item.label}
            </NavLink>
          ))}
          <NavLink to="/admin/orders" className={({ isActive }) => `text-[11px] font-semibold uppercase tracking-[0.1em] ${isActive ? 'text-accent' : 'text-ink-soft'}`}>
            Orders
          </NavLink>
          {NAV.slice(1).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `text-[11px] font-semibold uppercase tracking-[0.1em] ${isActive ? 'text-accent' : 'text-ink-soft'}`}>
              {item.label}
            </NavLink>
          ))}
        </div>
        <main className="min-w-0 p-4 sm:p-5 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
