import { useSyncExternalStore } from 'react';

const CSRF_COOKIE = 'mc_customer_csrf';
const AUTH_EVENT = 'maria-clara-customer-auth-changed';

function readCookie(name) {
  return document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || '';
}

function notifyAuthChanged() {
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function clearReadableSessionCookie() {
  document.cookie = `${CSRF_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
  notifyAuthChanged();
}

function subscribe(callback) {
  window.addEventListener(AUTH_EVENT, callback);
  return () => window.removeEventListener(AUTH_EVENT, callback);
}

export function useCustomerLoggedIn() {
  return useSyncExternalStore(subscribe, () => Boolean(readCookie(CSRF_COOKIE)), () => false);
}

function csrfHeaders(options) {
  const method = String(options.method || 'GET').toUpperCase();
  const token = readCookie(CSRF_COOKIE);
  return !['GET', 'HEAD', 'OPTIONS'].includes(method) && token
    ? { 'X-CSRF-Token': decodeURIComponent(token) }
    : {};
}

export async function customerJson(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders(options),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) clearReadableSessionCookie();
  if (!response.ok) throw new Error(body.error || 'Something went wrong.');
  return body;
}

export async function customerRegister(payload) {
  const body = await customerJson('/api/customer/register', { method: 'POST', body: JSON.stringify(payload) });
  notifyAuthChanged();
  return body.customer;
}

export async function customerLogin(email, password) {
  const body = await customerJson('/api/customer/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  notifyAuthChanged();
  return body.customer;
}

export async function customerLogout() {
  try {
    await customerJson('/api/customer/logout', { method: 'POST' });
  } finally {
    clearReadableSessionCookie();
  }
}
