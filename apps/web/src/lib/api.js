import { fetchWithRecovery, responseErrorMessage } from './network.js';

async function request(path, options = {}) {
  const response = await fetchWithRecovery(path, { cache: 'no-store', credentials: 'same-origin', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || responseErrorMessage(response));
    error.code = body.code || '';
    error.details = body.details;
    error.fields = body.fields || body.details?.fields || {};
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

export function fetchProductReviews(slug, filters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== false && value !== undefined && value !== null) query.set(key, String(value));
  });
  return request(`/api/reviews/products/${encodeURIComponent(slug)}${query.size ? `?${query}` : ''}`);
}

export function fetchStoreReviews(filters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== false && value !== undefined && value !== null) query.set(key, String(value));
  });
  return request(`/api/reviews/store${query.size ? `?${query}` : ''}`);
}

export function submitProductReview(slug, formData) {
  return request(`/api/reviews/products/${encodeURIComponent(slug)}`, {
    method: 'POST',
    body: formData
  });
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
    barangayCode: String(input.address.barangayCode || '').trim(),
    postalCode: String(input.address.postalCode || '').trim()
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
      paymentMethod: input.paymentMethod
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

export function createPayMongoCheckout(input, quoteId, idempotencyKey) {
  const order = buildOrderRequest({ ...input, paymentMethod: 'paymongo' }, quoteId, idempotencyKey);
  return request('/api/payments/paymongo/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...order.headers },
    body: JSON.stringify(order.body)
  });
}

export async function fetchOrderConfirmation(orderNumber, token, fetchImpl = fetch) {
  const response = await fetchWithRecovery(`/api/orders/${encodeURIComponent(orderNumber)}/confirmation`, {
    cache: 'no-store',
    headers: { 'X-Order-Confirmation': token }
  }, { fetchImpl });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || responseErrorMessage(response, 'Order confirmation not found'));
  return body;
}

export function claimMetaPurchase(orderNumber, token) {
  return request(`/api/orders/${encodeURIComponent(orderNumber)}/meta-purchase/claim`, {
    method: 'POST',
    headers: { 'X-Order-Confirmation': token }
  });
}

export function completeMetaPurchase(orderNumber, token, claimId, sent) {
  return request(`/api/orders/${encodeURIComponent(orderNumber)}/meta-purchase/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Order-Confirmation': token
    },
    body: JSON.stringify({ claimId, sent: Boolean(sent) })
  });
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
