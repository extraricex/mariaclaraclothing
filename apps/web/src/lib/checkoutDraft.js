const CHECKOUT_DRAFT_KEY = 'maria-clara-checkout-review-draft';
const CHECKOUT_DRAFT_VERSION = 1;
const CHECKOUT_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

function browserStorage(storage) {
  if (storage) return storage;
  return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
}

export function checkoutCartFingerprint(items = []) {
  return JSON.stringify((Array.isArray(items) ? items : [])
    .map((item) => ({
      productId: String(item.productId || ''),
      variantId: String(item.variantId || ''),
      quantity: Number(item.quantity || 0)
    }))
    .sort((left, right) => `${left.productId}:${left.variantId}`.localeCompare(`${right.productId}:${right.variantId}`)));
}

export function saveCheckoutReviewDraft(value, storage) {
  const target = browserStorage(storage);
  if (!target) return null;
  const draft = {
    ...value,
    version: CHECKOUT_DRAFT_VERSION,
    savedAt: Date.now()
  };
  target.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
  return draft;
}

export function loadCheckoutReviewDraft(storage, now = Date.now()) {
  const target = browserStorage(storage);
  if (!target) return null;
  try {
    const draft = JSON.parse(target.getItem(CHECKOUT_DRAFT_KEY) || 'null');
    if (!draft || draft.version !== CHECKOUT_DRAFT_VERSION) return null;
    if (!Number.isFinite(draft.savedAt) || now - draft.savedAt > CHECKOUT_DRAFT_TTL_MS) {
      target.removeItem(CHECKOUT_DRAFT_KEY);
      return null;
    }
    return draft;
  } catch (_error) {
    target.removeItem(CHECKOUT_DRAFT_KEY);
    return null;
  }
}

export function clearCheckoutReviewDraft(storage) {
  browserStorage(storage)?.removeItem(CHECKOUT_DRAFT_KEY);
}

export function checkoutDraftMatchesCart(draft, items, cartSessionId) {
  return Boolean(
    draft &&
    draft.cartSessionId === cartSessionId &&
    draft.cartFingerprint === checkoutCartFingerprint(items)
  );
}

