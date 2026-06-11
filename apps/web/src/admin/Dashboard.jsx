import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminJson } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';

const GRAFANA_URL = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3001';
const GRAFANA_DASHBOARD = 'd-solo/maria-clara-overview/maria-clara-store-overview';
const GRAFANA_PANELS = [
  { id: 1, title: 'Revenue' },
  { id: 2, title: 'Orders per day' },
  { id: 3, title: 'Order status' },
  { id: 4, title: 'Top products' }
];

function StatCard({ label, value, hint, to }) {
  const body = (
    <div className="border border-line bg-paper p-5 transition-colors hover:border-ink">
      <p className="eyebrow">{label}</p>
      <p className="display mt-2 text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-clay">{hint}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [grafanaUp, setGrafanaUp] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminJson('/api/admin/products')
      .then((body) => setSummary(body.summary))
      .catch((err) => setError(err.message));
    adminJson('/api/admin/orders')
      .then((body) => setOrders(body.orders))
      .catch(() => {});
    // no-cors: Grafana sends no CORS headers, but an opaque response still
    // proves it is reachable; only a network failure rejects.
    fetch(`${GRAFANA_URL}/api/health`, { mode: 'no-cors' })
      .then(() => setGrafanaUp(true))
      .catch(() => setGrafanaUp(false));
  }, []);

  const codQueue = orders.filter((order) => order.codConfirmationStatus === 'pending' && order.status !== 'cancelled').length;
  const jntQueue = orders.filter((order) => order.jntExportStatus === 'ready').length;
  const revenueCents = orders
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + Number(order.totalCents || 0), 0);

  return (
    <div>
      <p className="eyebrow">Dashboard</p>
      <h1 className="display mt-1 text-3xl">Store overview</h1>
      {error && <p className="mt-4 text-sm text-accent-deep">{error}</p>}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue (all orders)" value={formatMoney(revenueCents)} hint="Excludes cancelled" />
        <StatCard label="Needs COD confirmation" value={codQueue} hint="Text these customers" to="/admin/orders" />
        <StatCard label="Ready for J&T export" value={jntQueue} to="/admin/orders" />
        <StatCard
          label="Low stock products"
          value={summary ? summary.lowStock : '—'}
          hint={summary ? `${summary.soldOut} sold out · ${summary.active} active` : ''}
          to="/admin/products"
        />
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Analytics (Grafana)</h2>
          <a href={`${GRAFANA_URL}/d/maria-clara-overview`} target="_blank" rel="noopener noreferrer" className="text-xs uppercase tracking-[0.12em] text-accent underline">
            Open full dashboard ↗
          </a>
        </div>
        {grafanaUp ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {GRAFANA_PANELS.map((panel) => (
              <iframe
                key={panel.id}
                title={panel.title}
                src={`${GRAFANA_URL}/${GRAFANA_DASHBOARD}?orgId=1&panelId=${panel.id}&theme=light`}
                className="h-64 w-full border border-line bg-paper"
                loading="lazy"
              />
            ))}
          </div>
        ) : (
          <p className="mt-4 border border-line bg-paper p-5 text-sm text-ink-soft">
            Grafana is not reachable at <code className="text-accent-deep">{GRAFANA_URL}</code>. Start the Docker stack
            (<code>docker compose up</code>) to get revenue and order analytics backed by PostgreSQL.
            The cards above are computed live from the API instead.
          </p>
        )}
      </div>
    </div>
  );
}
