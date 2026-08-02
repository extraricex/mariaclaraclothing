export const CLAIM_OFFER_CODE = 'CLAIM5';
export const CLAIM_OFFER_STATE_KEY = 'maria-clara-claim5-offer-state-v1';
export const CLAIM_OFFER_DISMISSED_KEY = 'maria-clara-claim5-offer-dismissed';
export const CLAIM_OFFER_CHANGED_EVENT = 'maria-clara-claim-offer-changed';

function browserLocalStorage(storage) {
  if (storage) return storage;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function browserSessionStorage(storage) {
  if (storage) return storage;
  return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
}

export function claimOffer(storage) {
  try {
    browserLocalStorage(storage)?.setItem(CLAIM_OFFER_STATE_KEY, 'claimed');
  } catch (_error) {
    // The current page still applies the claimed code through component state.
  }
  return CLAIM_OFFER_CODE;
}

export function claimedOfferCode(storage) {
  try {
    return browserLocalStorage(storage)?.getItem(CLAIM_OFFER_STATE_KEY) === 'claimed'
      ? CLAIM_OFFER_CODE
      : '';
  } catch (_error) {
    return '';
  }
}

export function redeemClaimedOffer(storage) {
  try {
    if (browserLocalStorage(storage)?.getItem(CLAIM_OFFER_STATE_KEY) === 'claimed') {
      browserLocalStorage(storage)?.setItem(CLAIM_OFFER_STATE_KEY, 'redeemed');
    }
  } catch (_error) {
    // A completed order remains authoritative even if storage is unavailable.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CLAIM_OFFER_CHANGED_EVENT));
  }
}

export function offerWasClaimedOrRedeemed(storage) {
  try {
    return ['claimed', 'redeemed'].includes(
      browserLocalStorage(storage)?.getItem(CLAIM_OFFER_STATE_KEY)
    );
  } catch (_error) {
    return false;
  }
}

export function dismissClaimOffer(storage) {
  try {
    browserSessionStorage(storage)?.setItem(CLAIM_OFFER_DISMISSED_KEY, 'true');
  } catch (_error) {
    // The current page still closes the offer through component state.
  }
}

export function claimOfferWasDismissed(storage) {
  try {
    return browserSessionStorage(storage)?.getItem(CLAIM_OFFER_DISMISSED_KEY) === 'true';
  } catch (_error) {
    return false;
  }
}
