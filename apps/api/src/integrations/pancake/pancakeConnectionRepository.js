const crypto = require('node:crypto');
const { hasDatabaseUrl, query, transaction } = require('../../db/postgres');

let memoryStatus = null;

function mapConnection(row) {
  if (!row) return null;
  return {
    shopId: row.shop_id || '',
    warehouseId: row.warehouse_id || '',
    orderSourceId: row.order_source_id || '',
    mode: row.mode || 'disabled',
    healthStatus: row.health_status || 'never_checked',
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : '',
    lastConnectedAt: row.last_connected_at ? new Date(row.last_connected_at).toISOString() : '',
    lastErrorCode: row.last_error_code || ''
  };
}

async function getConnectionStatus() {
  if (!hasDatabaseUrl()) return memoryStatus;
  const result = await query("SELECT * FROM pancake_connections WHERE connection_key='primary'");
  return mapConnection(result.rows[0]);
}

async function recordConnectionCheck(record) {
  const safe = {
    shopId: String(record.shopId || ''),
    warehouseId: String(record.warehouseId || ''),
    orderSourceId: String(record.orderSourceId || ''),
    mode: String(record.mode || 'disabled'),
    healthStatus: String(record.healthStatus || 'unknown'),
    lastCheckedAt: record.lastCheckedAt || new Date().toISOString(),
    lastConnectedAt: record.lastConnectedAt || null,
    lastErrorCode: String(record.lastErrorCode || ''),
    durationMs: Math.max(0, Number(record.durationMs || 0)),
    shop: record.shop ? { id: String(record.shop.id || ''), name: String(record.shop.name || '') } : {}
  };
  memoryStatus = { ...safe, lastConnectedAt: safe.lastConnectedAt || '' };
  if (!hasDatabaseUrl()) return memoryStatus;

  await transaction(async (client) => {
    await client.query(
      `INSERT INTO pancake_connections (
        connection_key,shop_id,warehouse_id,order_source_id,mode,health_status,
        last_checked_at,last_connected_at,last_error_code,updated_at
      ) VALUES ('primary',$1,$2,$3,$4,$5,$6,$7,$8,now())
      ON CONFLICT (connection_key) DO UPDATE SET
        shop_id=EXCLUDED.shop_id,warehouse_id=EXCLUDED.warehouse_id,
        order_source_id=EXCLUDED.order_source_id,mode=EXCLUDED.mode,
        health_status=EXCLUDED.health_status,last_checked_at=EXCLUDED.last_checked_at,
        last_connected_at=COALESCE(EXCLUDED.last_connected_at,pancake_connections.last_connected_at),
        last_error_code=EXCLUDED.last_error_code,updated_at=now()`,
      [safe.shopId, safe.warehouseId, safe.orderSourceId, safe.mode, safe.healthStatus,
        safe.lastCheckedAt, safe.lastConnectedAt, safe.lastErrorCode]
    );
    await client.query(
      `INSERT INTO pancake_connection_checks (
        id,connection_key,status,duration_ms,shop_summary,error_code
      ) VALUES ($1,'primary',$2,$3,$4::jsonb,$5)`,
      [crypto.randomUUID(), safe.healthStatus, safe.durationMs, JSON.stringify(safe.shop), safe.lastErrorCode]
    );
  });
  return memoryStatus;
}

function resetMemory() {
  memoryStatus = null;
}

module.exports = { getConnectionStatus, recordConnectionCheck, resetMemory };
