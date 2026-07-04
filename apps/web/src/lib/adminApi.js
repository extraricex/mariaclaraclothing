const CSRF_COOKIE = 'mc_admin_csrf';

function readCookie(name) {
  return document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || '';
}

function csrfHeaders(options) {
  const method = String(options.method || 'GET').toUpperCase();
  const token = readCookie(CSRF_COOKIE);
  return !['GET', 'HEAD', 'OPTIONS'].includes(method) && token
    ? { 'X-CSRF-Token': decodeURIComponent(token) }
    : {};
}

export async function adminFetch(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...options,
    headers: {
      ...csrfHeaders(options),
      ...(options.headers || {})
    }
  });
  if (response.status === 401) {
    if (!window.location.pathname.startsWith('/admin/login')) {
      window.location.assign('/admin/login');
    }
    throw new Error('Session expired. Log in again.');
  }
  return response;
}

export async function adminJson(path, options = {}) {
  const response = await adminFetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Something went wrong.');
    error.body = body;
    throw error;
  }
  return body;
}

export function adminSend(method, path, body) {
  return adminJson(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export async function adminLogin(password) {
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Login failed.');
  return body;
}

export async function adminLogout() {
  await adminFetch('/api/admin/logout', { method: 'POST' });
}

export async function adminDownload(path, body, fallbackName) {
  const response = await adminFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody.error || 'Download failed.');
    error.body = errorBody;
    throw error;
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = match?.[1] || fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
