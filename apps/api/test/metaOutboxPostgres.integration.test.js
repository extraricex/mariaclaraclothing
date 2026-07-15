const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const {
  claimDueMetaEvents,
  insertMetaPurchaseOutbox,
  markMetaEventSent
} = require('../src/marketing/marketingEventOutboxRepository');

const databaseUrl = process.env.TEST_POSTGRES_URL;

test('PostgreSQL Meta outbox enforces deduplication and delivery transitions', {
  skip: databaseUrl ? false : 'TEST_POSTGRES_URL is not set'
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const event = {
    event_name: 'Purchase',
    event_id: `purchase_integration-${suffix}`,
    user_data: { em: ['hashed'] },
    custom_data: { order_id: `integration-${suffix}`, currency: 'PHP', value: 1278 }
  };

  try {
    const inserted = await insertMetaPurchaseOutbox(pool, event);
    const duplicate = await insertMetaPurchaseOutbox(pool, event);
    assert.ok(inserted?.id);
    assert.equal(duplicate, null);

    const claimed = await claimDueMetaEvents(pool, { now: new Date(), limit: 10 });
    const row = claimed.find((candidate) => candidate.event_id === event.event_id);
    assert.equal(row.status, 'sending');
    assert.equal(row.attempt_count, 1);

    await markMetaEventSent(pool, row.id, { traceId: 'integration-trace' });
    const saved = await pool.query(
      'SELECT status, provider_trace_id, payload FROM marketing_event_outbox WHERE id = $1',
      [row.id]
    );
    assert.equal(saved.rows[0].status, 'sent');
    assert.equal(saved.rows[0].provider_trace_id, 'integration-trace');
    assert.deepEqual(saved.rows[0].payload.user_data, {});
  } finally {
    await pool.query('DELETE FROM marketing_event_outbox WHERE event_id = $1', [event.event_id]);
    await pool.end();
  }
});
