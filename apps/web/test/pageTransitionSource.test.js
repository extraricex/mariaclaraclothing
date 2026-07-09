import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = (relativePath) =>
  readFile(path.join(import.meta.dirname, '..', relativePath), 'utf8');

test('page transition uses the approved route motion and scroll reset', async () => {
  const component = await source('src/components/PageTransition.jsx');
  const css = await source('src/index.css');

  assert.match(component, /useLayoutEffect/);
  assert.match(component, /useLocation/);
  assert.match(component, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/);
  assert.match(component, /\[location\.pathname\]/);
  assert.match(component, /key=\{location\.pathname\}/);
  assert.match(component, /className="page-transition"/);

  assert.match(css, /@keyframes page-enter/);
  assert.match(css, /opacity:\s*0\.18[\s\S]*translateY\(10px\)/);
  assert.match(css, /\.page-transition\s*\{[\s\S]*background-color:\s*var\(--color-paper\)/);
  assert.match(css, /\.page-transition\s*\{[\s\S]*animation:\s*page-enter 420ms cubic-bezier\(0\.22, 1, 0\.36, 1\) backwards/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*\.page-transition[\s\S]*animation:\s*none !important[\s\S]*transform:\s*none !important/);
});

test('storefront content transitions while shell chrome and admin stay stable', async () => {
  const shell = await source('src/components/Shell.jsx');
  const app = await source('src/App.jsx');
  const admin = await source('src/admin/AdminLayout.jsx');

  assert.match(shell, /import PageTransition from '\.\/PageTransition\.jsx'/);
  assert.match(shell, /<main className="flex-1">\s*<PageTransition>\s*<Outlet \/>\s*<\/PageTransition>\s*<\/main>/);
  assert.match(app, /import PageTransition from '\.\/components\/PageTransition\.jsx'/);
  assert.match(app, /path="\/checkout" element=\{<MaintenanceGate><PageTransition><Checkout \/><\/PageTransition><\/MaintenanceGate>\}/);
  assert.match(app, /<Route path="\/admin" element=\{<AdminLayout \/>\}>/);
  assert.doesNotMatch(admin, /PageTransition/);
});
