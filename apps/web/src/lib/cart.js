import { useSyncExternalStore } from 'react';

const CART_KEY = 'maria-clara-cart';
const CART_EVENT = 'maria-clara-cart-changed';

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
}

export function addToCart(item) {
  const cart = getCart();
  const existing = cart.find((cartItem) => cartItem.variantId === item.variantId);
  if (existing) {
    existing.quantity += item.quantity;
  } else {
    cart.push(item);
  }
  saveCart(cart);
}

export function updateQuantity(variantId, quantity) {
  const nextQuantity = Number(quantity);
  saveCart(getCart()
    .map((item) => item.variantId === variantId ? { ...item, quantity: nextQuantity } : item)
    .filter((item) => item.quantity > 0));
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
