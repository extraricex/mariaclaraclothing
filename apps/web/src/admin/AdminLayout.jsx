import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { adminJson, clearAdminToken, getAdminToken } from '../lib/adminApi.js';

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/collections', label: 'Collections' },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/discounts', label: 'Discounts' },
  { to: '/admin/banners', label: 'Website content' },
  { to: '/admin/settings', label: 'Settings' }
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getAdminToken()) {
      navigate('/admin/login', { replace: true });
      return;
    }
    adminJson('/api/admin/session')
      .then(() => setReady(true))
      .catch(() => {});
  }, [navigate]);

  if (!ready) {
    return <div className="p-10 text-sm text-clay">Checking session…</div>;
  }

  return (
    <div className="flex min-h-screen bg-cream">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-paper px-5 py-8 lg:flex">
        <Link to="/admin" className="display text-lg">Maria<span className="text-accent">Clara</span></Link>
        <p className="eyebrow mt-1">Admin</p>
        <nav className="mt-10 flex flex-col gap-1">
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
          {NAV.map((item) => (
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
