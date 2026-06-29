import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('cart drawer and checkout keep complete product photos in responsive frames', async () => {
  const shell = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'components', 'Shell.jsx'),
    'utf8'
  );
  const checkout = await readFile(
    path.join(import.meta.dirname, '..', 'src', 'pages', 'Checkout.jsx'),
    'utf8'
  );

  assert.match(
    shell,
    /className="aspect-\[4\/5\] w-16 shrink-0 self-start overflow-hidden bg-cream sm:w-20"/
  );
  assert.match(
    shell,
    /alt=\{item\.productName\}\s+className="product-photo-blend block h-full w-full object-contain"/
  );
  assert.doesNotMatch(
    shell,
    /alt=\{item\.productName\} className="[^"]*object-cover[^"]*"/
  );

  assert.match(
    checkout,
    /className="relative aspect-\[4\/5\] w-16 shrink-0 self-start overflow-hidden bg-cream sm:w-20"/
  );
  assert.match(
    checkout,
    /alt=\{item\.productName\}\s+className="product-photo-blend block h-full w-full object-contain"/
  );
  assert.doesNotMatch(
    checkout,
    /alt=\{item\.productName\} className="[^"]*object-cover[^"]*"/
  );
});
