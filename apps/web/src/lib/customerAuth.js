import { useSyncExternalStore } from 'react';

const TOKEN_KEY = 'maria-clara-customer-token';
const AUTH_EVENT = 'maria-clara-customer-auth-changed';

export function getCustomerToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setCustomerToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function clearCustomerToken() {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function subscribe(callback) {
  window.addEventListener(AUTH_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(AUTH_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export function useCustomerLoggedIn() {
  return useSyncExternalStore(subscribe, () => Boolean(getCustomerToken()));
}

export async function customerJson(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getCustomerToken() ? { Authorization: `Bearer ${getCustomerToken()}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && getCustomerToken()) {
    clearCustomerToken();
  }
  if (!response.ok) {
    throw new Error(body.error || 'Something went wrong.');
  }
  return body;
}

export async function customerRegister(payload) {
  const body = await customerJson('/api/customer/register', { method: 'POST', body: JSON.stringify(payload) });
  setCustomerToken(body.token);
  return body.customer;
}

export async function customerLogin(email, password) {
  const body = await customerJson('/api/customer/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  setCustomerToken(body.token);
  return body.customer;
}
