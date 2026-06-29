const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { hasDatabaseUrl, query } = require('../db/postgres');

const defaultFile = path.join(__dirname, '..', '..', 'data', 'order-notifications.json');
const filePath = () => process.env.ORDER_NOTIFICATIONS_DATA_FILE || defaultFile;

async function enqueueMany(orderNumber, eventName, notifications) {
  if (hasDatabaseUrl()) {
    const rows = [];
    for (const item of notifications) {
      const result = await query(
        `INSERT INTO order_notification_outbox (id, order_number, event_name, channel, recipient, payload, status)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         ON CONFLICT (order_number,event_name,channel) DO NOTHING RETURNING *`,
        [crypto.randomUUID(), orderNumber, eventName, item.channel, item.recipient, JSON.stringify(item.payload), item.status]
      );
      if (result.rows[0]) rows.push(fromRow(result.rows[0]));
    }
    return rows;
  }
  const store = await readStore();
  const created = [];
  for (const item of notifications) {
    if (store.some((row) => row.orderNumber === orderNumber && row.eventName === eventName && row.channel === item.channel)) continue;
    const now = new Date().toISOString();
    const row = { id: crypto.randomUUID(), orderNumber, eventName, channel: item.channel, recipient: item.recipient, payload: item.payload, status: item.status, attemptCount: 0, nextAttemptAt: now, lockedAt: '', sentAt: '', providerMessageId: '', lastError: '', createdAt: now, updatedAt: now };
    store.push(row); created.push(row);
  }
  await writeStore(store);
  return created;
}

async function listForOrder(orderNumber) {
  if (hasDatabaseUrl()) {
    const result = await query('SELECT * FROM order_notification_outbox WHERE order_number=$1 ORDER BY created_at DESC', [orderNumber]);
    return result.rows.map(fromRow);
  }
  return (await readStore()).filter((row) => row.orderNumber === orderNumber).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function claimDue(client, { now = new Date(), limit = 10 } = {}) {
  if (hasDatabaseUrl()) {
    const db = client || { query };
    const result = await db.query(`WITH due AS (SELECT id FROM order_notification_outbox WHERE status='pending' AND next_attempt_at <= $1 ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT $2) UPDATE order_notification_outbox n SET status='sending',locked_at=$1,attempt_count=attempt_count+1,updated_at=$1 FROM due WHERE n.id=due.id RETURNING n.*`, [now, limit]);
    return result.rows.map(fromRow);
  }
  const store = await readStore();
  const due = store.filter((row) => row.status === 'pending' && row.nextAttemptAt <= now.toISOString()).slice(0, limit);
  for (const row of due) { row.status = 'sending'; row.lockedAt = now.toISOString(); row.attemptCount += 1; row.updatedAt = now.toISOString(); }
  await writeStore(store); return due;
}

async function updateState(client, id, changes) {
  if (hasDatabaseUrl()) {
    const db = client || { query };
    await db.query(`UPDATE order_notification_outbox SET status=$2,next_attempt_at=COALESCE($3,next_attempt_at),locked_at=$4,sent_at=$5,provider_message_id=$6,last_error=$7,updated_at=now() WHERE id=$1`, [id, changes.status, changes.nextAttemptAt || null, changes.lockedAt || null, changes.sentAt || null, changes.providerMessageId || '', changes.lastError || '']);
    return;
  }
  const store = await readStore(); const row = store.find((item) => item.id === id); if (!row) return;
  Object.assign(row, changes, { updatedAt: new Date().toISOString() }); await writeStore(store);
}

const markSent = (client, id, response = {}) => updateState(client, id, { status: 'sent', lockedAt: '', sentAt: new Date().toISOString(), providerMessageId: response.providerMessageId || '', lastError: '' });
const scheduleRetry = (client, id, { nextAttemptAt, error }) => updateState(client, id, { status: 'pending', lockedAt: '', nextAttemptAt: nextAttemptAt.toISOString(), lastError: error });
const markFailed = (client, id, error) => updateState(client, id, { status: 'failed', lockedAt: '', lastError: error });

async function recoverStaleClaims(client, cutoff) {
  if (hasDatabaseUrl()) { const db = client || { query }; const result = await db.query("UPDATE order_notification_outbox SET status='pending',locked_at=NULL,updated_at=now() WHERE status='sending' AND locked_at < $1", [cutoff]); return result.rowCount; }
  const store = await readStore(); let count = 0;
  for (const row of store) if (row.status === 'sending' && row.lockedAt && row.lockedAt < cutoff.toISOString()) { row.status = 'pending'; row.lockedAt = ''; count += 1; }
  if (count) await writeStore(store); return count;
}

async function readStore() { try { const parsed = JSON.parse(await fs.readFile(filePath(), 'utf8')); return Array.isArray(parsed.notifications) ? parsed.notifications : []; } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }
async function writeStore(notifications) { await fs.mkdir(path.dirname(filePath()), { recursive: true }); await fs.writeFile(filePath(), `${JSON.stringify({ notifications }, null, 2)}\n`); }
function fromRow(row) { return { id: row.id, orderNumber: row.order_number, eventName: row.event_name, channel: row.channel, recipient: row.recipient, payload: row.payload, status: row.status, attemptCount: row.attempt_count, nextAttemptAt: row.next_attempt_at, lockedAt: row.locked_at, sentAt: row.sent_at, providerMessageId: row.provider_message_id, lastError: row.last_error, createdAt: row.created_at, updatedAt: row.updated_at }; }

module.exports = { claimDue, enqueueMany, listForOrder, markFailed, markSent, recoverStaleClaims, scheduleRetry };
