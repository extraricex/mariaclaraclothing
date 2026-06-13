import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const settingsPath = path.join(import.meta.dirname, '..', 'src', 'admin', 'Settings.jsx');

test('admin settings page edits all four sections against the settings API', async () => {
  const source = await readFile(settingsPath, 'utf8');

  assert.match(source, /\/api\/admin\/settings/);
  assert.match(source, /\/api\/admin\/settings\/general/);
  assert.match(source, /\/api\/admin\/settings\/shipping/);
  assert.match(source, /\/api\/admin\/settings\/payments/);
  assert.match(source, /\/api\/admin\/settings\/security\/password/);
  assert.match(source, /\/api\/admin\/settings\/security\/rotate-token/);
  assert.match(source, /setAdminToken/);
  assert.match(source, /freeShippingMinimumItems/);
  // section headers are collapsible toggles
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /setOpen/);
  // peso at the UI edge only
  assert.match(source, /centsFromPeso/);
  assert.doesNotMatch(source, /name="feeCents"/);
  // the old static placeholder is gone
  assert.doesNotMatch(source, /WORKING_NOW/);
  assert.doesNotMatch(source, /Coming next/);
});

test('settings page includes SEO and maintenance cards', async () => {
  const source = await readFile(settingsPath, 'utf8');

  assert.match(source, /\/api\/admin\/settings\/website/);
  assert.match(source, /Share image URL/);
  assert.match(source, /maintenanceMode/);
  assert.match(source, /checkout is disabled/);
});
