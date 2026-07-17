const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  claimDueMetaEvents,
  insertMetaPurchaseOutbox,
  markMetaEventFailed,
  markMetaEventSent,
  recoverStaleMetaEventClaims,
  scheduleMetaEventRetry
} = require('../src/marketing/marketingEventOutboxRepository');

function recordingClient(rows = []) {
  const calls = [];
  return {
    calls,
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows, rowCount: rows.length };
    }
  };
}

test('Meta outbox schema enforces unique events and queryable pending state', async () => {
  const schema = await fs.readFile(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const migration = await fs.readFile(path.join(__dirname, '..', 'db', 'migrations', '20260620_meta_event_outbox.sql'), 'utf8');
  for (const sql of [schema, migration]) {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS marketing_event_outbox/);
    assert.match(sql, /event_id text NOT NULL UNIQUE/);
    assert.match(sql, /CHECK \(status IN \('pending', 'sending', 'sent', 'failed'\)\)/);
    assert.match(sql, /marketing_event_outbox_pending_idx/);
    assert.match(sql, /checkout_idempotency_key/);
  }
});

test('Meta outbox repository inserts and atomically claims due events', async () => {
  const client = recordingClient([{ id: 'meta-1', event_id: 'purchase_MCC-1', payload: {} }]);
  await insertMetaPurchaseOutbox(client, {
    event_name: 'Purchase',
    event_id: 'purchase_MCC-1',
    custom_data: { order_id: 'MCC-1', currency: 'PHP', value: 1278 }
  });
  await claimDueMetaEvents(client, { now: new Date('2026-06-20T12:00:00Z'), limit: 10 });

  assert.match(client.calls[0].sql, /INSERT INTO marketing_event_outbox/);
  assert.match(client.calls[0].sql, /ON CONFLICT \(event_id\) DO NOTHING/);
  assert.match(client.calls[1].sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(client.calls[1].sql, /status = 'sending'/);
});

test('Meta outbox refuses Purchase events with invalid value or currency', async () => {
  const client = recordingClient();
  for (const customData of [
    { currency: 'PHP', value: 0 },
    { currency: 'PHP', value: '1278' },
    { currency: 'PHP', value: Number.NaN },
    { currency: 'PHP 1278', value: 1278 },
    { value: 1278 }
  ]) {
    assert.equal(await insertMetaPurchaseOutbox(client, {
      event_name: 'Purchase', event_id: 'purchase_invalid', custom_data: customData
    }), null);
  }
  assert.equal(client.calls.length, 0);
});

test('Meta order schema persists exact Purchase value and PHP currency', async () => {
  const schema = await fs.readFile(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const migration = await fs.readFile(path.join(__dirname, '..', 'db', 'migrations', '20260717_meta_purchase_value_currency.sql'), 'utf8');
  for (const sql of [schema, migration]) {
    assert.match(sql, /meta_purchase_value/);
    assert.match(sql, /meta_purchase_currency/);
    assert.match(sql, /currency[^\n]*DEFAULT 'PHP'/);
  }
  assert.match(migration, /CHECK \(currency = 'PHP'\)/);
  assert.match(migration, /CHECK \(meta_purchase_value IS NULL OR meta_purchase_value > 0\)/);
});

test('Meta outbox repository records sent, retry, failed and stale states', async () => {
  const client = recordingClient();
  await markMetaEventSent(client, 'meta-1', { traceId: 'trace-1' });
  await scheduleMetaEventRetry(client, 'meta-1', {
    nextAttemptAt: new Date('2026-06-20T12:01:00Z'),
    error: 'timeout'
  });
  await markMetaEventFailed(client, 'meta-1', 'bad token');
  await recoverStaleMetaEventClaims(client, new Date('2026-06-20T11:55:00Z'));

  assert.match(client.calls[0].sql, /status = 'sent'/);
  assert.match(client.calls[1].sql, /status = 'pending'/);
  assert.match(client.calls[2].sql, /status = 'failed'/);
  assert.match(client.calls[3].sql, /locked_at < \$1/);
});
