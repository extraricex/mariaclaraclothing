import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const shellPath = path.join(import.meta.dirname, '..', 'src', 'components', 'Shell.jsx');

test('storefront renders approved opposite-corner offer and Messenger support controls', async () => {
  const source = await readFile(shellPath, 'utf8');
  assert.match(source, /function FreeShippingAside/);
  assert.match(source, /function OfferDock/);
  assert.match(source, /bottom-\[max\(/);
  assert.match(source, /GET.*FREE SHIPPING|offer\.title/);
  assert.match(source, /Shop now/);
  assert.match(source, /function MessengerSupportLink/);
  assert.match(source, /right-2/);
  assert.match(source, /Chat Support — open Messenger/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, /storeInfo\?\.messengerUrl/);
});

test('privacy dialog opens only from the footer and is not an automatic aside', async () => {
  const source = await readFile(shellPath, 'utf8');
  assert.match(source, /privacyDialogOpen/);
  assert.match(source, /setPrivacyDialogOpen\(true\)/);
  assert.match(source, /setPrivacyDialogOpen\(false\)/);
  assert.doesNotMatch(source, /trackingConsent === 'unset'/);
});

test('storefront loads one dismissible New Arrivals recommendation into a responsive offer dock', async () => {
  const source = await readFile(shellPath, 'utf8');
  assert.match(source, /fetchProducts/);
  assert.match(source, /selectNewArrivalRecommendation/);
  assert.match(source, /function ProductRecommendation/);
  assert.match(source, /You may also like/);
  assert.match(source, /RECOMMENDATION_DISMISSED/);
  assert.match(source, /aria-expanded=\{mobileOffersOpen\}/);
  assert.match(source, /aria-controls="storefront-offer-cards"/);
  assert.match(source, /Offers · \{offerCount\}/);
  assert.match(source, /pointer-events-none/);
  assert.match(source, /sm:hidden/);
  assert.match(source, /sm:grid/);
});

test('Messenger support uses a visible responsive Chat Support label', async () => {
  const source = await readFile(shellPath, 'utf8');
  assert.match(source, />Chat Support</);
  assert.match(source, />Chat</);
  assert.match(source, /sm:hidden/);
  assert.match(source, /hidden sm:inline/);
});
