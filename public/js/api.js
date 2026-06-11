export async function getProducts() {
  const response = await fetch('/api/products', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load products');
  }
  return response.json();
}

export async function getProduct(slug) {
  if (!slug) {
    throw new Error('Product slug is required');
  }

  const response = await fetch(`/api/products/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load product');
  }
  return response.json();
}

export async function createOrder(payload) {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || 'Unable to place order');
  }
  return body;
}

export async function getOrderConfirmation(orderNumber) {
  if (!orderNumber) {
    throw new Error('Order number is required');
  }

  const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}`);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || 'Unable to load order confirmation');
  }
  return body;
}
