async function request(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Something went wrong.');
  }
  return body;
}

export function fetchProducts() {
  return request('/api/products');
}

export function fetchProduct(slug) {
  return request(`/api/products/${encodeURIComponent(slug)}`);
}

export function fetchSiteContent() {
  return request('/api/site-content');
}

export function fetchOrder(orderNumber) {
  return request(`/api/orders/${encodeURIComponent(orderNumber)}`);
}

export function createOrder(payload, headers = {}) {
  return request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload)
  });
}
