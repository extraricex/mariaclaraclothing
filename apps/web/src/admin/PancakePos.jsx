import { useCallback, useEffect, useState } from 'react';
import { adminJson, adminSend } from '../lib/adminApi.js';

const base = '/api/admin/integrations/pancake';
const connectionStatusEndpoint = '/api/admin/integrations/pancake/status';
const testConnectionEndpoint = '/api/admin/integrations/pancake/test-connection';
const display = (value) => value === true ? 'Configured' : value === false ? 'Not configured' : (value || 'Not set');

function Metric({ label, value }) {
  return <div className="min-w-0 border border-line bg-paper p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-clay">{label}</p><p className="mt-2 break-words text-sm font-semibold text-ink">{display(value)}</p></div>;
}

function SelectField({ label, value, items, disabled, onChange }) {
  return <label className="min-w-0 text-xs font-semibold uppercase tracking-[0.1em] text-clay">{label}<select className="input mt-2 w-full" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">Select {label.toLowerCase()}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}{item.allowCreateOrder === false ? ' — order creation disabled' : ''}</option>)}</select></label>;
}

export default function PancakePos() {
  const [pancake, setPancake] = useState(null);
  const [catalog, setCatalog] = useState(null);
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
      const [connectionBody, catalogBody, referencesBody] = await Promise.all([
        adminJson(connectionStatusEndpoint), adminJson(`${base}/catalog/status`), adminJson(`${base}/references`)
      ]);
      setPancake(connectionBody.pancake);
      setCatalog(catalogBody.catalog);
      setReferences(referencesBody.references);
      setSelection({
        shopId: connectionBody.pancake.shopId || '', warehouseId: connectionBody.pancake.warehouseId || '',
        orderSourceId: connectionBody.pancake.orderSourceId || ''
      });
      await loadMappings('', false);
      setMessage('');
    } catch (error) { setMessage(error.message); }
  }, [loadMappings]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function run(action, work) {
    setBusy(action); setMessage('');
    try { await work(); } catch (error) { setMessage(error.message); } finally { setBusy(''); }
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

  const summary = catalog?.summary || {};
  return <div className="min-w-0">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Integrations</p><h1 className="display mt-1 text-3xl">Pancake POS</h1><p className="mt-2 max-w-2xl text-sm text-clay">Read-only foundation and Phase 2 catalog mapping. No Pancake products, inventory, customers, or orders are changed.</p></div><div className="flex flex-wrap gap-2"><button type="button" className="btn-outline" disabled={Boolean(busy) || !pancake} onClick={testConnection}>{busy === 'connection' ? 'Checking…' : 'Test connection'}</button><button type="button" className="btn-ink" disabled={Boolean(busy) || !pancake?.apiKeyConfigured} onClick={importCatalog}>{busy === 'import' ? 'Importing…' : 'Import catalog'}</button></div></div>
    {message && <p className="mt-4 text-sm text-accent-deep" role="status">{message}</p>}
    {!pancake ? <p className="mt-8 text-sm text-clay">Loading Pancake POS status…</p> : <>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Mode" value={pancake.mode} /><Metric label="Health" value={pancake.healthStatus?.replaceAll('_', ' ')} /><Metric label="API credentials" value={pancake.apiKeyConfigured} /><Metric label="Catalog import" value={catalog?.status?.replaceAll('_', ' ')} /><Metric label="Mapping coverage" value={`${summary.verifiedCount || 0} / ${summary.localVariantCount || 0}`} /><Metric label="Conflicts" value={summary.conflictCount ?? 0} /><Metric label="Currency" value={catalog?.validation?.currencyStatus || pancake.currencyStatus} /><Metric label="Price unit" value={catalog?.validation?.priceUnitStatus || pancake.priceUnitStatus} /></div>
      <section className="mt-6 border border-line bg-paper p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Reference selection</h2><p className="mt-1 text-xs text-clay">Read-only local settings used for mapping readiness.</p></div><button type="button" className="btn-outline" disabled={Boolean(busy)} onClick={saveSelection}>{busy === 'selection' ? 'Saving…' : 'Save selection'}</button></div><div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3"><SelectField label="Shop" value={selection.shopId} items={references.shops || []} disabled={pancake.shopLocked} onChange={(shopId) => setSelection({ shopId, warehouseId: '', orderSourceId: '' })} /><SelectField label="Warehouse" value={selection.warehouseId} items={(references.warehouses || []).filter((item) => !selection.shopId || !item.shopId || item.shopId === selection.shopId)} disabled={pancake.warehouseLocked} onChange={(warehouseId) => setSelection((value) => ({ ...value, warehouseId }))} /><SelectField label="Order source" value={selection.orderSourceId} items={references.orderSources || []} disabled={pancake.orderSourceLocked} onChange={(orderSourceId) => setSelection((value) => ({ ...value, orderSourceId }))} /></div></section>
      <section className="mt-6 min-w-0 border border-line bg-paper p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Catalog mappings</h2><p className="mt-1 text-xs text-clay">Website-owned data remains unchanged. Safe conflict code identifies readiness blockers.</p></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto]"><label className="text-xs text-clay">Search<input className="input mt-1 w-full" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="flex items-center gap-2 text-xs text-clay"><input type="checkbox" checked={conflictOnly} onChange={(event) => setConflictOnly(event.target.checked)} /> Conflicts only</label><button type="button" className="btn-outline sm:col-span-2" onClick={() => loadMappings(search, conflictOnly)}>Apply filters</button></div></div><div className="mt-4 max-w-full overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-line text-[10px] uppercase tracking-[0.1em] text-clay"><th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3">Pancake variation</th><th className="p-3">Status</th><th className="p-3">Safe conflict code</th></tr></thead><tbody>{(mappings.items || []).map((item) => <tr key={item.id || `${item.product_slug}-${item.local_sku}`} className="border-b border-line"><td className="p-3">{item.product_name || item.productSlug || item.product_slug}</td><td className="p-3 font-mono text-xs">{item.localSku || item.local_sku}</td><td className="p-3 font-mono text-xs">{item.pancakeVariationId || item.pancake_variation_id || '—'}</td><td className="p-3">{display(item.status)?.replaceAll('_', ' ')}</td><td className="p-3">{item.conflictCode || item.conflict_code || (item.status === 'verified' ? 'None' : item.status)}</td></tr>)}</tbody></table>{!mappings.items?.length && <p className="p-4 text-sm text-clay">No catalog mappings found.</p>}</div></section>
      <section className="mt-6 border border-line bg-paper p-5 sm:p-6"><h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Connection details</h2><dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2"><div><dt className="text-xs uppercase tracking-[0.1em] text-clay">API endpoint</dt><dd className="mt-1 break-all">{pancake.apiBaseUrl}</dd></div><div><dt className="text-xs uppercase tracking-[0.1em] text-clay">Last connected</dt><dd className="mt-1">{display(pancake.lastConnectedAt)}</dd></div><div><dt className="text-xs uppercase tracking-[0.1em] text-clay">Last import</dt><dd className="mt-1">{display(catalog?.finishedAt)}</dd></div><div><dt className="text-xs uppercase tracking-[0.1em] text-clay">Safe error code</dt><dd className="mt-1">{display(catalog?.lastErrorCode || pancake.lastErrorCode)}</dd></div></dl></section>
      <p className="mt-4 text-xs leading-relaxed text-clay">Credentials are managed on the API server and are never displayed in this admin page or sent to the browser.</p>
    </>}
  </div>;
}
