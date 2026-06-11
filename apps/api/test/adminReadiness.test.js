const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('future admin system has roadmap modules and data contracts', () => {
  const root = path.join(__dirname, '..');
  const repoRoot = path.join(root, '..', '..');
  const roadmapPath = path.join(repoRoot, 'docs', 'admin-system-roadmap.md');
  const adminAreas = ['products', 'orders', 'customers', 'discounts', 'analytics', 'marketing', 'settings'];

  const roadmap = fs.readFileSync(roadmapPath, 'utf8');
  assert.match(roadmap, /Products/);
  assert.match(roadmap, /Orders/);
  assert.match(roadmap, /Customers/);
  assert.match(roadmap, /Discounts/);
  assert.match(roadmap, /Analytics/);
  assert.match(roadmap, /Marketing/);

  adminAreas.forEach((area) => {
    const modulePath = path.join(root, 'src', area, 'README.md');
    const contractPath = path.join(root, 'data', 'admin-contracts', `${area}.json`);
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

    assert.ok(fs.existsSync(modulePath), `${area} module readme should exist`);
    assert.equal(contract.area, area);
    assert.ok(Array.isArray(contract.managedFields));
    assert.ok(contract.managedFields.length > 0);
    assert.ok(Array.isArray(contract.futureAdminActions));
    assert.ok(contract.futureAdminActions.length > 0);
  });
});

test('cart and checkout fields map to future admin order management', () => {
  const root = path.join(__dirname, '..');
  const cartScript = fs.readFileSync(path.join(root, 'public', 'js', 'cart.js'), 'utf8');
  const orderContract = JSON.parse(fs.readFileSync(path.join(root, 'data', 'admin-contracts', 'orders.json'), 'utf8'));
  const roadmap = fs.readFileSync(path.join(root, '..', '..', 'docs', 'admin-system-roadmap.md'), 'utf8');

  assert.ok(orderContract.managedFields.includes('cartSnapshot'));
  assert.ok(orderContract.managedFields.includes('checkoutChannel'));
  assert.ok(orderContract.managedFields.includes('fulfillmentStatus'));
  assert.ok(orderContract.managedFields.includes('paymentStatus'));
  assert.ok(orderContract.managedFields.includes('adminEditableTotals'));
  assert.ok(orderContract.managedFields.includes('shippingRegion'));
  assert.ok(orderContract.managedFields.includes('shippingRegionLabel'));
  assert.ok(orderContract.managedFields.includes('freeShippingUnlocked'));
  assert.match(cartScript, /cartSnapshot/);
  assert.match(cartScript, /checkoutChannel:\s*'storefront_cart'/);
  assert.match(cartScript, /adminEditableTotals/);
  assert.match(roadmap, /Cart and checkout admin alignment/);
});
