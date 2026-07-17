const crypto = require('node:crypto');

const { hasDatabaseUrl, query } = require('../../db/postgres');

const memory = { links: [], events: [], logs: [], snapshots: [] };

function resetMemoryForTests() {
  memory.links = [];
  memory.events = [];
  memory.logs = [];
  memory.snapshots = [];
}

function iso(value) {
  return value ? new Date(value).toISOString() : '';
}

function rowEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    direction: row.direction,
    entityType: row.entity_type || row.entityType,
    entityId: row.entity_id || row.entityId,
    orderNumber: row.order_number || row.orderNumber || '',
    pancakeOrderId: row.pancake_order_id || row.pancakeOrderId || '',
    eventKey: row.event_key || row.eventKey,
    status: row.status,
    payloadHash: row.payload_hash || row.payloadHash || '',
    payload: row.payload || {},
    safeErrorCode: row.safe_error_code || row.safeErrorCode || '',
    attemptCount: Number(row.attempt_count || row.attemptCount || 0),
    nextAttemptAt: iso(row.next_attempt_at || row.nextAttemptAt),
    processedAt: iso(row.processed_at || row.processedAt),
    createdAt: iso(row.created_at || row.createdAt),
    updatedAt: iso(row.updated_at || row.updatedAt)
  };
}

function eventSyncStatus(event) {
  if (!event) return 'not_synced';
  if (event.status === 'succeeded') return 'synced';
  if (event.status === 'failed_retryable') return 'sync_failed';
  if (event.status === 'blocked') return 'blocked';
  return 'pending_sync';
}

function eventTouches(event, fields) {
  const changed = Array.isArray(event?.payload?.changedFields) ? event.payload.changedFields : [];
  return changed.some((field) => fields.includes(field));
}

function syncBreakdown(events = []) {
  const payment = events.find((event) => eventTouches(event, ['paymentMethod', 'paymentStatus']));
  const status = events.find((event) => eventTouches(event, [
    'status', 'fulfillmentStatus', 'deliveryStatus', 'trackingNumber', 'deliveryMethod'
  ]));
  return {
    paymentSyncStatus: eventSyncStatus(payment),
    paymentLastSyncedAt: payment?.processedAt || '',
    paymentSyncError: payment?.safeErrorCode || '',
    statusSyncStatus: eventSyncStatus(status),
    statusLastSyncedAt: status?.processedAt || '',
    statusSyncError: status?.safeErrorCode || ''
  };
}

function rowLink(row) {
  if (!row) return null;
  return {
    orderNumber: row.order_number || row.orderNumber,
    pancakeOrderId: row.pancake_order_id || row.pancakeOrderId || '',
    shopId: row.shop_id || row.shopId || '',
    syncStatus: row.sync_status || row.syncStatus || 'not_linked',
    lastSyncedAt: iso(row.last_synced_at || row.lastSyncedAt),
    lastPancakeUpdatedAt: iso(row.last_pancake_updated_at || row.lastPancakeUpdatedAt),
    lastLocalUpdatedAt: iso(row.last_local_updated_at || row.lastLocalUpdatedAt),
    safeErrorCode: row.safe_error_code || row.safeErrorCode || ''
  };
}

function memoryNow() {
  return new Date().toISOString();
}

async function upsertOrderLink(input) {
  const record = {
    id: crypto.randomUUID(),
    orderNumber: String(input.orderNumber || '').trim(),
    pancakeOrderId: String(input.pancakeOrderId || '').trim(),
    shopId: String(input.shopId || '').trim(),
    syncStatus: input.syncStatus || 'pending_sync',
    lastSyncedAt: input.lastSyncedAt || null,
    lastPancakeUpdatedAt: input.lastPancakeUpdatedAt || null,
    lastLocalUpdatedAt: input.lastLocalUpdatedAt || null,
    safeErrorCode: input.safeErrorCode || ''
  };
  if (!record.orderNumber || !record.pancakeOrderId) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.links.find((item) => item.orderNumber === record.orderNumber || item.pancakeOrderId === record.pancakeOrderId);
    if (existing) Object.assign(existing, {
      ...record,
      shopId: record.shopId || existing.shopId,
      lastSyncedAt: record.lastSyncedAt || existing.lastSyncedAt,
      lastPancakeUpdatedAt: record.lastPancakeUpdatedAt || existing.lastPancakeUpdatedAt,
      lastLocalUpdatedAt: record.lastLocalUpdatedAt || existing.lastLocalUpdatedAt
    });
    else memory.links.push(record);
    return rowLink(existing || record);
  }
  const result = await query(
    `INSERT INTO pancake_order_links (
       id, order_number, pancake_order_id, shop_id, sync_status, last_synced_at,
       last_pancake_updated_at, last_local_updated_at, safe_error_code, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     ON CONFLICT (order_number) DO UPDATE SET
       pancake_order_id=EXCLUDED.pancake_order_id,
       shop_id=CASE WHEN EXCLUDED.shop_id <> '' THEN EXCLUDED.shop_id ELSE pancake_order_links.shop_id END,
       sync_status=EXCLUDED.sync_status,
       last_synced_at=COALESCE(EXCLUDED.last_synced_at,pancake_order_links.last_synced_at),
       last_pancake_updated_at=COALESCE(EXCLUDED.last_pancake_updated_at,pancake_order_links.last_pancake_updated_at),
       last_local_updated_at=COALESCE(EXCLUDED.last_local_updated_at,pancake_order_links.last_local_updated_at),
       safe_error_code=EXCLUDED.safe_error_code,
       updated_at=now()
     RETURNING *`,
    [
      record.id, record.orderNumber, record.pancakeOrderId, record.shopId, record.syncStatus,
      record.lastSyncedAt, record.lastPancakeUpdatedAt, record.lastLocalUpdatedAt, record.safeErrorCode
    ]
  );
  return rowLink(result.rows[0]);
}

async function getOrderSyncDetail(orderNumber) {
  const normalized = String(orderNumber || '').trim();
  if (!normalized) return { syncStatus: 'not_linked', recentLogs: [] };
  if (!hasDatabaseUrl()) {
    const link = memory.links.find((item) => item.orderNumber === normalized);
    const recentLogs = memory.logs.filter((item) => item.orderNumber === normalized).slice(0, 10);
    const events = memory.events
      .filter((item) => item.orderNumber === normalized && item.direction === 'outbound')
      .slice().reverse().map(rowEvent);
    return {
      ...(rowLink(link) || { orderNumber: normalized, syncStatus: 'not_linked' }),
      ...syncBreakdown(events),
      recentLogs
    };
  }
  const link = await query('SELECT * FROM pancake_order_links WHERE order_number=$1', [normalized]);
  const [logs, events] = await Promise.all([
    query('SELECT * FROM pancake_sync_logs WHERE order_number=$1 ORDER BY created_at DESC LIMIT 10', [normalized]),
    query(`SELECT * FROM pancake_sync_events
      WHERE order_number=$1 AND direction='outbound'
      ORDER BY created_at DESC LIMIT 50`, [normalized])
  ]);
  return {
    ...(rowLink(link.rows[0]) || { orderNumber: normalized, syncStatus: 'not_linked' }),
    ...syncBreakdown(events.rows.map(rowEvent)),
    recentLogs: logs.rows.map((row) => ({
      id: row.id,
      level: row.level,
      code: row.code,
      message: row.message,
      createdAt: iso(row.created_at)
    }))
  };
}

async function getOrderLinkByPancakeOrderId(pancakeOrderId) {
  const normalized = String(pancakeOrderId || '').trim();
  if (!normalized) return null;
  if (!hasDatabaseUrl()) {
    return rowLink(memory.links.find((item) => item.pancakeOrderId === normalized));
  }
  const result = await query('SELECT * FROM pancake_order_links WHERE pancake_order_id=$1', [normalized]);
  return result.rows[0] ? rowLink(result.rows[0]) : null;
}

async function listOrderLinks({ orderNumbers = [] } = {}) {
  const scoped = [...new Set((orderNumbers || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!hasDatabaseUrl()) {
    return memory.links
      .filter((item) => !scoped.length || scoped.includes(item.orderNumber))
      .map(rowLink)
      .sort((left, right) => left.orderNumber.localeCompare(right.orderNumber));
  }
  const result = scoped.length
    ? await query(
      `SELECT * FROM pancake_order_links
       WHERE order_number = ANY($1::text[])
       ORDER BY order_number ASC`,
      [scoped]
    )
    : await query('SELECT * FROM pancake_order_links ORDER BY order_number ASC');
  return result.rows.map(rowLink);
}

async function backfillSentOrderExportLinks({ limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  if (!hasDatabaseUrl()) return { linkedCount: 0 };
  const result = await query(
    `SELECT e.order_number,e.pancake_order_id,e.shop_id,e.sent_at
     FROM pancake_order_exports e
     LEFT JOIN pancake_order_links l ON l.order_number=e.order_number
     WHERE e.status='sent'
       AND e.pancake_order_id <> ''
       AND l.order_number IS NULL
     ORDER BY e.sent_at DESC NULLS LAST,e.updated_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  let linkedCount = 0;
  for (const row of result.rows) {
    const link = await upsertOrderLink({
      orderNumber: row.order_number,
      pancakeOrderId: row.pancake_order_id,
      shopId: row.shop_id || '',
      syncStatus: 'synced',
      lastSyncedAt: row.sent_at ? new Date(row.sent_at).toISOString() : memoryNow()
    });
    if (link) linkedCount += 1;
  }
  return { linkedCount };
}

async function enqueueSyncEvent(input) {
  const event = {
    id: crypto.randomUUID(),
    direction: String(input.direction || '').trim(),
    entityType: String(input.entityType || '').trim(),
    entityId: String(input.entityId || '').trim(),
    orderNumber: String(input.orderNumber || '').trim(),
    pancakeOrderId: String(input.pancakeOrderId || '').trim(),
    eventKey: String(input.eventKey || '').trim(),
    status: 'pending',
    payloadHash: String(input.payloadHash || '').trim(),
    payload: input.payload || {},
    safeErrorCode: '',
    attemptCount: 0,
    nextAttemptAt: input.nextAttemptAt || '1970-01-01T00:00:00.000Z',
    createdAt: memoryNow(),
    updatedAt: memoryNow()
  };
  if (!event.direction || !event.entityType || !event.entityId || !event.eventKey) return null;
  if (!hasDatabaseUrl()) {
    const existing = memory.events.find((item) =>
      item.direction === event.direction
      && item.entityType === event.entityType
      && item.entityId === event.entityId
      && item.eventKey === event.eventKey
    );
    if (existing) return { ...rowEvent(existing), status: 'duplicate' };
    memory.events.push(event);
    return rowEvent(event);
  }
  const result = await query(
    `INSERT INTO pancake_sync_events (
       id,direction,entity_type,entity_id,order_number,pancake_order_id,event_key,status,
       payload_hash,payload,next_attempt_at,created_at,updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9::jsonb,$10,now(),now())
     ON CONFLICT (direction, entity_type, entity_id, event_key) DO NOTHING
     RETURNING *`,
    [
      event.id, event.direction, event.entityType, event.entityId, event.orderNumber,
      event.pancakeOrderId, event.eventKey, event.payloadHash, JSON.stringify(event.payload),
      event.nextAttemptAt
    ]
  );
  return result.rows[0] ? rowEvent(result.rows[0]) : { ...event, status: 'duplicate' };
}

async function claimDueSyncEvents({ direction, limit = 25, now = memoryNow() } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));
  if (!hasDatabaseUrl()) {
    return memory.events
      .filter((item) => item.direction === direction && ['pending', 'failed_retryable'].includes(item.status) && item.nextAttemptAt <= now)
      .slice(0, safeLimit)
      .map((item) => {
        item.status = 'processing';
        item.updatedAt = memoryNow();
        return rowEvent(item);
      });
  }
  const result = await query(
    `WITH due AS (
       SELECT id FROM pancake_sync_events
       WHERE direction=$1 AND status IN ('pending','failed_retryable') AND next_attempt_at <= $2
       ORDER BY next_attempt_at ASC, created_at ASC
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     UPDATE pancake_sync_events e
     SET status='processing', locked_at=now(), updated_at=now()
     FROM due
     WHERE e.id=due.id
     RETURNING e.*`,
    [direction, now, safeLimit]
  );
  return result.rows.map(rowEvent);
}

async function getSyncEvent(id) {
  if (!hasDatabaseUrl()) return rowEvent(memory.events.find((item) => item.id === id));
  const result = await query('SELECT * FROM pancake_sync_events WHERE id=$1', [id]);
  return result.rows[0] ? rowEvent(result.rows[0]) : null;
}

async function getSyncEventByIdentity({ direction, entityType, entityId, eventKey }) {
  const identity = {
    direction: String(direction || '').trim(),
    entityType: String(entityType || '').trim(),
    entityId: String(entityId || '').trim(),
    eventKey: String(eventKey || '').trim()
  };
  if (!Object.values(identity).every(Boolean)) return null;
  if (!hasDatabaseUrl()) {
    return rowEvent(memory.events.find((item) =>
      item.direction === identity.direction
      && item.entityType === identity.entityType
      && item.entityId === identity.entityId
      && item.eventKey === identity.eventKey
    ));
  }
  const result = await query(
    `SELECT * FROM pancake_sync_events
     WHERE direction=$1 AND entity_type=$2 AND entity_id=$3 AND event_key=$4`,
    [identity.direction, identity.entityType, identity.entityId, identity.eventKey]
  );
  return result.rows[0] ? rowEvent(result.rows[0]) : null;
}

async function claimSyncEventById(id, { now = memoryNow() } = {}) {
  const normalized = String(id || '').trim();
  if (!normalized) return null;
  if (!hasDatabaseUrl()) {
    const event = memory.events.find((item) => item.id === normalized);
    if (!event || !['pending', 'failed_retryable'].includes(event.status)) return null;
    event.status = 'processing';
    event.updatedAt = now;
    return rowEvent(event);
  }
  const result = await query(
    `UPDATE pancake_sync_events
     SET status='processing', locked_at=now(), updated_at=now()
     WHERE id=$1 AND status IN ('pending','failed_retryable')
     RETURNING *`,
    [normalized]
  );
  return result.rows[0] ? rowEvent(result.rows[0]) : null;
}

async function markSyncEventSucceeded(id) {
  if (!hasDatabaseUrl()) {
    const event = memory.events.find((item) => item.id === id);
    if (event) Object.assign(event, {
      status: 'succeeded',
      safeErrorCode: '',
      processedAt: memoryNow(),
      updatedAt: memoryNow()
    });
    return rowEvent(event);
  }
  const result = await query(
    `UPDATE pancake_sync_events
     SET status='succeeded', safe_error_code='', processed_at=now(), updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id]
  );
  return result.rows[0] ? rowEvent(result.rows[0]) : null;
}

async function markSyncEventRetryable(id, input) {
  if (!hasDatabaseUrl()) {
    const event = memory.events.find((item) => item.id === id);
    if (event) Object.assign(event, {
      status: 'failed_retryable',
      safeErrorCode: input.safeErrorCode || '',
      attemptCount: Number(event.attemptCount || 0) + 1,
      nextAttemptAt: input.nextAttemptAt,
      updatedAt: memoryNow()
    });
    return rowEvent(event);
  }
  const result = await query(
    `UPDATE pancake_sync_events
     SET status='failed_retryable', safe_error_code=$2, attempt_count=attempt_count+1,
         next_attempt_at=$3, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id, input.safeErrorCode || '', input.nextAttemptAt]
  );
  return result.rows[0] ? rowEvent(result.rows[0]) : null;
}

async function markSyncEventBlocked(id, safeErrorCode) {
  if (!hasDatabaseUrl()) {
    const event = memory.events.find((item) => item.id === id);
    if (event) Object.assign(event, { status: 'blocked', safeErrorCode, updatedAt: memoryNow() });
    return rowEvent(event);
  }
  const result = await query(
    `UPDATE pancake_sync_events
     SET status='blocked', safe_error_code=$2, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id, safeErrorCode || 'pancake_sync_blocked']
  );
  return result.rows[0] ? rowEvent(result.rows[0]) : null;
}

async function appendSyncLog(input) {
  const log = {
    id: crypto.randomUUID(),
    direction: input.direction || '',
    entityType: input.entityType || '',
    entityId: input.entityId || '',
    orderNumber: input.orderNumber || '',
    pancakeOrderId: input.pancakeOrderId || '',
    level: input.level || 'info',
    code: input.code || '',
    message: input.message || '',
    metadata: input.metadata || {},
    createdAt: memoryNow()
  };
  if (!hasDatabaseUrl()) {
    memory.logs.unshift(log);
    return log;
  }
  await query(
    `INSERT INTO pancake_sync_logs (
       id,direction,entity_type,entity_id,order_number,pancake_order_id,level,code,message,metadata,created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now())`,
    [
      log.id, log.direction, log.entityType, log.entityId, log.orderNumber, log.pancakeOrderId,
      log.level, log.code, log.message, JSON.stringify(log.metadata)
    ]
  );
  return log;
}

async function getOrderSyncSummary() {
  if (!hasDatabaseUrl()) {
    return {
      pendingCount: memory.events.filter((event) => event.status === 'pending').length,
      failedCount: memory.events.filter((event) => event.status === 'failed_retryable').length,
      blockedCount: memory.events.filter((event) => event.status === 'blocked').length,
      linkedCount: memory.links.length
    };
  }
  const events = await query('SELECT status,count(*)::integer AS count FROM pancake_sync_events GROUP BY status');
  const links = await query('SELECT count(*)::integer AS count FROM pancake_order_links');
  const count = (status) => events.rows.find((row) => row.status === status)?.count || 0;
  return {
    pendingCount: count('pending'),
    failedCount: count('failed_retryable'),
    blockedCount: count('blocked'),
    linkedCount: links.rows[0]?.count || 0
  };
}

module.exports = {
  appendSyncLog,
  backfillSentOrderExportLinks,
  claimSyncEventById,
  claimDueSyncEvents,
  enqueueSyncEvent,
  getOrderSyncSummary,
  getOrderSyncDetail,
  getOrderLinkByPancakeOrderId,
  getSyncEvent,
  getSyncEventByIdentity,
  listOrderLinks,
  markSyncEventBlocked,
  markSyncEventRetryable,
  markSyncEventSucceeded,
  resetMemoryForTests,
  upsertOrderLink
};
