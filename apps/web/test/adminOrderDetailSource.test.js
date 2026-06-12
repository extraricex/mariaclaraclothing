import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('admin order detail editor exposes contact, separated address, and item editing fields', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'OrderDetail.jsx'), 'utf8');

  assert.match(source, /customer:\s*\{/);
  assert.match(source, /fullName:\s*order\.customer\?\.fullName/);
  assert.match(source, /phone:\s*order\.customer\?\.phone/);
  assert.match(source, /email:\s*order\.customer\?\.email/);
  assert.match(source, /items:\s*\(order\.items/);
  assert.match(source, /changes\.customer\s*=\s*form\.customer/);
  assert.match(source, /changes\.items\s*=\s*form\.items/);
  assert.match(source, /House \/ Street/);
  assert.match(source, /City \/ Municipality/);
  assert.match(source, /Barangay/);
  assert.match(source, /Province/);
  assert.match(source, /Product name/);
  assert.match(source, /Unit price/);
  assert.match(source, /updateItem/);
  assert.match(source, /removeItem/);
  assert.match(source, /addItem/);
});
