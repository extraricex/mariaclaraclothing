const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pages = ['index.html', 'product.html', 'cart.html', 'faq.html', 'shipping-returns.html', 'terms.html'];
const bootstrapCommercePages = ['index.html', 'product.html', 'cart.html', 'checkout.html', 'thank-you.html'];

function assertBootstrapBeforeCustomStyles(html, page) {
  const bootstrapIndex = html.indexOf('bootstrap@5.3.3/dist/css/bootstrap.min.css');
  const customStyleIndex = html.indexOf('<link rel="stylesheet" href="/styles.css">');

  assert.notEqual(bootstrapIndex, -1, `${page} should load Bootstrap 5.3.3`);
  assert.notEqual(customStyleIndex, -1, `${page} should load custom styles`);
  assert.ok(bootstrapIndex < customStyleIndex, `${page} should load Bootstrap before custom styles`);
}

test('all customer pages use the Shopify-style shell', () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', page), 'utf8');

    assert.match(html, /<body class="[^"]*\bshopify-prototype\b/, `${page} should use prototype body class`);
    assert.match(html, /data-announcement-bar/, `${page} should include announcement bar`);
    assert.match(html, /class="shopify-header"/, `${page} should include Shopify-style header`);
    assert.match(html, /data-menu-drawer/, `${page} should include menu drawer`);
    assert.match(html, /data-search-overlay/, `${page} should include search overlay`);
    assert.match(html, /class="site-footer shopify-footer"/, `${page} should include Shopify-style footer`);
    assert.match(html, /\/js\/shell\.js/, `${page} should load shared shell behavior`);
  }
});

test('all customer pages use the Maria Clara reference navbar layout', () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', page), 'utf8');

    assert.match(html, /<nav class="header-inline-nav" aria-label="Primary">/, `${page} should include left inline nav`);
    assert.match(html, /<a href="\/faq\.html">FAQ<\/a>[\s\S]*<a href="\/shipping-returns\.html">Shipping and Returns<\/a>[\s\S]*<a href="\/terms\.html">Terms of Use<\/a>[\s\S]*<a href="\/#new-arrivals">NEW ARRIVALS<\/a>/, `${page} should match reference nav link order`);
    assert.match(html, /class="[^"]*\bheader-action-text\b[^"]*"[^>]*data-search-open/, `${page} should include Search action`);
    assert.match(html, /class="[^"]*\bheader-action-text\b[^"]*\baccount-link\b[^"]*"/, `${page} should include Log in action`);
    assert.match(html, /class="[^"]*\bheader-action-text\b[^"]*\bcart-link\b[^"]*"[\s\S]*<span data-cart-count>[^<]*<\/span>/, `${page} should include Cart action`);
  }
});

test('mobile drawer uses clear customer-facing labels and search supports discovery terms', () => {
  const shell = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'shell.js'), 'utf8');

  for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', page), 'utf8');
    assert.match(html, /<a href="\/shipping-returns\.html">SHIPPING &amp; RETURNS<\/a>/, `${page} drawer should use Shipping & Returns label`);
    assert.doesNotMatch(html, />SHIPPING<\/a>/, `${page} drawer should not use short Shipping label`);
  }

  assert.match(shell, /productSearchText\(product\)/);
  assert.match(shell, /product\.description/);
  assert.match(shell, /product\.collections/);
  assert.match(shell, /variant\.size/);
  assert.match(shell, /Available sizes:/);
  assert.match(shell, /Try "orange", "mandala", or "oversized"/);
});

test('navbar links only underline on hover or keyboard focus', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(styles, /\.header-inline-nav a,\s*\.header-action-text\s*{[^}]*text-decoration:\s*none/s);
  assert.match(styles, /\.header-inline-nav a:is\(:hover,\s*:focus-visible\),\s*\.header-action-text:is\(:hover,\s*:focus-visible\)\s*{[^}]*text-decoration:\s*underline/s);
  assert.match(styles, /\.drawer nav a\s*{[^}]*color:\s*var\(--black\)[^}]*text-decoration:\s*none[^}]*border-bottom:\s*0/s);
  assert.match(styles, /\.drawer nav a:is\(:hover,\s*:focus-visible\)\s*{[^}]*text-decoration:\s*underline/s);
});

test('cart count uses a red badge in the customer header', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(styles, /\.header-action-text \[data-cart-count\]\s*{[^}]*background:\s*#d71920[^}]*color:\s*var\(--white\)/s);
});

test('customer pages use smooth page transitions for link navigation', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const shell = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'shell.js'), 'utf8');

  assert.match(styles, /@keyframes page-enter/);
  assert.match(styles, /body\s*{[^}]*animation:\s*page-enter\s+220ms\s+ease-out/s);
  assert.match(styles, /body\.is-page-leaving\s*{[^}]*animation:\s*page-leave\s+160ms\s+ease-in\s+forwards/s);
  assert.match(styles, /::view-transition-old\(root\)/);
  assert.match(shell, /bindPageTransitions\(\)/);
  assert.match(shell, /function bindPageTransitions\(\)/);
  assert.match(shell, /document\.body\.classList\.add\('is-page-leaving'\)/);
  assert.match(shell, /window\.setTimeout\(\(\) => \{\s*window\.location\.href = link\.href;\s*\}, 150\)/s);
});

test('product and cart pages use the same icon header treatment as the homepage', () => {
  const pagesWithIconHeader = ['product.html', 'cart.html'];

  for (const page of pagesWithIconHeader) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', page), 'utf8');

    assertBootstrapBeforeCustomStyles(html, page);
    assert.match(html, /class="bi bi-list"/, `${page} should use menu icon`);
    assert.match(html, /class="bi bi-search"/, `${page} should use search icon`);
    assert.match(html, /class="bi bi-person-circle"/, `${page} should use account icon`);
    assert.match(html, /class="bi bi-cart4"/, `${page} should use cart icon`);
    assert.doesNotMatch(html, /class="[^"]*\bheader-action-text\b[^"]*"[^>]*>Search<\/button>/, `${page} should not use text search action`);
    assert.doesNotMatch(html, /class="[^"]*\bheader-action-text\b[^"]*\baccount-link\b[^"]*"[^>]*>Log in<\/a>/, `${page} should not use text account action`);
    assert.doesNotMatch(html, /class="[^"]*\bheader-action-text\b[^"]*\bcart-link\b[^"]*"[^>]*>Cart <span data-cart-count>0<\/span><\/a>/, `${page} should not use text cart action`);
  }
});

test('checkout page uses a focused Shopify-style checkout shell', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'checkout.html'), 'utf8');

  assert.match(html, /<body class="[^"]*\bshopify-prototype\b[^"]*\bcheckout-page\b/);
  assert.match(html, /class="[^"]*\bcheckout-brand-header\b/);
  assert.match(html, /class="[^"]*\bcheckout-logo\b/);
  assert.match(html, /class="[^"]*\bcheckout-breadcrumbs\b/);
  assert.match(html, /Cart[\s\S]*Information[\s\S]*Shipping[\s\S]*Payment/);
  assert.match(html, /class="site-footer shopify-footer"/);
  assert.match(html, /\/js\/shell\.js/);
  assert.doesNotMatch(html, /class="shopify-header"/);
  assert.doesNotMatch(html, /data-menu-drawer/);
  assert.doesNotMatch(html, /data-search-overlay/);
});

test('commerce customer pages use Bootstrap as a base layer under custom storefront styles', () => {
  for (const page of bootstrapCommercePages) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', page), 'utf8');
    assertBootstrapBeforeCustomStyles(html, page);
  }
});
