import { useSyncExternalStore } from 'react';

const CART_KEY = 'maria-clara-cart';
const CART_EVENT = 'maria-clara-cart-changed';
export const CART_DRAWER_EVENT = 'maria-clara-cart-drawer-open';
const CART_SESSION_KEY = 'maria-clara-cart-session-id';
const CHECKOUT_IDEMPOTENCY_KEY = 'maria-clara-checkout-idempotency';

function fallbackUuid() {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createCheckoutIdempotencyToken() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return fallbackUuid();
}

export function getCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CART_EVENT));
  syncCartSession({ items });
}

export function replaceCart(items) {
  saveCart(Array.isArray(items) ? items : []);
}

function normalizeMaxStock(value) {
  const maxStock = Math.trunc(Number(value));
  return Number.isInteger(maxStock) && maxStock >= 0 ? maxStock : null;
}

function stockLimitResult(quantity, maxStock, limited = false) {
  return {
    ok: !limited,
    quantity,
    maxStock,
    limited,
    reason: limited ? 'max_stock' : ''
  };
}

export function getCartSessionId() {
  let sessionId = localStorage.getItem(CART_SESSION_KEY);
  if (!sessionId) {
    sessionId = `cart-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(CART_SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function resetCartSessionId() {
  localStorage.removeItem(CART_SESSION_KEY);
}

export function getCheckoutIdempotencyKey(
  quoteId,
  storage = globalThis.sessionStorage,
  create = createCheckoutIdempotencyToken
) {
  let current = null;
  try {
    current = JSON.parse(storage.getItem(CHECKOUT_IDEMPOTENCY_KEY) || 'null');
  } catch (_error) {
    current = null;
  }
  if (current?.quoteId === quoteId && current?.key) return current.key;
  const key = create();
  storage.setItem(CHECKOUT_IDEMPOTENCY_KEY, JSON.stringify({ quoteId, key }));
  return key;
}

export function clearCheckoutIdempotencyKey(storage = globalThis.sessionStorage) {
  storage.removeItem(CHECKOUT_IDEMPOTENCY_KEY);
}

export function syncCartSession(payload = {}) {
  if (typeof window === 'undefined') return Promise.resolve();
  const sessionId = getCartSessionId();
  const items = Array.isArray(payload.items) ? payload.items : getCart();
  return fetch(`/api/cart-sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, items })
  }).catch(() => {});
}

export function addToCart(item) {
  const cart = getCart();
  const requestedQuantity = Math.max(1, Math.trunc(Number(item.quantity || 1)));
  const itemMaxStock = normalizeMaxStock(item.maxStock);
  const existing = cart.find((cartItem) => cartItem.variantId === item.variantId);
  if (existing) {
    const maxStock = normalizeMaxStock(existing.maxStock) ?? itemMaxStock;
    const nextQuantity = Number(existing.quantity || 0) + requestedQuantity;
    existing.maxStock = maxStock ?? existing.maxStock;
    existing.quantity = maxStock === null ? nextQuantity : Math.min(nextQuantity, maxStock);
    saveCart(cart);
    return stockLimitResult(existing.quantity, maxStock, maxStock !== null && nextQuantity > maxStock);
  } else {
    const nextQuantity = itemMaxStock === null ? requestedQuantity : Math.min(requestedQuantity, itemMaxStock);
    cart.push({ ...item, quantity: nextQuantity, maxStock: itemMaxStock ?? item.maxStock });
    saveCart(cart);
    return stockLimitResult(nextQuantity, itemMaxStock, itemMaxStock !== null && requestedQuantity > itemMaxStock);
  }
}

export function openCartDrawer() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CART_DRAWER_EVENT));
}

export function updateQuantity(variantId, quantity) {
  const nextQuantity = Number(quantity);
  let result = { ok: true, quantity: nextQuantity, maxStock: null, limited: false, reason: '' };
  const nextCart = getCart()
    .map((item) => {
      if (item.variantId !== variantId) return item;
      const maxStock = normalizeMaxStock(item.maxStock);
      const safeQuantity = Math.trunc(Number(nextQuantity));
      const clampedQuantity = maxStock === null ? safeQuantity : Math.min(safeQuantity, maxStock);
      result = stockLimitResult(clampedQuantity, maxStock, maxStock !== null && safeQuantity > maxStock);
      return { ...item, quantity: clampedQuantity };
    })
    .filter((item) => item.quantity > 0);
  saveCart(nextCart);
  return result;
}

export function removeFromCart(variantId) {
  saveCart(getCart().filter((item) => item.variantId !== variantId));
}

export function clearCart() {
  saveCart([]);
}

export function cartQuantity(items = getCart()) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

export function subtotalCents(items = getCart()) {
  return items.reduce((sum, item) => sum + Number(item.unitPriceCents || 0) * Number(item.quantity || 0), 0);
}

let snapshotCache = { raw: null, items: [] };

function cartSnapshot() {
  const raw = localStorage.getItem(CART_KEY) || '[]';
  if (raw !== snapshotCache.raw) {
    snapshotCache = { raw, items: getCart() };
  }
  return snapshotCache.items;
}

function subscribe(callback) {
  window.addEventListener(CART_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CART_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export function useCart() {
  return useSyncExternalStore(subscribe, cartSnapshot);
}
