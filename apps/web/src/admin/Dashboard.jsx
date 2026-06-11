import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminJson } from '../lib/adminApi.js';
import { formatPeso } from '../lib/money.js';

const PANEL = 'rounded-sm border border-[#2c3036] bg-[#181b1f] p-4';
const PANEL_TITLE = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9fa7b3]';
const STATUS_COLORS = {
  received: '#f2cc0c',
  confirmed: '#73bf69',
  packed: '#5794f2',
  shipped: '#b877d9',
  delivered: '#37872d',
  cancelled: '#c4162a'
};
const COD_COLORS = {
  pending: '#f2cc0c',
  confirmed: '#73bf69',
  unreachable: '#ff780a',
  cancelled: '#c4162a'
};

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function lastNDays(n) {
  const days = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    days.push(dayKey(date));
  }
  return days;
}

function Stat({ title, value, sub, color = '#e8590c' }) {
  return (
    <div className={PANEL}>
      <p className={PANEL_TITLE}>{title}</p>
      <p className="mt-2 text-3xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="mt-1 text-xs text-[#6e7680]">{sub}</p>}
    </div>
  );
}

function BarChart({ title, points }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const barWidth = 100 / points.length;
  return (
    <div className={PANEL}>
      <p className={PANEL_TITLE}>{title}</p>
      <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="mt-3 h-44 w-full">
        {[0.25, 0.5, 0.75].map((line) => (
          <line key={line} x1="0" x2="100" y1={40 - line * 38} y2={40 - line * 38} stroke="#2c3036" strokeWidth="0.3" />
        ))}
        {points.map((point, index) => {
          const height = (point.value / max) * 38;
          return (
            <rect
              key={point.label}
              x={index * barWidth + barWidth * 0.15}
              y={40 - height}
              width={barWidth * 0.7}
              height={height}
              fill="#e8590c"
              opacity={point.value ? 1 : 0.15}
            >
              <title>{`${point.label}: ${point.value}`}</title>
            </rect>
          );
        })}
        <line x1="0" x2="100" y1="40" y2="40" stroke="#2c3036" strokeWidth="0.5" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[#6e7680]">
        <span>{points[0]?.label}</span>
        <span>max {max}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function Donut({ title, slices }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  let offset = 25;
  return (
    <div className={PANEL}>
      <p className={PANEL_TITLE}>{title}</p>
      <div className="mt-3 flex items-center gap-5">
        <svg viewBox="0 0 42 42" className="h-36 w-36 shrink-0 -rotate-90">
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="#24272c" strokeWidth="7" />
          {total > 0 && slices.map((slice) => {
            const fraction = (slice.value / total) * 100;
            const circle = (
              <circle
                key={slice.label}
                cx="21" cy="21" r="15.9" fill="none"
                stroke={slice.color} strokeWidth="7"
                strokeDasharray={`${fraction} ${100 - fraction}`}
                strokeDashoffset={offset}
              >
                <title>{`${slice.label}: ${slice.value}`}</title>
              </circle>
            );
            offset -= fraction;
            return circle;
          })}
        </svg>
        <ul className="space-y-1.5 text-xs">
          {slices.map((slice) => (
            <li key={slice.label} className="flex items-center gap-2 text-[#ccccdc]">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: slice.color }} />
              {slice.label}
              <strong className="ml-auto pl-4">{slice.value}</strong>
            </li>
          ))}
          {!total && <li className="text-[#6e7680]">No data yet</li>}
        </ul>
      </div>
    </div>
  );
}

function FunnelBars({ title, rows }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className={PANEL}>
      <p className={PANEL_TITLE}>{title}</p>
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="flex justify-between text-xs text-[#ccccdc]">
              <span className="uppercase tracking-[0.08em]">{row.label}</span>
              <strong>{row.value}</strong>
            </div>
            <div className="mt-1 h-3 rounded-sm bg-[#24272c]">
              <div className="h-3 rounded-sm" style={{ width: `${(row.value / max) * 100}%`, background: row.color }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DataTable({ title, columns, rows, empty, linkTo }) {
  return (
    <div className={PANEL}>
      <div className="flex items-baseline justify-between">
        <p className={PANEL_TITLE}>{title}</p>
        {linkTo && <Link to={linkTo} className="text-[11px] text-[#e8590c] hover:underline">View all →</Link>}
      </div>
      <table className="mt-3 w-full text-left text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.1em] text-[#6e7680]">
            {columns.map((column) => <th key={column} className="pb-2 pr-3 font-semibold">{column}</th>)}
          </tr>
        </thead>
        <tbody className="text-[#ccccdc]">
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-[#24272c]">
              {row.map((cell, i) => <td key={i} className="py-2 pr-3">{cell}</td>)}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={columns.length} className="py-4 text-[#6e7680]">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard() {
  const [orders, setOrders] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    adminJson('/api/admin/orders')
      .then(async (body) => {
        setOrders(body.orders);
        // Build "top products" from the most recent order details (small store —
        // bounded fan-out keeps this cheap without a dedicated analytics endpoint).
        const recent = body.orders.slice(0, 25);
        const details = await Promise.all(recent.map((order) =>
          adminJson(`/api/admin/orders/${encodeURIComponent(order.orderNumber)}`).catch(() => null)
        ));
        const tally = new Map();
        details.forEach((detail) => {
          if (detail?.order?.status === 'cancelled') return;
          (detail?.order?.items || []).forEach((item) => {
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
          .slice(0, 8));
      })
      .catch((err) => setError(err.message));
    adminJson('/api/admin/products?stock=low_stock')
      .then((body) => setLowStock(body.products))
      .catch(() => {});
  }, []);

  const active = useMemo(() => orders.filter((order) => order.status !== 'cancelled'), [orders]);
  const revenueCents = active.reduce((sum, order) => sum + Number(order.totalCents || 0), 0);
  const codPending = orders.filter((order) => order.codConfirmationStatus === 'pending' && order.status !== 'cancelled').length;
  const jntReady = orders.filter((order) => order.jntExportStatus === 'ready').length;

  const ordersPerDay = useMemo(() => {
    const counts = new Map();
    active.forEach((order) => {
      if (!order.placedAt) return;
      const key = dayKey(new Date(order.placedAt));
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return lastNDays(30).map((day) => ({ label: day.slice(5), value: counts.get(day) || 0 }));
  }, [active]);

  const statusSlices = useMemo(() => Object.entries(STATUS_COLORS)
    .map(([status, color]) => ({
      label: status,
      color,
      value: orders.filter((order) => order.status === status).length
    }))
    .filter((slice) => slice.value > 0), [orders]);

  const codRows = useMemo(() => Object.entries(COD_COLORS).map(([stage, color]) => ({
    label: stage,
    color,
    value: orders.filter((order) => order.codConfirmationStatus === stage).length
  })), [orders]);

  return (
    <div className="-m-5 min-h-full bg-[#111217] p-5 lg:-m-10 lg:p-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#e8590c]">Dashboard</p>
          <h1 className="display mt-1 text-3xl text-[#e6e8eb]">Store overview</h1>
        </div>
        <p className="text-xs text-[#6e7680]">Live from store API · last 30 days</p>
      </div>
      {error && <p className="mt-4 text-sm text-[#ff780a]">{error}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Revenue (excl. cancelled)" value={formatPeso(revenueCents)} sub={`${active.length} orders`} />
        <Stat title="Needs COD confirmation" value={codPending} sub="Text these customers" color="#f2cc0c" />
        <Stat title="Ready for J&T export" value={jntReady} color="#73bf69" />
        <Stat title="Low stock products" value={lowStock.length} sub="≤ 12 pieces left" color="#ff780a" />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <BarChart title="Orders per day" points={ordersPerDay} />
        <Donut title="Order status breakdown" slices={statusSlices} />
        <FunnelBars title="COD confirmation funnel" rows={codRows} />
        <DataTable
          title="Top products by quantity sold"
          columns={['Product', 'Qty', 'Revenue']}
          rows={topProducts.map((product) => [product.name, product.quantity, formatPeso(product.revenueCents)])}
          empty="No completed orders yet."
        />
      </div>

      <div className="mt-3">
        <DataTable
          title="Low stock (≤ 12 pieces total)"
          columns={['Product', 'Status', 'Stock left']}
          rows={lowStock.map((product) => [product.name, product.status, product.inventoryQuantity])}
          empty="Nothing is running low."
          linkTo="/admin/products"
        />
      </div>
    </div>
  );
}
