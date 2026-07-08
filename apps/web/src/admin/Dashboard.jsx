import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminJson } from '../lib/adminApi.js';
import { formatPeso } from '../lib/money.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = [
  ['today', 'Today'],
  ['last_7_days', 'Last 7 days'],
  ['last_30_days', 'Last 30 days'],
  ['all', 'All time']
];

function Card({ children, className = '' }) {
  return <section className={`admin-panel ${className}`}>{children}</section>;
}

function CardHeader({ title, aside }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--admin-text)]">{title}</h2>
      {aside && <span className="text-xs text-[var(--admin-muted)]">{aside}</span>}
    </div>
  );
}

function filterByRange(orders, range) {
  if (range === 'all') return orders;
  if (range === 'today') {
    const today = new Date().toDateString();
    return orders.filter((order) => order.placedAt && new Date(order.placedAt).toDateString() === today);
  }
  const days = range === 'last_30_days' ? 30 : 7;
  const cutoff = Date.now() - days * DAY_MS;
  return orders.filter((order) => order.placedAt && new Date(order.placedAt).getTime() >= cutoff);
}

function HorizontalBars({ rows }) {
  const max = Math.max(1, ...rows.map(([, value]) => Number(value || 0)));
  return (
    <div className="space-y-2.5">
      {rows.map(([label, value, color = '#171411']) => (
        <div key={label} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3 text-sm">
          <span className="truncate text-xs text-[var(--admin-muted)]">{label}</span>
          <div className="h-2.5 rounded-full bg-[#0b1118]">
            <div className="h-2.5" style={{ width: `${(Number(value) / max) * 100}%`, background: color }} />
          </div>
          <strong className="text-right text-xs">{value}</strong>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [allOrders, setAllOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [range, setRange] = useState('last_7_days');
  const [error, setError] = useState('');

  useEffect(() => {
    adminJson('/api/admin/orders')
      .then(async (body) => {
        setAllOrders(body.orders);
        const recent = body.orders.slice(0, 25);
        const details = await Promise.all(recent.map((order) =>
          adminJson(`/api/admin/orders/${encodeURIComponent(order.orderNumber)}`).catch(() => null)
        ));
        const tally = new Map();
        details.forEach((detail) => {
          if (!detail?.order || detail.order.status === 'cancelled') return;
          (detail.order.items || []).forEach((item) => {
            const key = `${item.productName} · ${item.size}`;
            const entry = tally.get(key) || { quantity: 0, revenueCents: 0 };
            entry.quantity += Number(item.quantity || 0);
            entry.revenueCents += Number(item.quantity || 0) * Number(item.unitPriceCents || 0);
            tally.set(key, entry);
          });
        });
        setTopProducts([...tally.entries()]
          .map(([name, entry]) => ({ name, ...entry }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 6));
      })
      .catch((err) => setError(err.message));
    adminJson('/api/admin/products')
      .then((body) => setProducts(body.products))
      .catch(() => {});
  }, []);

  const orders = useMemo(() => filterByRange(allOrders, range), [allOrders, range]);

  // ---- summary metrics (legacy parity) ----
  const today = new Date().toDateString();
  const todayOrders = allOrders.filter((order) => order.placedAt && new Date(order.placedAt).toDateString() === today);
  const todaySales = todayOrders.reduce((sum, order) => sum + Number(order.totalCents || 0), 0);
  const pendingCod = orders.filter((order) => order.paymentStatus === 'cod_pending' || order.codConfirmationStatus === 'pending').length;
  const unfulfilled = orders.filter((order) => order.fulfillmentStatus === 'unfulfilled').length;
  const shippingCollected = orders.reduce((sum, order) => sum + Number(order.shippingFeeCents || 0), 0);
  const lowStockProducts = products.filter((product) => product.stockStatus === 'low_stock');
  const soldOutProducts = products.filter((product) => product.stockStatus === 'sold_out' || Number(product.inventoryQuantity || 0) <= 0);

  // ---- sales overview ----
  const lastSevenSales = filterByRange(allOrders, 'last_7_days').reduce((sum, order) => sum + Number(order.totalCents || 0), 0);
  const itemCount = orders.reduce((sum, order) => sum + Number(order.itemCount || 0), 0);
  const freeShippingOrders = orders.filter((order) => Number(order.shippingFeeCents || 0) === 0).length;
  const averageOrderValue = orders.length
    ? Math.round(orders.reduce((sum, order) => sum + Number(order.totalCents || 0), 0) / orders.length)
    : 0;

  // ---- today's work ----
  const toPack = orders.filter((order) => order.fulfillmentStatus === 'unfulfilled').length;
  const readyToShip = orders.filter((order) => order.fulfillmentStatus === 'packed' || order.status === 'packed').length;
  const draftProducts = products.filter((product) => product.status && product.status !== 'active').length;

  // ---- sales trend (7 days) ----
  const trend = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(start.getTime() - DAY_MS * (6 - index));
      return {
        key: date.toISOString().slice(0, 10),
        label: new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(date),
        total: 0
      };
    });
    const byDay = new Map(days.map((day) => [day.key, day]));
    allOrders.forEach((order) => {
      if (!order.placedAt) return;
      const key = new Date(order.placedAt).toISOString().slice(0, 10);
      if (byDay.has(key)) byDay.get(key).total += Number(order.totalCents || 0);
    });
    return days;
  }, [allOrders]);
  const trendMax = Math.max(1, ...trend.map((day) => day.total));
  const trendTotal = trend.reduce((sum, day) => sum + day.total, 0);

  // ---- order status / shipping mix rows ----
  const statusRows = [
    ['Pending COD', pendingCod, '#b8860b'],
    ['Unfulfilled', unfulfilled, '#8a7d70'],
    ['Packed', readyToShip, '#5794f2'],
    ['Shipped', orders.filter((order) => order.fulfillmentStatus === 'shipped' || order.deliveryStatus === 'shipped' || order.status === 'shipped').length, '#7048a8'],
    ['Delivered', orders.filter((order) => order.fulfillmentStatus === 'delivered' || order.deliveryStatus === 'delivered' || order.status === 'delivered').length, '#2f7d32'],
    ['Cancelled', orders.filter((order) => order.status === 'cancelled' || order.fulfillmentStatus === 'cancelled').length, '#c01818']
  ];
  const shippingRows = [
    ['Free shipping', freeShippingOrders, '#2f7d32'],
    ['MM / Cavite', orders.filter((order) => Number(order.shippingFeeCents || 0) === 8000).length, '#e8590c'],
    ['Luzon province', orders.filter((order) => Number(order.shippingFeeCents || 0) === 12000).length, '#b8860b'],
    ['Vis / Mindanao', orders.filter((order) => Number(order.shippingFeeCents || 0) === 18000).length, '#5794f2'],
    ['Other fee', orders.filter((order) => ![0, 8000, 12000, 18000].includes(Number(order.shippingFeeCents || 0))).length, '#8a7d70']
  ];

  // ---- inventory health donut ----
  const healthyCount = Math.max(products.length - soldOutProducts.length - lowStockProducts.length - draftProducts, 0);
  const inventorySlices = [
    ['Healthy', healthyCount, '#2f7d32'],
    ['Low stock', lowStockProducts.length, '#b8860b'],
    ['Sold out', soldOutProducts.length, '#c01818'],
    ['Draft/archived', draftProducts, '#8a7d70']
  ];
  const inventoryTotal = Math.max(products.length, 1);

  // ---- lists ----
  const recentOrders = [...allOrders]
    .sort((a, b) => new Date(b.placedAt || 0) - new Date(a.placedAt || 0))
    .slice(0, 8);
  const productAlerts = products
    .filter((product) =>
      product.stockStatus === 'low_stock' ||
      product.stockStatus === 'sold_out' ||
      Number(product.inventoryQuantity || 0) <= 0 ||
      product.status !== 'active' ||
      !product.image)
    .slice(0, 8);

  const summaryCards = [
    ['Orders today', todayOrders.length, 'New storefront orders', '/admin/orders'],
    ['Pending COD', pendingCod, 'Need confirmation', '/admin/orders'],
    ['Unfulfilled', unfulfilled, 'Need fulfillment work', '/admin/orders'],
    ['Sales today', formatPeso(todaySales), 'Confirmed checkout total', '/admin/orders'],
    ['Total shipping fee', formatPeso(shippingCollected), 'From placed orders', '/admin/orders'],
    ['Low-stock products', lowStockProducts.length, 'Limited pieces', '/admin/products'],
    ['Sold-out products', soldOutProducts.length, 'Restock or archive', '/admin/products']
  ];

  const workItems = [
    ['Confirm COD', pendingCod, '/admin/orders'],
    ['Pack orders', toPack, '/admin/orders'],
    ['Ready to ship', readyToShip, '/admin/orders'],
    ['Low stock', lowStockProducts.length, '/admin/products'],
    ['Sold out', soldOutProducts.length, '/admin/products'],
    ['Draft products', draftProducts, '/admin/products']
  ];

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="display mt-1 text-3xl">Store overview</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--admin-muted)]">Live store workload, sales, inventory health, and sync signals in one operations view.</p>
        </div>
        <label className="flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-[var(--admin-muted)]">
          Date range
          <select className="field !w-auto !py-2" value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="mt-4 text-sm text-[var(--admin-red)]">{error}</p>}

      {/* summary cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        {summaryCards.map(([label, value, note, to]) => (
          <Link key={label} to={to} className="admin-metric-card">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</p>
            <p className="display mt-1.5 text-2xl">{value}</p>
            <p className="mt-1 text-[11px] text-[var(--admin-muted)]">{note}</p>
          </Link>
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        {/* today's work */}
        <Card>
          <CardHeader title="Today's work" aside="Action queue" />
          <div className="grid grid-cols-2 gap-2">
            {workItems.map(([label, count, to]) => (
              <Link key={label} to={to} className={`flex items-center justify-between rounded-[var(--radius-admin)] border px-3 py-2.5 text-sm transition-colors hover:border-[var(--admin-orange)] ${count > 0 ? 'border-[var(--admin-yellow)]/50 bg-[var(--admin-yellow)]/10' : 'border-[var(--admin-line)] bg-[#0b1118]'}`}>
                <span className="text-xs">{label}</span>
                <strong className={count > 0 ? 'text-[var(--admin-yellow)]' : ''}>{count}</strong>
              </Link>
            ))}
          </div>
        </Card>

        {/* sales overview */}
        <Card>
          <CardHeader title="Sales overview" aside="Live admin data" />
          <dl className="space-y-2.5 text-sm">
            {[
              ["Today's sales", formatPeso(todaySales)],
              ['Last 7 days sales', formatPeso(lastSevenSales)],
              ['Average order value', formatPeso(averageOrderValue)],
              ['Total items sold', itemCount],
              ['Shipping fee collected', formatPeso(shippingCollected)],
              ['Free shipping orders', freeShippingOrders]
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-[var(--admin-line)] pb-2 last:border-0">
                <dt className="text-[var(--admin-muted)]">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* quick actions */}
        <Card>
          <CardHeader title="Quick actions" aside="Admin shortcuts" />
          <div className="flex flex-col gap-2">
            <Link to="/admin/products/new" className="btn-ink !py-2.5 text-center">Add product</Link>
            <Link to="/admin/orders" className="btn-ghost !py-2.5 text-center">View orders</Link>
            <Link to="/admin/orders" className="btn-ghost !py-2.5 text-center">Export orders to J&T</Link>
            <Link to="/admin/products" className="btn-ghost !py-2.5 text-center">Manage products</Link>
            <Link to="/admin/collections" className="btn-ghost !py-2.5 text-center">Manage collections</Link>
            <Link to="/admin/banners" className="btn-ghost !py-2.5 text-center">Manage homepage banners</Link>
          </div>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        {/* sales trend */}
        <Card>
          <CardHeader title="Sales trend" aside="Last 7 days" />
          <p className="display text-2xl">{formatPeso(trendTotal)} <span className="text-xs font-normal normal-case text-[var(--admin-muted)]">total sales</span></p>
          <div className="mt-4 flex h-36 items-end gap-2" role="img" aria-label="Sales trend for the last 7 days">
            {trend.map((day) => (
              <div key={day.key} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-[var(--admin-orange)] transition-all"
                  style={{ height: `${Math.max(4, (day.total / trendMax) * 100)}%`, opacity: day.total ? 1 : 0.15 }}
                  title={`${day.label}: ${formatPeso(day.total)}`}
                />
                <small className="text-[10px] text-[var(--admin-muted)]">{day.label}</small>
              </div>
            ))}
          </div>
        </Card>

        {/* order status */}
        <Card>
          <CardHeader title="Order status" aside={`${orders.length} orders`} />
          <HorizontalBars rows={statusRows} />
        </Card>

        {/* inventory health */}
        <Card>
          <CardHeader title="Inventory health" aside={`${products.length} products`} />
          <div className="flex items-center gap-6">
            <svg viewBox="0 0 42 42" className="h-32 w-32 shrink-0 -rotate-90">
              <circle cx="21" cy="21" r="15.9" fill="none" stroke="#0b1118" strokeWidth="7" />
              {(() => {
                let offset = 25;
                return inventorySlices.map(([label, value, color]) => {
                  const fraction = (value / inventoryTotal) * 100;
                  const circle = (
                    <circle key={label} cx="21" cy="21" r="15.9" fill="none" stroke={color} strokeWidth="7"
                      strokeDasharray={`${fraction} ${100 - fraction}`} strokeDashoffset={offset}>
                      <title>{`${label}: ${value}`}</title>
                    </circle>
                  );
                  offset -= fraction;
                  return circle;
                });
              })()}
            </svg>
            <ul className="flex-1 space-y-2 text-sm">
              {inventorySlices.map(([label, value, color]) => (
                <li key={label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-[var(--admin-muted)]">{label}</span>
                  <strong className="ml-auto">{value}</strong>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* shipping mix */}
        <Card>
          <CardHeader title="Shipping mix" aside="By shipping fee" />
          <HorizontalBars rows={shippingRows} />
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        {/* recent orders */}
        <Card>
          <CardHeader title="Recent orders" aside={<Link to="/admin/orders" className="text-[var(--admin-orange)] underline">View all</Link>} />
          {recentOrders.length ? (
            <ul className="divide-y divide-[var(--admin-line)]">
              {recentOrders.map((order) => (
                <li key={order.orderNumber}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 py-2.5 text-left text-sm hover:bg-[var(--admin-panel-soft)]"
                    onClick={() => navigate(`/admin/orders/${encodeURIComponent(order.orderNumber)}`)}
                  >
                    <span>
                      <strong className="block">{order.orderNumber}</strong>
                      <small className="text-[var(--admin-muted)]">{order.customerName || 'Customer'}</small>
                    </span>
                    <span className="text-right">
                      <strong className="block">{formatPeso(order.totalCents)}</strong>
                      <small className="text-[var(--admin-muted)]">{order.deliveryMethod || order.shippingRegionLabel || 'Standard shipping'}</small>
                    </span>
                    <span className="admin-status-info">
                      {order.fulfillmentStatus || 'unfulfilled'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[var(--admin-muted)]">No recent orders yet.</p>}
        </Card>

        {/* products needing attention */}
        <Card>
          <CardHeader title="Products needing attention" aside={<Link to="/admin/products" className="text-[var(--admin-orange)] underline">View all</Link>} />
          {productAlerts.length ? (
            <ul className="divide-y divide-[var(--admin-line)]">
              {productAlerts.map((product) => (
                <li key={product.slug}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-4 py-2.5 text-left text-sm hover:bg-[var(--admin-panel-soft)]"
                    onClick={() => navigate(`/admin/products/${encodeURIComponent(product.slug)}`)}
                  >
                    <span className="min-w-0 flex-1">
                      <strong className="block">{product.name}</strong>
                      <small className="text-[var(--admin-muted)]">{product.category || product.collections?.[0] || 'Uncategorized'}</small>
                    </span>
                    <span className="w-28 shrink-0 text-right">
                      <strong className="block">{Number(product.inventoryQuantity || 0)} in stock</strong>
                      <small className="text-[var(--admin-muted)]">{product.status || 'draft'}</small>
                    </span>
                    <span className={`w-28 shrink-0 justify-center ${
                      product.stockStatus === 'sold_out' || Number(product.inventoryQuantity || 0) <= 0
                        ? 'admin-status-bad'
                        : product.stockStatus === 'low_stock'
                          ? 'admin-status-warn'
                          : 'admin-status-info'
                    }`}>
                      {product.stockStatus || product.status || 'review'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[var(--admin-muted)]">No product alerts right now.</p>}
        </Card>
      </div>

      {/* top products */}
      <Card className="mt-3">
        <CardHeader title="Top products by quantity sold" aside="From recent orders" />
        {topProducts.length ? (
          <div className="admin-table-shell">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.1em] text-[var(--admin-muted)]">
                  <th className="p-3 font-semibold">Product</th>
                  <th className="p-3 text-right font-semibold">Qty</th>
                  <th className="p-3 text-right font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product) => (
                  <tr key={product.name} className="border-t border-[var(--admin-line)]">
                    <td className="p-3">{product.name}</td>
                    <td className="p-3 text-right">{product.quantity}</td>
                    <td className="p-3 text-right font-semibold">{formatPeso(product.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-[var(--admin-muted)]">No completed orders yet.</p>}
      </Card>
    </div>
  );
}
