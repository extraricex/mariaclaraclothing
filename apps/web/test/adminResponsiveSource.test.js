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

test('admin shell exposes the approved Grafana operations visual system', async () => {
  const css = await readFile(path.join(import.meta.dirname, '..', 'src', 'index.css'), 'utf8');
  const layout = await readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'AdminLayout.jsx'), 'utf8');

  for (const token of ['--admin-bg', '--admin-panel', '--admin-sidebar', '--admin-orange', '--admin-blue', '--admin-green', '--admin-yellow', '--admin-red']) {
    assert.match(css, new RegExp(token));
  }
  for (const className of ['admin-page-header', 'admin-topbar', 'admin-panel', 'admin-metric-card', 'admin-table-shell', 'admin-status-good', 'admin-status-warn', 'admin-status-bad', 'admin-status-info']) {
    assert.match(css, new RegExp(`\\.${className}`));
  }
  assert.match(layout, /admin-brand-mark/);
  assert.match(layout, /admin-topbar/);
  assert.match(layout, /bg-\[var\(--admin-sidebar\)\]/);
});

test('legacy admin list surfaces inherit the Grafana dark surface system', async () => {
  const css = await readFile(path.join(import.meta.dirname, '..', 'src', 'index.css'), 'utf8');

  for (const selector of ['.admin-main .bg-paper', '.admin-main .bg-white', '.admin-main .bg-cream', '.admin-main .border-line', '.admin-main .text-ink', '.admin-main .text-clay']) {
    assert.match(css, new RegExp(selector.replaceAll('.', '\\.')));
  }
  assert.match(css, /--legacy-admin-surface/);
  assert.match(css, /--legacy-admin-surface-strong/);
  assert.match(css, /hover\\:bg-cream\\\/60/);
  assert.match(css, /\.admin-main \.product-search-field/);
  assert.match(css, /\.admin-main :is\(input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="file"\]\), select, textarea\)/);
});

test('admin product preview photos stay visible on dark Grafana surfaces', async () => {
  const css = await readFile(path.join(import.meta.dirname, '..', 'src', 'index.css'), 'utf8');

  assert.match(css, /\.admin-main \.product-photo-blend/);
  assert.match(css, /\.admin-main \.product-photo-blend[\s\S]+mix-blend-mode:\s*normal/);
  assert.match(css, /\.admin-main \.product-photo-blend[\s\S]+background/);
  assert.match(css, /\.admin-main :is\(img\.product-photo-blend\)/);
});

test('admin dashboard, login, and list pages expose mobile-first responsive helpers', async () => {
  const [css, login, dashboard, orders, products, customers, discounts, banners, settings] = await Promise.all([
    readFile(path.join(import.meta.dirname, '..', 'src', 'index.css'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Login.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Dashboard.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Orders.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Products.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Customers.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Discounts.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Banners.jsx'), 'utf8'),
    readFile(path.join(import.meta.dirname, '..', 'src', 'admin', 'Settings.jsx'), 'utf8')
  ]);

  assert.match(css, /\.admin-mobile-stack/);
  assert.match(css, /@media \(max-width:\s*639px\)[\s\S]*\.admin-main main/);
  assert.match(css, /\.admin-main table[\s\S]*white-space:\s*nowrap/);
  assert.match(login, /admin-login-shell/);
  assert.match(login, /admin-login-card/);
  assert.match(dashboard, /admin-dashboard-grid/);
  assert.match(orders, /admin-mobile-stack/);
  assert.match(products, /admin-mobile-stack/);
  assert.match(customers, /admin-table-shell/);
  assert.match(discounts, /admin-table-shell/);
  assert.match(banners, /admin-content-shell/);
  assert.match(settings, /admin-content-shell/);
});
