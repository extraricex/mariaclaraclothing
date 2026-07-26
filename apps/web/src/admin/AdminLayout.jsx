import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { fetchSiteContent } from '../lib/api.js';
import { adminJson, adminLogout } from '../lib/adminApi.js';

const ORDER_SUBNAV = [
  { to: '/admin/orders', label: 'All orders', end: true },
  { to: '/admin/orders/draft', label: 'Draft' },
  { to: '/admin/orders/abandoned-checkout', label: 'Abandoned Checkout' }
];

const PRODUCT_SUBNAV = [
  { to: '/admin/products', label: 'All products', end: true },
  { to: '/admin/collections', label: 'Collections' },
  { to: '/admin/products/countdown', label: 'Product page countdown' },
  { to: '/admin/inventory', label: 'Inventory' }
];

const REVIEW_NAV_ITEM = { to: '/admin/reviews', label: 'Reviews', badge: 'reviews' };
const ANALYTICS_NAV_ITEM = { to: '/admin/analytics', label: 'Conversion overview', end: true };
const CONVERSION_FUNNEL_NAV_ITEM = { to: '/admin/analytics/funnel', label: 'Conversion funnel' };
const CHECKOUT_ISSUES_NAV_ITEM = { to: '/admin/analytics/checkout-issues', label: 'Checkout issues' };
const META_RECONCILIATION_NAV_ITEM = { to: '/admin/analytics/meta-reconciliation', label: 'Meta reconciliation' };
const SEO_NAV_ITEM = { to: '/admin/marketing/seo', label: 'Marketing · SEO' };

// Items below the two collapsible sections, in display order.
const SECONDARY_NAV = [
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/payments', label: 'Payments' },
  { to: '/admin/discounts', label: 'Discounts' },
  { to: '/admin/issue-reports', label: 'Issue Reports', badge: 'issues' },
  { to: '/admin/banners', label: 'Website content' },
  { to: '/admin/pancake', label: 'Pancake POS' },
  { to: '/admin/settings', label: 'Settings' }
];

// Flat list for the mobile bar — identical order to the desktop sidebar.
const MOBILE_NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  ANALYTICS_NAV_ITEM,
  CONVERSION_FUNNEL_NAV_ITEM,
  CHECKOUT_ISSUES_NAV_ITEM,
  META_RECONCILIATION_NAV_ITEM,
  SEO_NAV_ITEM,
  REVIEW_NAV_ITEM,
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/products', label: 'Products' },
  ...SECONDARY_NAV
];

const topLinkClass = (active) =>
  `text-action rounded-[var(--radius-admin)] px-3 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${
    active ? 'bg-[var(--admin-panel-soft)] text-[var(--admin-text)] shadow-[inset_3px_0_0_var(--admin-orange)]' : 'text-[var(--admin-muted)] hover:bg-[var(--admin-panel)] hover:text-[var(--admin-text)]'
  }`;

const subLinkClass = (isActive) =>
  `text-action block cursor-pointer rounded-md border-l-2 px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.08em] transition-colors hover:border-accent ${
    isActive
      ? 'border-[var(--admin-orange)] text-[var(--admin-orange)]'
      : 'border-transparent text-[var(--admin-muted)] hover:text-[var(--admin-text)]'
  }`;

function Chevron({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [adminLogo, setAdminLogo] = useState(null);
  const [ordersMenuOpen, setOrdersMenuOpen] = useState(false);
  const [productsMenuOpen, setProductsMenuOpen] = useState(false);
  const [issueCount, setIssueCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  const ordersActive = location.pathname.startsWith('/admin/orders');
  const productsActive =
    location.pathname.startsWith('/admin/products') ||
    location.pathname.startsWith('/admin/collections') ||
    location.pathname.startsWith('/admin/inventory');

  useEffect(() => {
    adminJson('/api/admin/session')
      .then(() => setReady(true))
      .catch(() => {});
  }, [navigate]);

  useEffect(() => {
    fetchSiteContent()
      .then((body) => setAdminLogo(body.siteContent?.logo || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    adminJson('/api/admin/issue-reports/counts')
      .then((body) => setIssueCount(Number(body.counts?.new || 0)))
      .catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    const refreshReviews = () => adminJson('/api/admin/reviews/counts')
      .then((body) => { if (active) setReviewCount(Number(body.counts?.pending || 0)); })
      .catch(() => {});
    refreshReviews();
    const timer = window.setInterval(refreshReviews, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [location.pathname]);

  function navBadge(item) {
    return item.badge === 'issues' ? issueCount : item.badge === 'reviews' ? reviewCount : 0;
  }

  // Auto-expand the section that matches the current route so the active
  // sub-page is always visible without an extra click.
  useEffect(() => {
    if (ordersActive) setOrdersMenuOpen(true);
    if (productsActive) setProductsMenuOpen(true);
  }, [ordersActive, productsActive]);

  if (!ready) {
    return <div className="p-10 text-sm text-clay">Checking session…</div>;
  }

  const brandMarkup = adminLogo?.url ? (
    <img src={adminLogo.url} alt={adminLogo.altText || 'Maria Clara Clothing'} className="max-h-14 max-w-36 object-contain brightness-0 invert" />
  ) : (
    <span className="display text-lg">Maria<span className="text-accent">Clara</span></span>
  );

  return (
    <div className="admin-shell">
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r bg-[var(--admin-sidebar)] px-5 py-8 lg:sticky lg:top-0 lg:flex lg:h-screen" style={{ borderColor: 'var(--admin-line)' }}>
        <Link to="/admin" className="flex min-h-14 items-center gap-3">
          <span className="admin-brand-mark">MC</span>
          <span className="min-w-0">{brandMarkup}</span>
        </Link>
        <p className="eyebrow mt-3">Admin operations</p>
        <nav className="mt-10 flex flex-col gap-1">
          <NavLink to="/admin" end className={({ isActive }) => topLinkClass(isActive)}>
            Dashboard
          </NavLink>

          <NavLink to={ANALYTICS_NAV_ITEM.to} end={ANALYTICS_NAV_ITEM.end} className={({ isActive }) => topLinkClass(isActive)}>
            {ANALYTICS_NAV_ITEM.label}
          </NavLink>

          <NavLink to={CONVERSION_FUNNEL_NAV_ITEM.to} className={({ isActive }) => topLinkClass(isActive)}>
            {CONVERSION_FUNNEL_NAV_ITEM.label}
          </NavLink>

          <NavLink to={CHECKOUT_ISSUES_NAV_ITEM.to} className={({ isActive }) => topLinkClass(isActive)}>
            {CHECKOUT_ISSUES_NAV_ITEM.label}
          </NavLink>

          <NavLink to={META_RECONCILIATION_NAV_ITEM.to} className={({ isActive }) => topLinkClass(isActive)}>
            {META_RECONCILIATION_NAV_ITEM.label}
          </NavLink>

          <NavLink to={SEO_NAV_ITEM.to} className={({ isActive }) => topLinkClass(isActive)}>
            {SEO_NAV_ITEM.label}
          </NavLink>

          <NavLink to={REVIEW_NAV_ITEM.to} className={({ isActive }) => topLinkClass(isActive)}>
            <span className="flex items-center justify-between gap-2">
              <span>{REVIEW_NAV_ITEM.label}</span>
              {navBadge(REVIEW_NAV_ITEM) > 0 && <span className="rounded-full bg-accent-deep px-2 py-0.5 text-[10px] text-white">{navBadge(REVIEW_NAV_ITEM)}</span>}
            </span>
          </NavLink>

          <div>
            <button
              type="button"
              className={`text-action flex w-full items-center justify-between rounded-[var(--radius-admin)] px-3 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${ordersActive ? 'bg-[var(--admin-panel-soft)] text-[var(--admin-orange)]' : 'text-[var(--admin-muted)] hover:bg-[var(--admin-panel)] hover:text-[var(--admin-text)]'}`}
              aria-label={ordersMenuOpen ? 'Collapse orders menu' : 'Expand orders menu'}
              aria-expanded={ordersMenuOpen}
              onClick={() => setOrdersMenuOpen((open) => !open)}
            >
              <span>Orders</span>
              <Chevron open={ordersMenuOpen} />
            </button>
            {ordersMenuOpen && (
              <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l pl-3" style={{ borderColor: 'var(--admin-line)' }}>
                {ORDER_SUBNAV.map((item) => (
                  <NavLink key={item.label} to={item.to} end={item.end} className={({ isActive }) => subLinkClass(isActive)}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              className={`text-action flex w-full items-center justify-between rounded-[var(--radius-admin)] px-3 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${productsActive ? 'bg-[var(--admin-panel-soft)] text-[var(--admin-orange)]' : 'text-[var(--admin-muted)] hover:bg-[var(--admin-panel)] hover:text-[var(--admin-text)]'}`}
              aria-label={productsMenuOpen ? 'Collapse products menu' : 'Expand products menu'}
              aria-expanded={productsMenuOpen}
              onClick={() => setProductsMenuOpen((open) => !open)}
            >
              <span>Products</span>
              <Chevron open={productsMenuOpen} />
            </button>
            {productsMenuOpen && (
              <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l pl-3" style={{ borderColor: 'var(--admin-line)' }}>
                {PRODUCT_SUBNAV.map((subitem) => (
                  <NavLink key={subitem.label} to={subitem.to} end={subitem.end} className={({ isActive }) => subLinkClass(isActive)}>
                    {subitem.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {SECONDARY_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => topLinkClass(isActive)}>
              <span className="flex items-center justify-between gap-2">
                <span>{item.label}</span>
                {navBadge(item) > 0 && <span className="rounded-full bg-accent-deep px-2 py-0.5 text-[10px] text-white">{navBadge(item)}</span>}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3 pt-10">
          <Link to="/" className="text-action block text-xs uppercase tracking-[0.12em] text-[var(--admin-muted)] hover:text-[var(--admin-orange)]">← View store</Link>
          <button
            type="button"
            className="text-action text-xs uppercase tracking-[0.12em] text-[var(--admin-muted)] hover:text-[var(--admin-orange)]"
            onClick={async () => {
              try { await adminLogout(); } catch (_error) { /* redirect still clears the UI session */ }
              navigate('/admin/login');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <div className="admin-topbar">
          <div>
            <p className="eyebrow">Maria Clara Clothing</p>
            <p className="text-sm font-semibold text-[var(--admin-text)]">Operations console</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="btn-secondary !border-[var(--admin-line)] !bg-[var(--admin-panel)] !text-[var(--admin-text)]">View store</Link>
            <button
              type="button"
              className="btn-secondary !border-[var(--admin-line)] !bg-[var(--admin-panel)] !text-[var(--admin-text)]"
              onClick={async () => {
                try { await adminLogout(); } catch (_error) { /* redirect still clears the UI session */ }
                navigate('/admin/login');
              }}
            >
              Sign out
            </button>
          </div>
        </div>
        <div className="admin-mobile-nav">
          {MOBILE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `text-action whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.1em] ${isActive ? 'text-[var(--admin-orange)]' : 'text-[var(--admin-muted)]'}`}
            >
              {item.label}{navBadge(item) > 0 ? ` (${navBadge(item)})` : ''}
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
