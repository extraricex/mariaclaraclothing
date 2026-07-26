import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const source = (file) => readFile(path.join(root, file), 'utf8');

test('unknown storefront and product routes render a noindex not-found page', async () => {
  const [app, notFound, product, nginx] = await Promise.all([
    source('src/App.jsx'),
    source('src/pages/NotFound.jsx'),
    source('src/pages/Product.jsx'),
    source('nginx.conf')
  ]);

  assert.match(app, /<Route path="\*" element=\{<NotFound \/>\} \/>/);
  assert.doesNotMatch(app, /path="\*" element=\{<MaintenanceGate><Shell/);
  assert.match(notFound, /Page not found/);
  assert.match(notFound, /noindex/);
  assert.match(notFound, /Back to shop/);
  assert.match(product, /title="Product not found"/);
  assert.match(nginx, /error_page 404 =404 \/index\.html/);
  assert.match(nginx, /try_files \$uri \$uri\/ =404/);
  assert.match(nginx, /proxy_pass \$api_origin\/api\/products\/\$storefront_product_slug\/route/);
  assert.match(nginx, /location ~ \^\/product[\s\S]*error_page 404 =404 \/index\.html\?seo_path=\$uri/);
  assert.match(nginx, /proxy_pass \$api_origin\/api\/products\/\$legacy_product_slug\/route/);
  assert.match(nginx, /location ~ \^\/products\/oranges-mcc-box-tee\/\?\$ \{\s*return 301 \/product\/mariaclara-orange-crop-box-240-gsm-shirt\$is_args\$args;/);
  assert.match(nginx, /proxy_pass \$api_origin\/api\/collections\/\$storefront_collection_slug\/route/);
  assert.match(nginx, /location = \/pages\/terms-of-use[\s\S]*return 301 \/terms/);
  assert.match(nginx, /location = \/collections\/all[\s\S]*return 301 \/shop/);
  assert.match(nginx, /legacy_plural=1&\$args/);
  assert.match(nginx, /location = \/pages\/contact[\s\S]*return 301 \/contact\$is_args\$args/);
  assert.match(nginx, /location ~ \^\/policies\/\(\?:refund-policy\|shipping-policy\)/);
  assert.match(nginx, /absolute_redirect off/);
  assert.match(nginx, /error_page 404 =404 \/index\.html/);
});

test('production nginx serves the payment operations route as a normal SPA page', async () => {
  const nginx = await source('nginx.conf');
  assert.match(nginx, /\|\/payments\|/);
});

test('product links use public handles while carts retain internal product identifiers', async () => {
  const [productUrl, productCard, productPage, editor] = await Promise.all([
    source('src/lib/productUrl.js'),
    source('src/components/ProductCard.jsx'),
    source('src/pages/Product.jsx'),
    source('src/admin/ProductEditor.jsx')
  ]);
  assert.match(productUrl, /product\?\.publicHandle \|\| product\?\.slug/);
  assert.match(productCard, /to=\{productPath\(product\)\}/);
  assert.match(productPage, /slug: product\.slug/);
  assert.match(productPage, /publicHandle: product\.publicHandle/);
  assert.match(productPage, /productSeoDescriptor/);
  assert.match(editor, /Public handle/);
  assert.match(editor, /Product ID/);
  assert.match(editor, /Internal slug/);
  assert.match(editor, /Redirected previous handles/);
});

test('collection navigation and delayed homepage hashes target real collection slugs', async () => {
  const [home, shell] = await Promise.all([
    source('src/pages/Home.jsx'),
    source('src/components/Shell.jsx')
  ]);

  assert.match(home, /location\.hash/);
  assert.match(home, /document\.getElementById\(targetId\)\?\.scrollIntoView/);
  assert.match(home, /\[location\.hash, collectionSections\.length\]/);
  assert.match(shell, /to=\{`\/collections\/\$\{encodeURIComponent\(collection\.slug\)\}`\}/);
  assert.doesNotMatch(shell, /\/#best-sellers|\/#catalog/);
});

test('issue, account, contact, and product links expose explicit accessible names', async () => {
  const [widget, shell, contact, productCard] = await Promise.all([
    source('src/components/ReportIssueWidget.jsx'),
    source('src/components/Shell.jsx'),
    source('src/pages/Contact.jsx'),
    source('src/components/ProductCard.jsx')
  ]);

  assert.match(widget, /aria-label="Report an issue"/);
  assert.equal((shell.match(/\{loggedIn \? 'Account' : 'Log in'\}/g) || []).length, 2);
  assert.match(contact, /aria-label=\{`\$\{label\}: \$\{value\}`\}/);
  assert.match(productCard, /aria-label=\{`View \$\{product\.name\}/);
});

test('customer email authentication is intercepted and sent with POST requests', async () => {
  const [page, client] = await Promise.all([
    source('src/pages/CustomerAuth.jsx'),
    source('src/lib/customerAuth.js')
  ]);
  assert.match(page, /<form onSubmit=\{handleSubmit\}/);
  assert.match(page, /event\.preventDefault\(\)/);
  assert.match(client, /\/api\/customer\/login', \{ method: 'POST'/);
  assert.match(client, /\/api\/customer\/register', \{ method: 'POST'/);
});
