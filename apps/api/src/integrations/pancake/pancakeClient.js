class PancakeApiError extends Error {
  constructor(code, { status = 0, retryable = false } = {}) {
    const messages = {
      pancake_auth_failed: 'Pancake authentication failed.',
      pancake_http_error: 'Pancake returned an unavailable response.',
      pancake_invalid_response: 'Pancake returned an invalid response.',
      pancake_rejected: 'Pancake rejected the request.',
      pancake_timeout: 'Pancake request timed out.',
      pancake_network_error: 'Pancake could not be reached.',
      pancake_invalid_request: 'Pancake request configuration is invalid.'
    };
    super(messages[code] || 'Pancake request failed.');
    this.name = 'PancakeApiError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function createPancakeClient(config, fetchImpl = fetch) {
  async function request(pathname, query = {}, options = {}) {
    const url = new URL(`${config.apiBaseUrl}${pathname}`);
    url.searchParams.set('api_key', config.apiKey);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const controller = new AbortController();
    const timeoutMs = Number(options.timeoutMs || config.timeoutMs);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method: options.method || 'GET',
        headers: { Accept: 'application/json', ...(options.headers || {}) },
        body: options.body,
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new PancakeApiError('pancake_timeout', { retryable: true });
      }
      throw new PancakeApiError('pancake_network_error', { retryable: true });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new PancakeApiError('pancake_auth_failed', { status: response.status });
      }
      throw new PancakeApiError('pancake_http_error', {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500
      });
    }

    let body;
    try {
      body = JSON.parse(await response.text());
    } catch (_error) {
      throw new PancakeApiError('pancake_invalid_response');
    }
    if (!body || typeof body !== 'object') {
      throw new PancakeApiError('pancake_invalid_response');
    }
    if (body.success === false) {
      throw new PancakeApiError('pancake_rejected');
    }
    return body;
  }

  function shopPath(shopId, suffix) {
    const id = String(shopId || '').trim();
    if (!id) throw new PancakeApiError('pancake_invalid_request');
    return `/shops/${encodeURIComponent(id)}${suffix}`;
  }

  async function listData(shopId, suffix) {
    const body = await request(shopPath(shopId, suffix));
    if (!Array.isArray(body.data)) throw new PancakeApiError('pancake_invalid_response');
    return body;
  }

  async function listVariations(shopId, options = {}) {
    const pageNumber = Number(options.pageNumber);
    const pageSize = Number(options.pageSize);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(pageSize) || pageSize < 1) {
      throw new PancakeApiError('pancake_invalid_request');
    }
    const body = await request(shopPath(shopId, '/products/variations'), {
      page_number: pageNumber,
      page_size: pageSize
    });
    const fields = ['page_number', 'page_size', 'total_entries', 'total_pages'];
    if (!Array.isArray(body.data) || fields.some((field) => !Number.isInteger(body[field]) || body[field] < 0)
      || body.page_number < 1 || body.page_size < 1) {
      throw new PancakeApiError('pancake_invalid_response');
    }
    return body;
  }

  async function listGeo(pathname, query) {
    const body = await request(pathname, query);
    if (!Array.isArray(body.data)) throw new PancakeApiError('pancake_invalid_response');
    return body.data.map((item) => ({
      id: String(item?.id ?? '').trim(),
      code: String(item?.new_id ?? item?.code ?? '').trim(),
      name: String(item?.name ?? '').trim(),
      nameEn: String(item?.name_en ?? '').trim(),
      provinceId: String(item?.province_id ?? '').trim(),
      districtId: String(item?.district_id ?? '').trim(),
      postcode: String(item?.postcode ?? '').trim()
    })).filter((item) => item.id && item.name);
  }

  async function listProvinces(countryCode = '63') {
    const normalized = String(countryCode || '').trim();
    if (!normalized) throw new PancakeApiError('pancake_invalid_request');
    return listGeo('/geo/provinces', { country_code: normalized });
  }

  async function listDistricts(provinceId) {
    const normalized = String(provinceId || '').trim();
    if (!normalized) throw new PancakeApiError('pancake_invalid_request');
    return listGeo('/geo/districts', { province_id: normalized });
  }

  async function listCommunes(provinceId, districtId) {
    const province = String(provinceId || '').trim();
    const district = String(districtId || '').trim();
    if (!province || !district) throw new PancakeApiError('pancake_invalid_request');
    return listGeo('/geo/communes', { province_id: province, district_id: district });
  }

  async function createOrder(shopId, payload) {
    const body = await request(shopPath(shopId, '/orders'), {}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      timeoutMs: config.orderCreateTimeoutMs || config.timeoutMs
    });
    const id = body.id ?? body.data?.id ?? body.order?.id;
    if (id === undefined || id === null || String(id).trim() === '') {
      throw new PancakeApiError('pancake_invalid_response');
    }
    return { pancakeOrderId: String(id), body };
  }

  async function listOrders(shopId, options = {}) {
    const pageNumber = Number(options.pageNumber);
    const pageSize = Number(options.pageSize);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(pageSize) || pageSize < 1) {
      throw new PancakeApiError('pancake_invalid_request');
    }
    const params = { page_number: pageNumber, page_size: pageSize };
    if (options.search) params.search = String(options.search).trim();
    if (options.updatedSince || options.updatedUntil) {
      const start = options.updatedSince ? new Date(options.updatedSince) : null;
      const end = options.updatedUntil ? new Date(options.updatedUntil) : null;
      if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
        throw new PancakeApiError('pancake_invalid_request');
      }
      params.updateStatus = 'updated_at';
      if (start) params.startDateTime = Math.floor(start.getTime() / 1000);
      if (end) params.endDateTime = Math.floor(end.getTime() / 1000);
      params.option_sort = 'last_updated_order_asc';
    }
    const body = await request(shopPath(shopId, '/orders'), params);
    if (!Array.isArray(body.data)) throw new PancakeApiError('pancake_invalid_response');
    return body;
  }

  async function findOrdersByCustomId(shopId, customId) {
    const normalized = String(customId || '').trim();
    if (!normalized) throw new PancakeApiError('pancake_invalid_request');
    const body = await listOrders(shopId, { pageNumber: 1, pageSize: 100, search: normalized });
    return body.data.filter((item) => [item?.custom_id, item?.customId, item?.id]
      .some((value) => String(value ?? '').trim() === normalized));
  }

  async function getOrder(shopId, orderId) {
    const id = String(orderId || '').trim();
    if (!id) throw new PancakeApiError('pancake_invalid_request');
    const body = await request(shopPath(shopId, `/orders/${encodeURIComponent(id)}`));
    const order = body.data || body.order || body;
    if (!order || typeof order !== 'object' || Array.isArray(order)) {
      throw new PancakeApiError('pancake_invalid_response');
    }
    return order;
  }

  async function updateOrder(shopId, orderId, payload) {
    const id = String(orderId || '').trim();
    if (!id) throw new PancakeApiError('pancake_invalid_request');
    return request(shopPath(shopId, `/orders/${encodeURIComponent(id)}`), {}, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
  }

  async function updateProduct(shopId, productId, payload) {
    const id = String(productId || '').trim();
    if (!id) throw new PancakeApiError('pancake_invalid_request');
    return request(shopPath(shopId, `/products/${encodeURIComponent(id)}`), {}, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
  }

  async function updateVariationQuantities(shopId, payload) {
    return request(shopPath(shopId, '/variations/update_quantity'), {}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
  }

  return {
    createOrder,
    findOrdersByCustomId,
    getOrder,
    listCommunes,
    listDistricts,
    listOrders,
    listProvinces,
    listShops: () => request('/shops'),
    listWarehouses: (shopId) => listData(shopId, '/warehouses'),
    listOrderSources: (shopId) => listData(shopId, '/order_source'),
    listVariations,
    updateProduct,
    updateVariationQuantities,
    updateOrder
  };
}

module.exports = { PancakeApiError, createPancakeClient };
