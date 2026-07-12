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

  assert.match(source, /const defaultLogo = body\.siteContent\?\.logo \|\| null;/);
  assert.match(source, /setHeaderLogo\(defaultLogo\);/);
  assert.match(source, /setBlackLogo\(body\.siteContent\?\.blackLogo/);
  assert.match(source, /setFooterLogo\(body\.siteContent\?\.footerLogo/);
  assert.match(source, /footerLogo\?\.url/);
  assert.match(source, /activeHeaderLogo\?\.url/);
  assert.match(source, /const activeHeaderLogo = headerSolid \? \(blackLogo \|\| headerLogo\) : headerLogo;/);
  assert.doesNotMatch(source, /menuLogo\?\.url/);
});

test('shell uses a transparent homepage header until the page scrolls', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'components', 'Shell.jsx'), 'utf8');

  assert.match(source, /normalizeCollectionDefinitions/);
  assert.match(source, /const isHomePage = location\.pathname === '\/';/);
  assert.match(source, /const \[headerScrolled, setHeaderScrolled\] = useState\(false\);/);
  assert.match(source, /window\.scrollY > 48/);
  assert.match(source, /const headerSolid = !isHomePage \|\| headerScrolled \|\| menuOpen;/);
  assert.match(source, /headerSolid \? 'border-line bg-paper text-ink shadow-\[0_12px_30px_rgba\(0,0,0,0\.08\)\]' : 'border-transparent bg-transparent text-paper shadow-none'/);
  assert.match(source, /aria-label="Shop categories"/);
  assert.match(source, />Shop Categories<\/span>/);
  assert.match(source, /max-h-12 opacity-100/);
  assert.match(source, /collection\.visible && collection\.showOnShop/);
  assert.match(source, /collections\/\$\{encodeURIComponent\(collection\.slug\)\}/);
  assert.doesNotMatch(source, /label: 'Best Seller'/);
  assert.doesNotMatch(source, /Restocked/);
  assert.doesNotMatch(source, /Long Sleeves/);
  assert.doesNotMatch(source, /Cotton'/);
  assert.match(source, /headerSolid \? 'ring-paper' : 'ring-white\/40'/);
});

test('shell uses a premium slide-in mobile drawer with centered mobile logo and account actions', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'components', 'Shell.jsx'), 'utf8');

  assert.match(source, /grid-cols-\[1fr_auto_1fr\]/);
  assert.match(source, /justify-self-center/);
  assert.match(source, /lg:flex lg:gap-6/);
  assert.match(source, /justify-self-end gap-4 sm:gap-6 lg:ml-auto/);
  assert.match(source, /to="\/cart"/);
  assert.doesNotMatch(source, /function CartLink/);
  assert.doesNotMatch(source, /function SearchIcon/);
  assert.doesNotMatch(source, /aria-label="Search"/);
  assert.doesNotMatch(source, /Maria Clara Clothing menu logo/);
  assert.match(source, /fixed inset-0 z-\[60\]/);
  assert.match(source, /storefront-menu-panel/);
  assert.match(source, /-translate-x-full/);
  assert.match(source, /aria-label="Close navigation menu"/);
  assert.match(source, /Menu items/);
  assert.match(source, /FAQ/);
  assert.match(source, /Terms/);
  assert.match(source, /Instagram/);
  assert.match(source, /Facebook/);
  assert.match(source, /Contact/);
  assert.match(source, /Account/);
  assert.doesNotMatch(source, /FACT/);
  assert.doesNotMatch(source, /TEES/);
  assert.doesNotMatch(source, /For Her/);
  assert.doesNotMatch(source, /Hoodies/);
  assert.doesNotMatch(source, /New essentials/);
});

test('shell refreshes changed site content and renders footer logo white', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'src', 'components', 'Shell.jsx'), 'utf8');

  assert.match(source, /maria-clara-site-content-changed/);
  assert.match(source, /window\.addEventListener\('maria-clara-site-content-changed'/);
  assert.match(source, /window\.removeEventListener\('maria-clara-site-content-changed'/);
  assert.match(source, /brightness-0 invert/);
});
