import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'src');
const source = (file) => readFile(path.join(root, file), 'utf8');

test('storefront exposes one claimable 5% popup and carries it through checkout', async () => {
  const [shell, cart, checkout, review, offer] = await Promise.all([
    source('components/Shell.jsx'),
    source('pages/Cart.jsx'),
    source('pages/Checkout.jsx'),
    source('pages/CheckoutReview.jsx'),
    source('lib/claimOffer.js')
  ]);

  assert.match(shell, /aria-labelledby="claim-offer-title"/);
  assert.match(shell, /Claim my 5% off/);
  assert.match(shell, /Take 5% off every item/);
  assert.match(shell, /automatic free shipping can still apply/);
  assert.match(shell, /location\.pathname\.startsWith\('\/product\/'\)/);
  assert.match(shell, /location\.pathname\.startsWith\('\/collections\/'\)/);
  assert.match(shell, /window\.setTimeout\(\(\) => setClaimOfferOpen\(true\), 1800\)/);
  assert.match(shell, /discountCode: activeClaimOfferCode/);
  assert.match(cart, /discountCode: offerCode/);
  assert.match(checkout, /discountCode: checkoutDiscountCode/);
  assert.match(review, /latestQuote\.discountCode === CLAIM_OFFER_CODE/);
  assert.match(offer, /CLAIM_OFFER_CODE = 'CLAIM5'/);
  assert.match(offer, /'redeemed'/);
});

test('claim offer migration seeds a real active percentage discount', async () => {
  const migration = await readFile(
    path.join(import.meta.dirname, '..', '..', 'api', 'db', 'migrations', '20260802_claimable_five_percent_offer.sql'),
    'utf8'
  );
  assert.match(migration, /'CLAIM5'/);
  assert.match(migration, /'percentage'/);
  assert.match(migration, /\n  5,\n/);
  assert.match(migration, /ON CONFLICT \(code\) DO UPDATE/);
});
