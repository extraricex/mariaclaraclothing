import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('admin orders page supports date filters, summaries, richer columns, and filtered J&T export', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Orders.jsx'), 'utf8');

  assert.match(source, /DATE_RANGE_OPTIONS/);
  assert.match(source, /dateRange/);
  assert.match(source, /dateFrom/);
  assert.match(source, /dateTo/);
  assert.match(source, /params\.set\('dateRange', dateRange\)/);
  assert.match(source, /params\.set\('dateFrom', dateFrom\)/);
  assert.match(source, /params\.set\('dateTo', dateTo\)/);
  assert.match(source, /summaryCards/);
  assert.match(source, /Filtered orders/);
  assert.match(source, /Total sales/);
  assert.match(source, /Items sold/);
  assert.match(source, /Delivered/);
  assert.match(source, /exportableOrderNumbers/);
  assert.match(source, /jntExportStatus === 'ready'/);
  assert.match(source, /orderNumbers: exportableOrderNumbers/);
  assert.match(source, /paymentStatusLabel/);
  assert.match(source, /fulfillmentStatusLabel/);
  assert.match(source, /shippingRegionLabel/);
  assert.match(source, /itemCount/);
  assert.match(source, /admin-page-header/);
  assert.match(source, /admin-metric-card/);
  assert.match(source, /admin-table-shell/);
  assert.match(source, /admin-status-/);
});
