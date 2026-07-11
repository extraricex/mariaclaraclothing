import { useCallback, useEffect, useState } from 'react';
import { adminJson, adminSend } from '../lib/adminApi.js';

const base = '/api/admin/integrations/pancake';
const connectionStatusEndpoint = '/api/admin/integrations/pancake/status';
const testConnectionEndpoint = '/api/admin/integrations/pancake/test-connection';
const display = (value) => value === true ? 'Configured' : value === false ? 'Not configured' : (value === null || value === undefined || value === '' ? 'Not set' : value);

function Metric({ label, value, tone = 'text-[var(--admin-text)]' }) {
  return <div className="admin-metric-card">
    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</p>
    <p className={`mt-2 break-words text-lg font-bold ${tone}`}>{display(value)}</p>
  </div>;
}

function MiniMetric({ label, value, tone = 'text-[var(--admin-text)]' }) {
  return <div className="admin-metric-card px-4 py-3">
    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</p>
    <p className={`mt-1 break-words text-base font-bold ${tone}`}>{display(value)}</p>
  </div>;
}

function StatusPill({ children, tone = 'neutral' }) {
  const tones = {
    good: 'admin-status-good',
    warn: 'admin-status-warn',
    neutral: 'admin-status-info'
  };
  return <span className={tones[tone] || tones.neutral}>{children}</span>;
}

function SelectField({ label, value, items, disabled, onChange }) {
  return <label className="min-w-0 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--admin-muted)]">
    {label}
    <select className="input mt-2 w-full" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select {label.toLowerCase()}</option>
      {items.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}{item.allowCreateOrder === false ? ' - order creation disabled' : ''}</option>)}
    </select>
  </label>;
}

export default function PancakePos() {
  const [pancake, setPancake] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [orderExports, setOrderExports] = useState(null);
  const [references, setReferences] = useState({ shops: [], warehouses: [], orderSources: [] });
  const [selection, setSelection] = useState({ shopId: '', warehouseId: '', orderSourceId: '' });
  const [mappings, setMappings] = useState({ items: [], total: 0 });
  const [search, setSearch] = useState('');
  const [conflictOnly, setConflictOnly] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const loadMappings = useCallback(async (nextSearch = '', nextConflict = false) => {
    const query = new URLSearchParams({ page: '1', pageSize: '50', search: nextSearch, conflictOnly: String(nextConflict) });
    const body = await adminJson(`${base}/catalog/mappings?${query}`);
    setMappings(body.mappings);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [connectionBody, catalogBody, inventoryBody, orderBody, referencesBody] = await Promise.all([
        adminJson(connectionStatusEndpoint),
        adminJson(`${base}/catalog/status`),
        adminJson(`${base}/inventory/status`),
        adminJson(`${base}/orders/status`),
        adminJson(`${base}/references`)
      ]);
      setPancake(connectionBody.pancake);
      setCatalog(catalogBody.catalog);
      setInventory(inventoryBody.inventory);
      setOrderExports(orderBody.orders);
      setReferences(referencesBody.references);
      setSelection({
        shopId: connectionBody.pancake.shopId || '',
        warehouseId: connectionBody.pancake.warehouseId || '',
        orderSourceId: connectionBody.pancake.orderSourceId || ''
      });
      await loadMappings('', false);
      setMessage('');
    } catch (error) {
      setMessage(error.message);
    }
  }, [loadMappings]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function run(action, work) {
    setBusy(action);
    setMessage('');
    try {
      await work();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  const testConnection = () => run('connection', async () => {
    const body = await adminSend('POST', testConnectionEndpoint, {});
    setPancake(body.pancake);
    setMessage(`Connection status: ${body.pancake.healthStatus.replaceAll('_', ' ')}.`);
  });

  const importCatalog = () => run('import', async () => {
    const body = await adminSend('POST', `${base}/catalog/import`, {});
    setCatalog(body.catalog);
    await loadAll();
    setMessage(body.catalog.status === 'complete' ? 'Read-only Pancake catalog import completed.' : `Catalog status: ${body.catalog.status.replaceAll('_', ' ')}.`);
  });

  const saveSelection = () => run('selection', async () => {
    await adminSend('PUT', `${base}/references/selection`, selection);
    await loadAll();
    setMessage('Pancake reference selection saved. Import the catalog again to verify mapping.');
  });

  const syncInventory = () => run('inventory', async () => {
    const body = await adminSend('POST', `${base}/inventory/reconcile`, {});
    setInventory(body.inventory);
    await loadAll();
    setMessage(body.inventory.status === 'complete' ? 'Inventory sync completed from Pancake warehouse stock.' : `Inventory sync status: ${body.inventory.status.replaceAll('_', ' ')}.`);
  });

  const buildShadowOrders = () => run('orders', async () => {
    const body = await adminSend('POST', `${base}/orders/shadow-build`, {});
    setOrderExports(body.orders);
    await loadAll();
    setMessage(body.orders.status === 'complete' ? 'Order sync check completed.' : `Order sync status: ${body.orders.status.replaceAll('_', ' ')}.`);
  });

  const refreshStatus = () => run('refresh', loadAll);

  const summary = catalog?.summary || {};
  const inventorySummary = inventory?.summary || {};
  const orderSummary = orderExports?.summary || {};
  const hasCatalogConflict = Number(summary.conflictCount || 0) > 0;
  const hasInventoryConflict = Number(inventorySummary.conflictCount || 0) > 0;
  const hasOrderIssue = Number(orderSummary.failedCount || 0) > 0 || Number(orderSummary.blockedCount || 0) > 0;
  const healthTone = hasCatalogConflict || hasInventoryConflict || hasOrderIssue ? 'warn' : 'good';
  const syncBusy = Boolean(busy);

  return <div className="min-w-0">
    <section className="admin-page-header">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <p className="eyebrow">Integrations</p>
          <h1 className="display mt-1 text-3xl">Pancake POS</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--admin-muted)]">Live mode sends new website orders to Pancake immediately. Background polling keeps catalog and inventory aligned automatically.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-outline" disabled={syncBusy || !pancake} onClick={testConnection}>{busy === 'connection' ? 'Checking...' : 'Test connection'}</button>
          <button type="button" className="btn-ink" disabled={syncBusy || !pancake} onClick={refreshStatus}>{busy === 'refresh' ? 'Refreshing...' : 'Refresh status'}</button>
        </div>
      </div>
      {message && <p className="mt-4 text-sm text-[var(--admin-orange)]" role="status">{message}</p>}
    </section>

    {!pancake ? <p className="mt-8 text-sm text-[var(--admin-muted)]">Loading Pancake POS status...</p> : <>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Mode" value={pancake.mode} />
        <Metric label="Mapping coverage" value={`${summary.verifiedCount || 0} / ${summary.localVariantCount || 0}`} />
        <Metric label="Conflicts" value={summary.conflictCount ?? 0} tone={hasCatalogConflict ? 'text-[var(--admin-red)]' : 'text-[var(--admin-green)]'} />
        <Metric label="Last sync" value={catalog?.finishedAt || inventory?.finishedAt || orderExports?.finishedAt || pancake.lastConnectedAt} />
      </div>

      <section className="admin-panel mt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-[var(--admin-text)]">Order sync</h2>
              <StatusPill tone={healthTone}>{healthTone === 'good' ? 'Healthy' : 'Needs review'}</StatusPill>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--admin-muted)]">New website orders are sent to Pancake immediately in live mode. Sent means live Pancake order created.</p>
          </div>
          <button type="button" className="btn-outline" disabled={syncBusy} onClick={buildShadowOrders}>{busy === 'orders' ? 'Checking...' : 'Check orders'}</button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Queued" value={orderSummary.queuedCount ?? 0} />
          <MiniMetric label="Sent" value={orderSummary.sentCount ?? 0} tone="text-[var(--admin-green)]" />
          <MiniMetric label="Failed" value={orderSummary.failedCount ?? 0} tone={Number(orderSummary.failedCount || 0) > 0 ? 'text-[var(--admin-red)]' : 'text-[var(--admin-text)]'} />
          <MiniMetric label="Blocked" value={orderSummary.blockedCount ?? 0} tone={Number(orderSummary.blockedCount || 0) > 0 ? 'text-[var(--admin-red)]' : 'text-[var(--admin-text)]'} />
        </div>

        <div className="admin-table-shell mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--admin-line)] uppercase tracking-[0.1em] text-[var(--admin-muted)]">
                <th className="p-3">Order</th>
                <th className="p-3">Status</th>
                <th className="p-3">Pancake ID</th>
                <th className="p-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {(orderExports?.recent || []).map((item) => <tr key={item.id || item.orderNumber} className="border-b border-[var(--admin-line)] last:border-0">
                <td className="p-3 font-mono">{item.orderNumber}</td>
                <td className="p-3">{display(item.status)?.replaceAll('_', ' ')}</td>
                <td className="p-3 font-mono">{display(item.pancakeOrderId)}</td>
                <td className="p-3">{display(item.updatedAt || item.builtAt || item.queuedAt)}</td>
              </tr>)}
            </tbody>
          </table>
          {!orderExports?.recent?.length && <p className="p-4 text-sm text-[var(--admin-muted)]">No order sync records yet.</p>}
        </div>
      </section>

      <section className="admin-panel mt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--admin-text)]">Catalog & inventory</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--admin-muted)]">Pancake remains the source for stock. Automatic background sync updates website inventory from verified SKU and variation mappings.</p>
          </div>
          <StatusPill tone={inventory?.status === 'complete' ? 'good' : 'neutral'}>Auto sync</StatusPill>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Mapping coverage" value={`${summary.verifiedCount || 0} / ${summary.localVariantCount || 0}`} />
          <MiniMetric label="Price unit" value={catalog?.validation?.priceUnitStatus || pancake.priceUnitStatus} />
          <MiniMetric label="Inventory checked" value={inventorySummary.checkedCount ?? 0} />
          <MiniMetric label="Stock updates" value={inventorySummary.updatedCount ?? 0} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-[var(--admin-muted)] sm:grid-cols-3">
          <p><span className="font-bold text-[var(--admin-text)]">Catalog import:</span> {display(catalog?.status?.replaceAll('_', ' '))}</p>
          <p><span className="font-bold text-[var(--admin-text)]">Inventory:</span> {display(inventory?.status?.replaceAll('_', ' '))}</p>
          <p><span className="font-bold text-[var(--admin-text)]">Safe conflict code:</span> {display(catalog?.lastErrorCode || inventory?.lastErrorCode || pancake.lastErrorCode)}</p>
        </div>
      </section>

      <details className="admin-panel mt-5">
        <summary className="cursor-pointer text-base font-bold text-[var(--admin-text)]">Advanced mapping and reference settings</summary>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <SelectField label="Shop" value={selection.shopId} items={references.shops || []} disabled={pancake.shopLocked} onChange={(shopId) => setSelection({ shopId, warehouseId: '', orderSourceId: '' })} />
          <SelectField label="Warehouse" value={selection.warehouseId} items={(references.warehouses || []).filter((item) => !selection.shopId || !item.shopId || item.shopId === selection.shopId)} disabled={pancake.warehouseLocked} onChange={(warehouseId) => setSelection((value) => ({ ...value, warehouseId }))} />
          <SelectField label="Order source" value={selection.orderSourceId} items={references.orderSources || []} disabled={pancake.orderSourceLocked} onChange={(orderSourceId) => setSelection((value) => ({ ...value, orderSourceId }))} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-outline" disabled={syncBusy} onClick={saveSelection}>{busy === 'selection' ? 'Saving...' : 'Save selection'}</button>
          <button type="button" className="btn-outline" disabled={syncBusy || !pancake?.apiKeyConfigured} onClick={importCatalog}>{busy === 'import' ? 'Importing...' : 'Import catalog'}</button>
        </div>

        <div className="mt-6 min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--admin-text)]">Catalog mappings</h3>
              <p className="mt-1 text-xs text-[var(--admin-muted)]">Safe conflict code identifies readiness blockers.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto]">
              <label className="text-xs text-[var(--admin-muted)]">Search<input className="input mt-1 w-full" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              <label className="flex items-center gap-2 text-xs text-[var(--admin-muted)]"><input type="checkbox" checked={conflictOnly} onChange={(event) => setConflictOnly(event.target.checked)} /> Conflicts only</label>
              <button type="button" className="btn-outline sm:col-span-2" onClick={() => loadMappings(search, conflictOnly)}>Apply filters</button>
            </div>
          </div>

          <div className="admin-table-shell mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--admin-line)] text-[10px] uppercase tracking-[0.1em] text-[var(--admin-muted)]">
                  <th className="p-3">Product</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Pancake variation</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Safe conflict code</th>
                </tr>
              </thead>
              <tbody>
                {(mappings.items || []).map((item) => <tr key={item.id || `${item.product_slug}-${item.local_sku}`} className="border-b border-[var(--admin-line)] last:border-0">
                  <td className="p-3">{item.product_name || item.productSlug || item.product_slug}</td>
                  <td className="p-3 font-mono text-xs">{item.localSku || item.local_sku}</td>
                  <td className="p-3 font-mono text-xs">{item.pancakeVariationId || item.pancake_variation_id || 'Not set'}</td>
                  <td className="p-3">{display(item.status)?.replaceAll('_', ' ')}</td>
                  <td className="p-3">{item.conflictCode || item.conflict_code || (item.status === 'verified' ? 'None' : item.status)}</td>
                </tr>)}
              </tbody>
            </table>
            {!mappings.items?.length && <p className="p-4 text-sm text-[var(--admin-muted)]">No catalog mappings found.</p>}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-[0.1em] text-[var(--admin-muted)]">API endpoint</dt>
            <dd className="mt-1 break-all">{pancake.apiBaseUrl}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.1em] text-[var(--admin-muted)]">Last connected</dt>
            <dd className="mt-1">{display(pancake.lastConnectedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.1em] text-[var(--admin-muted)]">Currency</dt>
            <dd className="mt-1">{display(catalog?.validation?.currencyStatus || pancake.currencyStatus)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.1em] text-[var(--admin-muted)]">Health</dt>
            <dd className="mt-1">{display(pancake.healthStatus?.replaceAll('_', ' '))}</dd>
          </div>
        </dl>
      </details>

      <p className="mt-4 text-xs leading-relaxed text-[var(--admin-muted)]">Credentials are managed on the API server and are never displayed in this admin page or sent to the browser.</p>
    </>}
  </div>;
}
