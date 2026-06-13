import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('admin shell and shared controls define responsive layout and small radius buttons', async () => {
  const css = await readFile(path.join(import.meta.dirname, '..', 'src', 'index.css'), 'utf8');
  const layout = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'AdminLayout.jsx'), 'utf8');

  assert.match(css, /--radius-admin/);
  assert.match(css, /\.btn-ink[\s\S]+rounded-\[var\(--radius-admin\)\]/);
  assert.match(css, /\.btn-ghost[\s\S]+rounded-\[var\(--radius-admin\)\]/);
  assert.match(css, /\.btn-secondary[\s\S]+rounded-\[var\(--radius-admin\)\]/);
  assert.match(css, /button,/);
  assert.match(css, /\.admin-mobile-nav a[\s\S]+rounded-\[var\(--radius-admin\)\]/);
  assert.match(css, /\.admin-mobile-nav[\s\S]+overflow-x-auto/);
  assert.match(css, /\.admin-main[\s\S]+min-w-0/);
  assert.match(css, /\.admin-shell[\s\S]+overflow-x-hidden/);
  assert.match(layout, /admin-shell/);
  assert.match(layout, /admin-mobile-nav/);
  assert.match(layout, /admin-main/);
});
