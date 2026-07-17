const test = require('node:test');
const assert = require('node:assert/strict');
const {
  claimBrowserMetaPurchaseDispatch,
  completeBrowserMetaPurchaseDispatch,
  findMetaPurchaseDispatch,
  findMetaPurchaseOutboxSnapshot
} = require('../src/marketing/metaEventDispatchRepository');

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

test('browser dispatch claim is atomic and only reclaims a confirmed non-send', async () => {
  const client = recordingClient([{ id: 'browser-1', status: 'claimed' }]);
  const result = await claimBrowserMetaPurchaseDispatch(client, {
    orderNumber: 'MCC-1', eventId: 'purchase_MCC-1', value: 1278, currency: 'PHP', claimId: 'claim-1'
  });
  assert.equal(result.status, 'claimed');
  assert.match(client.calls[0].sql, /INSERT INTO meta_event_dispatches/);
  assert.match(client.calls[0].sql, /ON CONFLICT \(order_number, event_name, source\) DO UPDATE/);
  assert.match(client.calls[0].sql, /status IN \('failed','skipped'\)/);
  assert.deepEqual(client.calls[0].values.slice(1), ['MCC-1', 'purchase_MCC-1', 1278, 'PHP', 'claim-1']);
});

test('browser dispatch completion cannot be renewed after a lost response', async () => {
  const client = recordingClient([{ id: 'browser-1', status: 'sent' }]);
  await completeBrowserMetaPurchaseDispatch(client, {
    orderNumber: 'MCC-1', claimId: 'claim-1', sent: true, completedAt: new Date('2026-07-17T00:00:00Z')
  });
  assert.match(client.calls[0].sql, /status = 'claimed'/);
  assert.match(client.calls[0].sql, /source = 'browser'/);
});

test('dispatch and immutable outbox snapshot lookups are scoped to Purchase', async () => {
  const client = recordingClient([{ event_id: 'purchase_MCC-1' }]);
  await findMetaPurchaseDispatch(client, { orderNumber: 'MCC-1', source: 'browser' });
  await findMetaPurchaseOutboxSnapshot(client, 'purchase_MCC-1');
  assert.match(client.calls[0].sql, /event_name = 'Purchase'/);
  assert.match(client.calls[1].sql, /event_name = 'Purchase'/);
});
