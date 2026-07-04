import { useCallback, useEffect, useState } from 'react';
import { adminJson, adminSend } from '../lib/adminApi.js';

function display(value) {
  return value === true ? 'Configured' : value === false ? 'Not configured' : (value || 'Not set');
}

function Metric({ label, value }) {
  return (
    <div className="min-w-0 border border-line bg-paper p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-clay">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-ink">{display(value)}</p>
    </div>
  );
}

export default function PancakePos() {
  const [pancake, setPancake] = useState(null);
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const body = await adminJson('/api/admin/integrations/pancake/status');
      setPancake(body.pancake);
      setMessage('');
    } catch (error) {
      setMessage(error.message);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function testConnection() {
    setChecking(true);
    setMessage('');
    try {
      const body = await adminSend('POST', '/api/admin/integrations/pancake/test-connection', {});
      setPancake(body.pancake);
      setMessage(body.pancake.healthStatus === 'connected'
        ? 'Pancake POS connection succeeded.'
        : `Connection status: ${body.pancake.healthStatus.replaceAll('_', ' ')}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Integrations</p>
          <h1 className="display mt-1 text-3xl">Pancake POS</h1>
          <p className="mt-2 max-w-2xl text-sm text-clay">Read-only foundation for verifying the secure server connection. Inventory, products, customers, and orders are not synchronized in Phase 1.</p>
        </div>
        <button type="button" className="btn-ink" disabled={checking || !pancake} onClick={testConnection}>
          {checking ? 'Checking…' : 'Test connection'}
        </button>
      </div>

      {message && <p className="mt-4 text-sm text-accent-deep" role="status">{message}</p>}
      {!pancake ? (
        <p className="mt-8 text-sm text-clay">Loading Pancake POS status…</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Mode" value={pancake.mode} />
            <Metric label="Health" value={pancake.healthStatus?.replaceAll('_', ' ')} />
            <Metric label="API credentials" value={pancake.apiKeyConfigured} />
            <Metric label="Webhook secret" value={pancake.webhookSecretConfigured} />
            <Metric label="Shop ID" value={pancake.shopId} />
            <Metric label="Warehouse ID" value={pancake.warehouseId} />
            <Metric label="Order source ID" value={pancake.orderSourceId} />
            <Metric label="Connected shop" value={pancake.shop?.name} />
          </div>

          <section className="mt-6 border border-line bg-paper p-5 sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Connection details</h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs uppercase tracking-[0.1em] text-clay">API endpoint</dt><dd className="mt-1 break-all">{pancake.apiBaseUrl}</dd></div>
              <div><dt className="text-xs uppercase tracking-[0.1em] text-clay">Last checked</dt><dd className="mt-1">{display(pancake.lastCheckedAt)}</dd></div>
              <div><dt className="text-xs uppercase tracking-[0.1em] text-clay">Last connected</dt><dd className="mt-1">{display(pancake.lastConnectedAt)}</dd></div>
              <div><dt className="text-xs uppercase tracking-[0.1em] text-clay">Safe error code</dt><dd className="mt-1">{display(pancake.lastErrorCode)}</dd></div>
            </dl>
          </section>

          <p className="mt-4 text-xs leading-relaxed text-clay">Credentials are managed on the API server and are never displayed in this admin page or sent to the browser.</p>
        </>
      )}
    </div>
  );
}
