import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAIM_OFFER_CODE,
  claimOffer,
  claimedOfferCode,
  claimOfferWasDismissed,
  dismissClaimOffer,
  offerWasClaimedOrRedeemed,
  redeemClaimedOffer
} from '../src/lib/claimOffer.js';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

test('claimable offer persists once and stops applying after redemption', () => {
  const local = storage();

  assert.equal(claimedOfferCode(local), '');
  assert.equal(claimOffer(local), CLAIM_OFFER_CODE);
  assert.equal(claimedOfferCode(local), CLAIM_OFFER_CODE);
  assert.equal(offerWasClaimedOrRedeemed(local), true);

  redeemClaimedOffer(local);
  assert.equal(claimedOfferCode(local), '');
  assert.equal(offerWasClaimedOrRedeemed(local), true);
});

test('dismissal lasts for the browsing session without consuming the claim', () => {
  const session = storage();
  assert.equal(claimOfferWasDismissed(session), false);
  dismissClaimOffer(session);
  assert.equal(claimOfferWasDismissed(session), true);
});
