import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('shell uses the bag svg for the cart link', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'components', 'Shell.jsx'), 'utf8');

  assert.match(source, /function CartIcon/);
  assert.match(source, /className="bi bi-bag"/);
  assert.match(source, /viewBox="0 0 16 16"/);
  assert.match(source, /aria-label="Cart"/);
  assert.doesNotMatch(source, />Cart\s*\{/);
});

test('shell renders the header logo about 15px larger', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'components', 'Shell.jsx'), 'utf8');

  assert.match(source, /h-\[65px\]/);
  assert.match(source, /lg:h-\[73px\]/);
  assert.match(source, /max-w-\[205px\]/);
});

test('shell uses separate header and footer logos from site content', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'components', 'Shell.jsx'), 'utf8');

  assert.match(source, /setHeaderLogo\(body\.siteContent\?\.logo/);
  assert.match(source, /setFooterLogo\(body\.siteContent\?\.footerLogo/);
  assert.match(source, /footerLogo\?\.url/);
  assert.match(source, /headerLogo\?\.url/);
});
