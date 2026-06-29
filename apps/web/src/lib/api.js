async function request(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Something went wrong.');
    error.code = body.code || '';
    error.details = body.details;
    throw error;
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

export function fetchActivePromoNotification() {
  return request('/api/discounts/active-notification');
}

export function fetchOrder(orderNumber) {
  return request(`/api/orders/${encodeURIComponent(orderNumber)}`);
}

export function buildCheckoutQuoteRequest(input) {
  const address = input.address ? {
    houseAddress: String(input.address.houseAddress || '').trim(),
    provinceCode: String(input.address.provinceCode || '').trim(),
    cityCode: String(input.address.cityCode || '').trim(),
    barangayCode: String(input.address.barangayCode || '').trim()
  } : null;
  return {
    cartSessionId: input.cartSessionId,
    items: (input.items || []).map(({ productId, variantId, quantity }) => ({
      productId, variantId, quantity
    })),
    discountCode: String(input.discountCode || '').trim(),
    ...(address ? { address } : {})
  };
}

export function createCheckoutQuote(input) {
  return request('/api/checkout/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildCheckoutQuoteRequest(input))
  });
}

export function buildOrderRequest(input, quoteId, idempotencyKey) {
  return {
    headers: { 'Idempotency-Key': idempotencyKey },
    body: {
      quoteId,
      cartSessionId: input.cartSessionId,
      customer: input.customer,
      paymentMethod: input.paymentMethod,
      notes: String(input.notes || '')
    }
  };
}

export function createQuoteBackedOrder(input, quoteId, idempotencyKey, headers = {}) {
  const order = buildOrderRequest(input, quoteId, idempotencyKey);
  return request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...order.headers, ...headers },
    body: JSON.stringify(order.body)
  });
}

export async function fetchOrderConfirmation(orderNumber, token, fetchImpl = fetch) {
  const response = await fetchImpl(`/api/orders/${encodeURIComponent(orderNumber)}/confirmation`, {
    cache: 'no-store',
    headers: { 'X-Order-Confirmation': token }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Order confirmation not found');
  return body;
}

export function quoteCart(payload) {
  return request('/api/discounts/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function createOrder(payload, headers = {}) {
  return request('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload)
  });
}
