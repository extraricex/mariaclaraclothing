import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');
const source = (file) => readFile(path.join(root, file), 'utf8');

test('customer homepage and product grids use compact mobile luxury spacing', async () => {
  const [home, productCard, css] = await Promise.all([
    source('pages/Home.jsx'),
    source('components/ProductCard.jsx'),
    source('index.css')
  ]);

  assert.match(home, /h-full w-full object-cover/);
  assert.match(home, /min-h-\[min\(58svh,430px\)\]/);
  assert.match(home, /className="block h-auto w-full select-none opacity-0/);
  assert.doesNotMatch(home, /min-h-\[clamp\(360px,64svh,560px\)\]/);
  assert.doesNotMatch(home, /max-h-\[560px\]/);
  assert.match(css, /\.customer-hero \.customer-compact-button/);
  assert.match(productCard, /mt-2 flex flex-col items-center gap-0\.5/);
  assert.doesNotMatch(productCard, /min-h-\[132px\]/);
  assert.match(css, /\.customer-compact-button/);
});

test('customer shell exposes a svg mobile menu and immediately visible mobile offers', async () => {
  const shell = await source('components/Shell.jsx');

  assert.match(shell, /const \[mobileOffersOpen, setMobileOffersOpen\] = useState\(true\)/);
  assert.doesNotMatch(shell, /setMobileOffersOpen\(false\);\n  }, \[location\.pathname\]\)/);
  assert.match(shell, /<svg[^>]*viewBox="0 0 24 24"[^>]*aria-hidden="true"[\s\S]*M4 7h16[\s\S]*M4 12h16[\s\S]*M4 17h16/);
  assert.doesNotMatch(shell, /function SearchIcon/);
  assert.doesNotMatch(shell, /aria-label="Search"/);
  assert.match(shell, /storefront-menu-panel/);
  assert.doesNotMatch(shell, />\{menuOpen \? 'Close' : 'Menu'\}<\/button>/);
  assert.match(shell, /storefront-offer-cards/);
});

test('product page gallery uses smaller arrows and touch swipe navigation', async () => {
  const product = await source('pages/Product.jsx');

  assert.match(product, /useRef/);
  assert.match(product, /handleImageTouchStart/);
  assert.match(product, /handleImageTouchEnd/);
  assert.match(product, /onTouchStart=\{handleImageTouchStart\}/);
  assert.match(product, /onTouchEnd=\{handleImageTouchEnd\}/);
  assert.match(product, /aria-label=\{`View product image \$\{index \+ 1\}`\}/);
  assert.match(product, /product-gallery-dot/);
  assert.match(product, /product-gallery-thumbnail/);
  assert.match(product, /h-8 w-8/);
  assert.doesNotMatch(product, /rounded-full bg-white\/90 text-2xl/);
  assert.match(product, /min-w-10 rounded-full border border-line px-3 py-2 text-\[11px\]/);
});

test('checkout validates missing fields with scroll focus and red field styling', async () => {
  const [checkout, css] = await Promise.all([
    source('pages/Checkout.jsx'),
    source('index.css')
  ]);

  assert.match(checkout, /useRef/);
  assert.match(checkout, /missingFields/);
  assert.match(checkout, /checkoutFieldRefs/);
  assert.match(checkout, /scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
  assert.match(checkout, /role=\{status\.tone === 'error' \? 'alert' : 'status'\}/);
  assert.match(checkout, /noValidate/);
  assert.match(css, /\.checkout-field-error/);
});
