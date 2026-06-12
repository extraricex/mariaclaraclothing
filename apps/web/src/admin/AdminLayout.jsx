import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { fetchSiteContent } from '../lib/api.js';
import { adminJson, clearAdminToken, getAdminToken } from '../lib/adminApi.js';

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/collections', label: 'Collections' },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/discounts', label: 'Discounts' },
  { to: '/admin/banners', label: 'Website content' },
  { to: '/admin/settings', label: 'Settings' }
];

const ORDER_SUBNAV = [
  { to: '/admin/orders/draft', label: 'Draft' },
  { to: '/admin/orders/abandoned-checkout', label: 'Abandoned Checkout' }
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [adminLogo, setAdminLogo] = useState(null);
  const [ordersMenuOpen, setOrdersMenuOpen] = useState(true);

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
    <div className="flex min-h-screen bg-cream">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-paper px-5 py-8 lg:flex">
        <Link to="/admin" className="flex min-h-14 items-center">{brandMarkup}</Link>
        <p className="eyebrow mt-1">Admin</p>
        <nav className="mt-10 flex flex-col gap-1">
          <div>
            <div className="flex items-stretch">
              <NavLink
                to="/admin/orders"
                className={({ isActive }) =>
                  `flex-1 px-3 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                    isActive || location.pathname.startsWith('/admin/orders') ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-cream'
                  }`}
              >
                Orders
              </NavLink>
              <button
                type="button"
                className={`border-l border-paper/20 px-3 text-[13px] font-semibold transition-colors ${
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
              <div className="ml-4 border-l border-line py-1">
                {ORDER_SUBNAV.map((item) => (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    className={({ isActive }) =>
                      `block px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] ${
                        isActive ? 'text-accent-deep' : 'text-clay hover:text-accent'
                      }`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-3 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                  isActive ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-cream'
                }`}
            >
              {item.label}
            </NavLink>
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
      <div className="flex-1 overflow-x-hidden">
        <div className="flex items-center gap-4 border-b border-line bg-paper px-5 py-3 lg:hidden">
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
        <main className="p-5 lg:p-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
