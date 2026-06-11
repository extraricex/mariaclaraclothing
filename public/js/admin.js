const ADMIN_TOKEN_KEY = 'maria-clara-admin-token';
const ADMIN_STORE_NAME = 'Maria Clara';
const JNT_ADDRESS_GUIDE_URL = '/data/jnt-address-guide.json';
const STOREFRONT_COLLECTIONS = ['New Arrivals', 'Freedom of Mind'];
let adminToken = localStorage.getItem(ADMIN_TOKEN_KEY) || '';
let selectedOrderNumber = '';
let selectedOrderNumbers = new Set();
let activeOrderTab = '';
let selectedProductSlug = '';
let productRows = [];
let selectedProducts = new Set();
let activeCollectionName = STOREFRONT_COLLECTIONS[0];
let collectionProducts = [];
let jntAddressGuidePromise = null;

const loginPanel = document.querySelector('[data-admin-login-panel]');
const dashboard = document.querySelector('[data-admin-dashboard]');
const loginForm = document.querySelector('[data-admin-login-form]');
const loginStatus = document.querySelector('[data-admin-login-status]');
const ordersRoot = document.querySelector('[data-admin-orders]');
const detailRoot = document.querySelector('[data-admin-order-detail]');
const orderWorkQueuesRoot = document.querySelector('[data-admin-order-work-queues]');
const searchInput = document.querySelector('[data-admin-search]');
const globalSearchInput = document.querySelector('[data-admin-global-search]');
const statusFilter = document.querySelector('[data-admin-status-filter]');
const orderDateFilter = document.querySelector('[data-admin-order-date-filter]');
const orderPaymentFilter = document.querySelector('[data-admin-order-payment-filter]');
const orderFulfillmentFilter = document.querySelector('[data-admin-order-fulfillment-filter]');
const summaryRoot = document.querySelector('[data-admin-summary-cards]');
const orderCount = document.querySelector('[data-admin-order-count]');
const productsRoot = document.querySelector('[data-admin-products]');
const productDetailRoot = document.querySelector('[data-admin-product-detail]');
const productSearchInput = document.querySelector('[data-admin-product-search]');
const productStatusFilter = document.querySelector('[data-admin-product-status-filter]');
const productCategoryFilter = document.querySelector('[data-admin-product-category-filter]');
const productStockFilter = document.querySelector('[data-admin-product-stock-filter]');
const productSortInput = document.querySelector('[data-admin-product-sort]');
const productSummaryRoot = document.querySelector('[data-admin-product-summary]');
const productCount = document.querySelector('[data-admin-product-count]');
const dashboardSummaryRoot = document.querySelector('[data-admin-dashboard-summary]');
const dashboardSalesRoot = document.querySelector('[data-admin-dashboard-sales]');
const dashboardActionsRoot = document.querySelector('[data-admin-dashboard-actions]');
const dashboardSalesChartRoot = document.querySelector('[data-admin-dashboard-sales-chart]');
const dashboardOrderStatusChartRoot = document.querySelector('[data-admin-dashboard-order-status-chart]');
const dashboardInventoryChartRoot = document.querySelector('[data-admin-dashboard-inventory-chart]');
const dashboardShippingChartRoot = document.querySelector('[data-admin-dashboard-shipping-chart]');
const dashboardRecentOrdersRoot = document.querySelector('[data-admin-dashboard-recent-orders]');
const dashboardProductAlertsRoot = document.querySelector('[data-admin-dashboard-product-alerts]');
const dashboardWorkRoot = document.querySelector('[data-admin-dashboard-work]');
const dashboardDateRangeInput = document.querySelector('[data-admin-dashboard-date-range]');
const collectionTabsRoot = document.querySelector('[data-admin-collection-tabs]');
const collectionProductsRoot = document.querySelector('[data-admin-collection-products]');
const collectionAddProductInput = document.querySelector('[data-admin-collection-add-product]');
const collectionStatusRoot = document.querySelector('[data-admin-collection-status]');
const isLoginPage = Boolean(loginForm) && !dashboard;
const isDashboardPage = Boolean(dashboard);

if (isDashboardPage && !adminToken) {
  redirectToLogin();
}

function money(cents) {
  return `${new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    currencyDisplay: 'narrowSymbol'
  }).format(Number(cents || 0) / 100)} PHP`;
}

function shopifyMoney(cents) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    currencyDisplay: 'narrowSymbol'
  }).format(Number(cents || 0) / 100);
}

function formatAdminPesoInput(cents) {
  const pesos = Number(cents || 0) / 100;
  return Number.isInteger(pesos) ? String(pesos) : pesos.toFixed(2);
}

function adminPesoToCents(value) {
  return Math.round(Number(value || 0) * 100);
}

function formatAdminDate(value) {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatShopifyOrderDate(value) {
  if (!value) return 'No date';
  const date = new Date(value);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);

  if (date.toDateString() === now.toDateString()) return `Today at ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;

  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date).replace(',', ' at');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

function adminHeaders() {
  return {
    authorization: `Bearer ${adminToken}`
  };
}

async function adminFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...adminHeaders(),
      ...(options.headers || {})
    }
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || 'Admin request failed');
  }

  return body;
}

function showDashboard(show) {
  document.body.classList.toggle('admin-auth-pending', !show && isDashboardPage);
  if (loginPanel) loginPanel.hidden = show && isDashboardPage;
  if (dashboard) dashboard.hidden = !show;
}

function showAdminToast(message = 'Changes saved successfully.', type = 'success') {
  let toast = document.querySelector('[data-admin-toast]');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'admin-toast';
    toast.setAttribute('data-admin-toast', '');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  toast.className = `admin-toast admin-toast--${type}`;
  toast.textContent = message;
  window.clearTimeout(showAdminToast.timer);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  showAdminToast.timer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 3200);
}

function redirectToLogin() {
  const next = `${window.location.pathname}${window.location.hash || ''}`;
  window.location.replace(`/admin-login.html?next=${encodeURIComponent(next)}`);
}

function dashboardDestination() {
  const next = new URLSearchParams(window.location.search).get('next') || '/admin.html';
  return next.startsWith('/admin.html') ? next : '/admin.html';
}

async function login(password) {
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || 'Login failed');
  }

  adminToken = body.token;
  localStorage.setItem('maria-clara-admin-token', adminToken);
}

async function loadOrders() {
  if (!ordersRoot) return;

  const params = new URLSearchParams();
  const query = searchInput?.value.trim() || globalSearchInput?.value.trim() || '';
  if (query) params.set('q', query);
  if (statusFilter?.value) params.set('status', statusFilter.value);

  ordersRoot.innerHTML = renderOrderTableSkeleton();

  try {
    const { orders } = await adminFetch(`/api/admin/orders${params.toString() ? `?${params}` : ''}`);
    renderOrderWorkQueues(orders);
    const visibleOrders = filterOrdersByTab(orders);
    renderSummaryCards(orders);
    renderOrders(visibleOrders);
    if (orderCount) orderCount.textContent = String(orders.length);
  } catch (error) {
    ordersRoot.innerHTML = `<p class="form-status">${escapeHtml(error.message)}</p>`;
    if (/authentication/i.test(error.message)) {
      adminToken = '';
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      showDashboard(false);
    }
  }
}

function filterOrdersByTab(orders) {
  let filteredOrders = orders;

  if (orderDateFilter?.value === 'today') {
    const today = new Date().toDateString();
    filteredOrders = filteredOrders.filter((order) => order.placedAt && new Date(order.placedAt).toDateString() === today);
  }
  if (orderDateFilter?.value === 'last_7_days') filteredOrders = filterOrdersSince(filteredOrders, 7);
  if (orderDateFilter?.value === 'last_30_days') filteredOrders = filterOrdersSince(filteredOrders, 30);
  if (orderPaymentFilter?.value) filteredOrders = filteredOrders.filter((order) => order.paymentStatus === orderPaymentFilter.value);
  if (orderFulfillmentFilter?.value) filteredOrders = filteredOrders.filter((order) => order.fulfillmentStatus === orderFulfillmentFilter.value);

  if (activeOrderTab === 'today') {
    const today = new Date().toDateString();
    return filteredOrders.filter((order) => order.placedAt && new Date(order.placedAt).toDateString() === today);
  }
  if (activeOrderTab === 'cod') return filteredOrders.filter((order) => order.paymentStatus === 'cod_pending' || order.codConfirmationStatus === 'pending');
  if (activeOrderTab === 'pending') return filteredOrders.filter((order) => ['pending', 'received', 'cod_pending'].includes(order.status) || order.paymentStatus === 'cod_pending');
  if (activeOrderTab === 'unfulfilled') return filteredOrders.filter((order) => order.fulfillmentStatus === 'unfulfilled');
  if (activeOrderTab === 'ready_jnt') return filteredOrders.filter((order) => order.jntExportStatus === 'ready');
  if (activeOrderTab === 'packed') return filteredOrders.filter((order) => order.fulfillmentStatus === 'packed' || order.status === 'packed');
  if (activeOrderTab === 'shipped') return filteredOrders.filter((order) => order.fulfillmentStatus === 'shipped' || order.status === 'shipped');
  if (activeOrderTab === 'delivered') return filteredOrders.filter((order) => order.fulfillmentStatus === 'delivered' || order.status === 'delivered');
  if (activeOrderTab === 'paid') return filteredOrders.filter((order) => order.paymentStatus === 'paid');
  if (activeOrderTab === 'cancelled') return filteredOrders.filter((order) => order.status === 'cancelled');
  return filteredOrders;
}

function renderOrderWorkQueues(orders = []) {
  if (!orderWorkQueuesRoot) return;

  const queues = [
    ['cod', 'Needs COD confirmation', orders.filter((order) => order.paymentStatus === 'cod_pending' || order.codConfirmationStatus === 'pending').length],
    ['ready_jnt', 'Ready for J&T', orders.filter((order) => order.jntExportStatus === 'ready').length],
    ['unfulfilled', 'To pack', orders.filter((order) => order.fulfillmentStatus === 'unfulfilled').length],
    ['packed', 'Ready to ship', orders.filter((order) => order.fulfillmentStatus === 'packed' || order.status === 'packed').length],
    ['shipped', 'Shipped', orders.filter((order) => order.fulfillmentStatus === 'shipped' || order.status === 'shipped').length],
    ['delivered', 'Delivered', orders.filter((order) => order.fulfillmentStatus === 'delivered' || order.status === 'delivered').length],
    ['cancelled', 'Cancelled', orders.filter((order) => order.status === 'cancelled' || order.fulfillmentStatus === 'cancelled').length]
  ];

  orderWorkQueuesRoot.innerHTML = queues.map(([queue, label, count]) => `<button class="admin-order-work-queue ${activeOrderTab === queue ? 'is-active' : ''}" type="button" data-admin-order-queue="${escapeAttribute(queue)}">
    <span>${escapeHtml(label)}</span>
    <strong>${Number(count || 0)}</strong>
  </button>`).join('');

  orderWorkQueuesRoot.querySelectorAll('[data-admin-order-queue]').forEach((button) => {
    button.addEventListener('click', () => {
      activeOrderTab = activeOrderTab === button.dataset.adminOrderQueue ? '' : button.dataset.adminOrderQueue;
      loadOrders();
    });
  });
}

function filterOrdersSince(orders, days) {
  const cutoff = Date.now() - (Number(days || 0) * 24 * 60 * 60 * 1000);
  return orders.filter((order) => order.placedAt && new Date(order.placedAt).getTime() >= cutoff);
}

function renderSummaryCards(orders) {
  if (!summaryRoot) return;
  const revenue = orders.reduce((sum, order) => sum + Number(order.totalCents || 0), 0);
  const pending = orders.filter((order) => order.paymentStatus === 'cod_pending' || order.codConfirmationStatus === 'pending').length;
  const unfulfilled = orders.filter((order) => order.fulfillmentStatus === 'unfulfilled').length;
  const delivered = orders.filter((order) => order.fulfillmentStatus === 'delivered' || order.deliveryStatus === 'delivered').length;

  summaryRoot.innerHTML = [
    ['Total orders', orders.length],
    ['Pending COD', pending],
    ['Unfulfilled', unfulfilled],
    ['Delivered', delivered],
    ['Gross sales', money(revenue)]
  ].map(([label, value]) => `<article class="admin-summary-card">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
  </article>`).join('');
}

async function loadDashboardSummary() {
  if (!dashboardSummaryRoot) return;

  dashboardSummaryRoot.innerHTML = renderDashboardSkeletonCards();
  if (dashboardSalesRoot) dashboardSalesRoot.innerHTML = '<p class="loading-copy">Loading sales overview...</p>';
  if (dashboardActionsRoot) dashboardActionsRoot.innerHTML = '<p class="loading-copy">Loading quick actions...</p>';
  if (dashboardWorkRoot) dashboardWorkRoot.innerHTML = '<p class="loading-copy">Loading today’s work...</p>';
  [dashboardSalesChartRoot, dashboardOrderStatusChartRoot, dashboardInventoryChartRoot, dashboardShippingChartRoot].forEach((root) => {
    if (root) root.innerHTML = '<p class="loading-copy">Loading graph...</p>';
  });
  if (dashboardRecentOrdersRoot) dashboardRecentOrdersRoot.innerHTML = '<p class="loading-copy">Loading recent orders...</p>';
  if (dashboardProductAlertsRoot) dashboardProductAlertsRoot.innerHTML = '<p class="loading-copy">Loading product alerts...</p>';

  try {
    const [{ orders }, { products, summary }] = await Promise.all([
      adminFetch('/api/admin/orders'),
      adminFetch('/api/admin/products')
    ]);

    const visibleOrders = filterDashboardOrdersByRange(orders);
    renderDashboardSummary(visibleOrders, products, summary || {});
    renderDashboardWorkPanel(orders, products);
    renderDashboardSales(visibleOrders);
    renderDashboardActions();
    renderDashboardCharts(visibleOrders, products);
    renderDashboardRecentOrders(visibleOrders);
    renderDashboardProductAlerts(products);
  } catch (error) {
    const message = `<p class="form-status">${escapeHtml(error.message)}</p>`;
    dashboardSummaryRoot.innerHTML = message;
    if (dashboardSalesRoot) dashboardSalesRoot.innerHTML = message;
    if (dashboardActionsRoot) dashboardActionsRoot.innerHTML = message;
    if (dashboardWorkRoot) dashboardWorkRoot.innerHTML = message;
    [dashboardSalesChartRoot, dashboardOrderStatusChartRoot, dashboardInventoryChartRoot, dashboardShippingChartRoot].forEach((root) => {
      if (root) root.innerHTML = message;
    });
    if (dashboardRecentOrdersRoot) dashboardRecentOrdersRoot.innerHTML = message;
    if (dashboardProductAlertsRoot) dashboardProductAlertsRoot.innerHTML = message;
  }
}

function filterDashboardOrdersByRange(orders = []) {
  const range = dashboardDateRangeInput?.value || 'last_7_days';
  if (range === 'all') return orders;
  if (range === 'today') {
    const today = new Date().toDateString();
    return orders.filter((order) => order.placedAt && new Date(order.placedAt).toDateString() === today);
  }
  if (range === 'last_30_days') return filterOrdersSince(orders, 30);
  return filterOrdersSince(orders, 7);
}

function renderDashboardSkeletonCards() {
  return Array.from({ length: 7 }).map(() => `<article class="admin-summary-card">
    <span class="admin-skeleton"></span>
    <strong class="admin-skeleton"></strong>
    <small class="admin-skeleton"></small>
  </article>`).join('');
}

function renderDashboardSummary(orders = [], products = [], productSummary = {}) {
  const today = new Date().toDateString();
  const todayOrders = orders.filter((order) => order.placedAt && new Date(order.placedAt).toDateString() === today);
  const todaySales = todayOrders.reduce((sum, order) => sum + Number(order.totalCents || 0), 0);
  const pendingCod = orders.filter((order) => order.paymentStatus === 'cod_pending' || order.codConfirmationStatus === 'pending').length;
  const unfulfilled = orders.filter((order) => order.fulfillmentStatus === 'unfulfilled').length;
  const shippingCollected = orders.reduce((sum, order) => sum + Number(order.shippingFeeCents || 0), 0);
  const lowStock = products.filter((product) => product.stockStatus === 'low_stock').length || Number(productSummary.lowStock || 0);
  const soldOut = products.filter((product) => product.stockStatus === 'sold_out' || Number(product.inventoryQuantity || 0) <= 0).length || Number(productSummary.soldOut || 0);

  dashboardSummaryRoot.innerHTML = [
    ['Orders today', todayOrders.length, 'New storefront orders', 'orders'],
    ['Pending COD', pendingCod, 'Need confirmation', 'orders', 'pending'],
    ['Unfulfilled', unfulfilled, 'Need fulfillment work', 'orders', 'unfulfilled'],
    ['Sales today', money(todaySales), 'Confirmed checkout total', 'orders', 'today'],
    ['Total shipping fee', money(shippingCollected), 'From all placed orders', 'orders'],
    ['Low-stock products', lowStock, 'Limited pieces', 'products', 'low_stock'],
    ['Sold-out products', soldOut, 'Needs restock or archive', 'products', 'sold_out']
  ].map(([label, value, note, page, filter]) => `<button class="admin-summary-card admin-dashboard-metric" type="button" data-admin-dashboard-link="${escapeAttribute(page)}" data-admin-dashboard-filter="${escapeAttribute(filter || '')}">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    <small>${escapeHtml(note)}</small>
  </button>`).join('');

  bindDashboardNavigation(dashboardSummaryRoot);
}

function renderDashboardWorkPanel(orders = [], products = []) {
  if (!dashboardWorkRoot) return;

  const pendingCod = orders.filter((order) => order.paymentStatus === 'cod_pending' || order.codConfirmationStatus === 'pending').length;
  const toPack = orders.filter((order) => order.fulfillmentStatus === 'unfulfilled').length;
  const readyToShip = orders.filter((order) => order.fulfillmentStatus === 'packed' || order.status === 'packed').length;
  const lowStock = products.filter((product) => product.stockStatus === 'low_stock').length;
  const soldOut = products.filter((product) => product.stockStatus === 'sold_out' || Number(product.inventoryQuantity || 0) <= 0).length;
  const drafts = products.filter((product) => product.status && product.status !== 'active').length;

  dashboardWorkRoot.innerHTML = `<div class="admin-card-header">
    <h2>Today’s work</h2>
    <span>Action queue</span>
  </div>
  <div class="admin-dashboard-work-grid">
    ${renderDashboardWorkItem('Confirm COD', pendingCod, 'orders', 'pending')}
    ${renderDashboardWorkItem('Pack orders', toPack, 'orders', 'unfulfilled')}
    ${renderDashboardWorkItem('Ready to ship', readyToShip, 'orders', 'packed')}
    ${renderDashboardWorkItem('Low stock', lowStock, 'products', 'low_stock')}
    ${renderDashboardWorkItem('Sold out', soldOut, 'products', 'sold_out')}
    ${renderDashboardWorkItem('Draft products', drafts, 'products', '')}
  </div>`;

  bindDashboardNavigation(dashboardWorkRoot);
}

function renderDashboardWorkItem(label, count, page, filter) {
  return `<button class="admin-dashboard-work-item" type="button" data-admin-dashboard-link="${escapeAttribute(page)}" data-admin-dashboard-filter="${escapeAttribute(filter || '')}">
    <span>${escapeHtml(label)}</span>
    <strong>${Number(count || 0)}</strong>
  </button>`;
}

function renderDashboardSales(orders = []) {
  if (!dashboardSalesRoot) return;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date().toDateString();
  const todayOrders = orders.filter((order) => order.placedAt && new Date(order.placedAt).toDateString() === today);
  const lastSevenOrders = orders.filter((order) => order.placedAt && now - new Date(order.placedAt).getTime() <= dayMs * 7);
  const todaySales = todayOrders.reduce((sum, order) => sum + Number(order.totalCents || 0), 0);
  const lastSevenSales = lastSevenOrders.reduce((sum, order) => sum + Number(order.totalCents || 0), 0);
  const itemCount = orders.reduce((sum, order) => sum + Number(order.itemCount || 0), 0);
  const shippingCollected = orders.reduce((sum, order) => sum + Number(order.shippingFeeCents || 0), 0);
  const freeShippingOrders = orders.filter((order) => Number(order.shippingFeeCents || 0) === 0).length;
  const averageOrderValue = orders.length ? Math.round(orders.reduce((sum, order) => sum + Number(order.totalCents || 0), 0) / orders.length) : 0;

  dashboardSalesRoot.innerHTML = `<div class="admin-card-header">
    <h2>Sales overview</h2>
    <span>Live admin data</span>
  </div>
  <dl class="admin-dashboard-stat-list">
    <div><dt>Today's sales</dt><dd>${money(todaySales)}</dd></div>
    <div><dt>Last 7 days sales</dt><dd>${money(lastSevenSales)}</dd></div>
    <div><dt>Average order value</dt><dd>${money(averageOrderValue)}</dd></div>
    <div><dt>Total items sold</dt><dd>${itemCount}</dd></div>
    <div><dt>Shipping fee from placed orders</dt><dd>${money(shippingCollected)}</dd></div>
    <div><dt>Free shipping orders</dt><dd>${freeShippingOrders}</dd></div>
  </dl>`;
}

function renderDashboardActions() {
  if (!dashboardActionsRoot) return;

  dashboardActionsRoot.innerHTML = `<div class="admin-card-header">
    <h2>Quick actions</h2>
    <span>Admin shortcuts</span>
  </div>
  <div class="admin-dashboard-actions">
    <button class="btn btn-dark" type="button" data-admin-dashboard-link="products" data-admin-dashboard-action="add_product">Add product</button>
    <button class="btn btn-outline-secondary" type="button" data-admin-dashboard-link="orders">View orders</button>
    <button class="btn btn-outline-secondary" type="button" data-admin-export-orders>Export orders</button>
    <button class="btn btn-outline-secondary" type="button" data-admin-dashboard-link="products">Manage products</button>
    <button class="btn btn-outline-secondary" type="button" data-admin-dashboard-link="collections">Manage collections</button>
    <button class="btn btn-outline-secondary" type="button" data-admin-dashboard-link="shipping-settings">Update shipping settings</button>
  </div>`;

  bindDashboardNavigation(dashboardActionsRoot);
  dashboardActionsRoot.querySelector('[data-admin-export-orders]')?.addEventListener('click', exportOrders);
}

function renderDashboardCharts(orders = [], products = []) {
  renderDashboardSalesChart(orders);
  renderDashboardOrderStatusChart(orders);
  renderDashboardInventoryChart(products);
  renderDashboardShippingChart(orders);
}

function renderDashboardSalesChart(orders = []) {
  if (!dashboardSalesChartRoot) return;

  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(todayStart.getTime() - dayMs * (6 - index));
    return {
      key: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(date),
      total: 0
    };
  });
  const salesByDay = new Map(days.map((day) => [day.key, day]));

  orders.forEach((order) => {
    if (!order.placedAt) return;
    const date = new Date(order.placedAt);
    if (Number.isNaN(date.getTime())) return;
    const key = date.toISOString().slice(0, 10);
    if (salesByDay.has(key)) {
      salesByDay.get(key).total += Number(order.totalCents || 0);
    }
  });

  const max = Math.max(...days.map((day) => day.total), 1);
  const total = days.reduce((sum, day) => sum + day.total, 0);

  dashboardSalesChartRoot.innerHTML = `<div class="admin-card-header">
    <h2>Sales trend</h2>
    <span>Last 7 days</span>
  </div>
  <div class="admin-dashboard-chart-total">
    <strong>${money(total)}</strong>
    <span>Total sales</span>
  </div>
  <div class="admin-dashboard-bar-chart" role="img" aria-label="Sales trend for the last 7 days">
    ${days.map((day) => `<div class="admin-dashboard-bar-column">
      <span class="admin-dashboard-bar" style="--bar-height: ${Math.max(6, Math.round((day.total / max) * 100))}%;" title="${escapeAttribute(`${day.label}: ${money(day.total)}`)}"></span>
      <small>${escapeHtml(day.label)}</small>
    </div>`).join('')}
  </div>`;
}

function renderDashboardOrderStatusChart(orders = []) {
  if (!dashboardOrderStatusChartRoot) return;

  const rows = [
    ['Pending COD', orders.filter((order) => order.paymentStatus === 'cod_pending' || order.codConfirmationStatus === 'pending').length],
    ['Unfulfilled', orders.filter((order) => order.fulfillmentStatus === 'unfulfilled').length],
    ['Packed', orders.filter((order) => order.fulfillmentStatus === 'packed' || order.status === 'packed').length],
    ['Shipped', orders.filter((order) => order.fulfillmentStatus === 'shipped' || order.deliveryStatus === 'shipped' || order.status === 'shipped').length],
    ['Delivered', orders.filter((order) => order.fulfillmentStatus === 'delivered' || order.deliveryStatus === 'delivered' || order.status === 'delivered').length],
    ['Cancelled', orders.filter((order) => order.status === 'cancelled' || order.fulfillmentStatus === 'cancelled').length]
  ];

  dashboardOrderStatusChartRoot.innerHTML = `<div class="admin-card-header">
    <h2>Order status</h2>
    <span>${orders.length} orders</span>
  </div>
  ${renderDashboardHorizontalBars(rows, 'Order status breakdown')}`;
}

function renderDashboardInventoryChart(products = []) {
  if (!dashboardInventoryChartRoot) return;

  const soldOut = products.filter((product) => product.stockStatus === 'sold_out' || Number(product.inventoryQuantity || 0) <= 0).length;
  const lowStock = products.filter((product) => product.stockStatus === 'low_stock').length;
  const drafts = products.filter((product) => product.status && product.status !== 'active').length;
  const healthy = Math.max(products.length - soldOut - lowStock - drafts, 0);
  const total = Math.max(products.length, 1);
  const healthyEnd = (healthy / total) * 100;
  const lowStockEnd = healthyEnd + ((lowStock / total) * 100);
  const soldOutEnd = lowStockEnd + ((soldOut / total) * 100);

  dashboardInventoryChartRoot.innerHTML = `<div class="admin-card-header">
    <h2>Inventory health</h2>
    <span>${products.length} products</span>
  </div>
  <div class="admin-dashboard-donut-wrap">
    <div class="admin-dashboard-donut" style="--healthy-end: ${healthyEnd}%; --low-end: ${lowStockEnd}%; --sold-end: ${soldOutEnd}%;">
      <strong>${healthy}</strong>
      <span>healthy</span>
    </div>
    <div class="admin-dashboard-legend">
      ${renderDashboardLegendRow('Healthy', healthy, 'success')}
      ${renderDashboardLegendRow('Low stock', lowStock, 'warning')}
      ${renderDashboardLegendRow('Sold out', soldOut, 'danger')}
      ${renderDashboardLegendRow('Draft/archived', drafts, 'muted')}
    </div>
  </div>`;
}

function renderDashboardShippingChart(orders = []) {
  if (!dashboardShippingChartRoot) return;

  const rows = [
    ['Free shipping', orders.filter((order) => Number(order.shippingFeeCents || 0) === 0).length],
    ['Metro Manila / Cavite', orders.filter((order) => Number(order.shippingFeeCents || 0) === 8000).length],
    ['Luzon province', orders.filter((order) => Number(order.shippingFeeCents || 0) === 12000).length],
    ['Visayas / Mindanao', orders.filter((order) => Number(order.shippingFeeCents || 0) === 18000).length],
    ['Other fee', orders.filter((order) => ![0, 8000, 12000, 18000].includes(Number(order.shippingFeeCents || 0))).length]
  ];

  dashboardShippingChartRoot.innerHTML = `<div class="admin-card-header">
    <h2>Shipping mix</h2>
    <span>By shipping fee</span>
  </div>
  ${renderDashboardHorizontalBars(rows, 'Shipping fee breakdown')}`;
}

function renderDashboardHorizontalBars(rows = [], label = 'Dashboard chart') {
  const max = Math.max(...rows.map(([, value]) => Number(value || 0)), 1);
  return `<div class="admin-dashboard-horizontal-chart" role="img" aria-label="${escapeAttribute(label)}">
    ${rows.map(([name, value]) => `<div class="admin-dashboard-horizontal-row">
      <span>${escapeHtml(name)}</span>
      <div class="admin-dashboard-horizontal-track"><span style="--bar-width: ${Math.round((Number(value || 0) / max) * 100)}%;"></span></div>
      <strong>${Number(value || 0)}</strong>
    </div>`).join('')}
  </div>`;
}

function renderDashboardLegendRow(label, value, tone) {
  return `<div><span class="admin-dashboard-legend-dot admin-dashboard-legend-dot--${escapeAttribute(tone)}"></span><span>${escapeHtml(label)}</span><strong>${Number(value || 0)}</strong></div>`;
}

function renderDashboardRecentOrders(orders = []) {
  if (!dashboardRecentOrdersRoot) return;

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.placedAt || 0) - new Date(a.placedAt || 0))
    .slice(0, 8);

  dashboardRecentOrdersRoot.innerHTML = `<div class="admin-card-header">
    <h2>Recent orders</h2>
    <button class="admin-link-button" type="button" data-admin-dashboard-link="orders">View all</button>
  </div>
  ${recentOrders.length ? `<div class="admin-dashboard-list">
    ${recentOrders.map((order) => `<button class="admin-dashboard-list-row" type="button" data-admin-dashboard-order="${escapeAttribute(order.orderNumber)}">
      <span><strong>${escapeHtml(order.orderNumber)}</strong><small>${escapeHtml(order.customerName || 'Customer')}</small></span>
      <span><strong>${money(order.totalCents)}</strong><small>${escapeHtml(order.deliveryMethod || order.shippingRegionLabel || 'Standard shipping')}</small></span>
      <span class="admin-badge ${statusBadgeClass(order.fulfillmentStatus)}">${escapeHtml(order.fulfillmentStatus || 'unfulfilled')}</span>
    </button>`).join('')}
  </div>` : '<p class="loading-copy">No recent orders yet.</p>'}`;

  bindDashboardNavigation(dashboardRecentOrdersRoot);
  dashboardRecentOrdersRoot.querySelectorAll('[data-admin-dashboard-order]').forEach((button) => {
    button.addEventListener('click', () => {
      renderAdminPage('orders');
      loadOrderDetail(button.dataset.adminDashboardOrder);
    });
  });
}

function renderDashboardProductAlerts(products = []) {
  if (!dashboardProductAlertsRoot) return;

  const productAlerts = products
    .filter((product) => product.stockStatus === 'low_stock' || product.stockStatus === 'sold_out' || Number(product.inventoryQuantity || 0) <= 0 || product.status !== 'active' || !product.image)
    .slice(0, 8);

  dashboardProductAlertsRoot.innerHTML = `<div class="admin-card-header">
    <h2>Products needing attention</h2>
    <button class="admin-link-button" type="button" data-admin-dashboard-link="products">View all</button>
  </div>
  ${productAlerts.length ? `<div class="admin-dashboard-list">
    ${productAlerts.map((product) => `<button class="admin-dashboard-list-row" type="button" data-admin-dashboard-product="${escapeAttribute(product.slug)}">
      <span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category || product.collections?.[0] || 'Uncategorized')}</small></span>
      <span><strong>${Number(product.inventoryQuantity || 0)} in stock</strong><small>${escapeHtml(product.status || 'draft')}</small></span>
      <span class="admin-badge ${product.stockStatus === 'sold_out' || Number(product.inventoryQuantity || 0) <= 0 ? 'admin-badge--critical' : product.stockStatus === 'low_stock' ? 'admin-badge--attention' : statusBadgeClass(product.status)}">${escapeHtml(product.stockStatus || product.status || 'review')}</span>
    </button>`).join('')}
  </div>` : '<p class="loading-copy">No product alerts right now.</p>'}`;

  bindDashboardNavigation(dashboardProductAlertsRoot);
  dashboardProductAlertsRoot.querySelectorAll('[data-admin-dashboard-product]').forEach((button) => {
    button.addEventListener('click', () => {
      renderAdminPage('products');
      loadProductDetail(button.dataset.adminDashboardProduct);
    });
  });
}

function bindDashboardNavigation(root) {
  root?.querySelectorAll('[data-admin-dashboard-link]').forEach((button) => {
    button.addEventListener('click', () => {
      const page = button.dataset.adminDashboardLink || 'orders';
      const filter = button.dataset.adminDashboardFilter || '';
      renderAdminPage(page);
      if (page === 'orders' && filter) {
        activeOrderTab = filter;
        document.querySelectorAll('[data-admin-tab]').forEach((tab) => {
          tab.classList.toggle('is-active', (tab.dataset.adminTab || '') === filter);
        });
        loadOrders();
      }
      if (page === 'products' && filter && productStockFilter) {
        productStockFilter.value = filter;
        loadProducts();
      }
      if (button.dataset.adminDashboardAction === 'add_product') {
        renderProductDetail(null);
      }
    });
  });
}

function renderOrderTableSkeleton() {
  return `<div class="admin-order-table-header">
    <div>
      <h2>Orders</h2>
      <span>Loading orders</span>
    </div>
  </div>
  <div class="admin-table-scroll">
    <table class="admin-order-table table table-hover align-middle">
      <tbody>
        <tr><td><span class="admin-skeleton"></span></td></tr>
        <tr><td><span class="admin-skeleton"></span></td></tr>
        <tr><td><span class="admin-skeleton"></span></td></tr>
      </tbody>
    </table>
  </div>`;
}

function renderOrders(orders) {
  if (!orders.length) {
    ordersRoot.innerHTML = '<div class="admin-empty-state"><h2>No orders found</h2><p>Try changing the search or filters.</p></div>';
    return;
  }

  ordersRoot.innerHTML = `<div class="admin-table-scroll">
    <table class="admin-order-table table table-hover align-middle">
      <thead>
        <tr>
          <th><input type="checkbox" aria-label="Select all orders"></th>
          <th>Order</th>
          <th>Date ↓</th>
          <th>Customer</th>
          <th>Channel</th>
          <th>Total</th>
          <th>Payment status</th>
          <th>Fulfillment status</th>
          <th>J&T status</th>
          <th>Items</th>
          <th>Delivery status</th>
          <th>Delivery method</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map((order) => `<tr class="admin-order-primary ${order.orderNumber === selectedOrderNumber ? 'is-selected' : ''}" data-admin-order="${escapeAttribute(order.orderNumber)}" tabindex="0">
          <td><input type="checkbox" aria-label="Select ${escapeAttribute(order.orderNumber)}" data-admin-order-checkbox="${escapeAttribute(order.orderNumber)}" ${selectedOrderNumbers.has(order.orderNumber) ? 'checked' : ''}></td>
          <td class="admin-order-name-cell"><strong>${escapeHtml(order.orderNumber)}</strong></td>
          <td><span>${escapeHtml(formatShopifyOrderDate(order.placedAt))}</span></td>
          <td class="admin-order-customer-cell">
            <span>${escapeHtml(order.customerName)}</span>
          </td>
          <td>${escapeHtml(order.channel || 'Online Store')}</td>
          <td><strong>${shopifyMoney(order.totalCents)}</strong></td>
          <td><span class="admin-badge ${statusBadgeClass(order.paymentStatus)}">${escapeHtml(paymentStatusLabel(order.paymentStatus))}</span></td>
          <td><span class="admin-badge ${statusBadgeClass(order.fulfillmentStatus)}">${escapeHtml(fulfillmentStatusLabel(order.fulfillmentStatus))}</span></td>
          <td>${renderJntExportStatus(order)}</td>
          <td>${Number(order.itemCount || 0)} ${Number(order.itemCount || 0) === 1 ? 'item' : 'items'}</td>
          <td><span class="admin-badge ${statusBadgeClass(order.deliveryStatus)}">${escapeHtml(order.deliveryStatus || 'pending')}</span></td>
          <td>${escapeHtml(order.shippingRegionLabel || order.deliveryMethod || 'Standard shipping')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  <footer class="admin-order-table-footer">
    <div class="admin-order-pagination">
      <button type="button" aria-label="Previous orders" disabled>‹</button>
      <button type="button" aria-label="Next orders">›</button>
      <span>1-${Math.min(50, orders.length)}</span>
    </div>
  </footer>`;

  ordersRoot.querySelectorAll('[data-admin-order]').forEach((button) => {
    button.addEventListener('click', () => loadOrderDetail(button.dataset.adminOrder));
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        loadOrderDetail(button.dataset.adminOrder);
      }
    });
  });

  const selectAll = ordersRoot.querySelector('thead input[type="checkbox"]');
  if (selectAll) {
    selectAll.setAttribute('data-admin-order-select-all', '');
    selectAll.checked = orders.every((order) => selectedOrderNumbers.has(order.orderNumber));
    selectAll.indeterminate = !selectAll.checked && orders.some((order) => selectedOrderNumbers.has(order.orderNumber));
    selectAll.addEventListener('click', (event) => event.stopPropagation());
    selectAll.addEventListener('change', () => {
      orders.forEach((order) => {
        if (selectAll.checked) {
          selectedOrderNumbers.add(order.orderNumber);
        } else {
          selectedOrderNumbers.delete(order.orderNumber);
        }
      });
      renderOrders(orders);
    });
  }

  ordersRoot.querySelectorAll('[data-admin-order-checkbox]').forEach((checkbox) => {
    checkbox.addEventListener('click', (event) => event.stopPropagation());
    checkbox.addEventListener('change', () => {
      const orderNumber = checkbox.dataset.adminOrderCheckbox;
      if (checkbox.checked) {
        selectedOrderNumbers.add(orderNumber);
      } else {
        selectedOrderNumbers.delete(orderNumber);
      }
      renderOrders(orders);
    });
  });
}

function renderJntExportStatus(order) {
  const missingFields = Array.isArray(order.jntMissingFields) ? order.jntMissingFields : [];
  return `<span class="admin-badge ${jntExportStatusBadgeClass(order.jntExportStatus)}" data-admin-jnt-missing-fields="${escapeAttribute(missingFields.join(', '))}" title="${escapeAttribute(missingFields.join(', '))}">
    ${escapeHtml(jntExportStatusLabel(order.jntExportStatus))}
  </span>`;
}

function paymentStatusLabel(status) {
  if (status === 'cod_pending') return 'Payment pending';
  return status || 'pending';
}

function jntExportStatusLabel(status) {
  if (status === 'ready') return 'Ready for J&T';
  if (status === 'exported') return 'Exported';
  if (status === 'missing_fields') return 'Missing info';
  return 'Not checked';
}

function jntExportStatusBadgeClass(status) {
  if (status === 'ready') return 'admin-badge--success';
  if (status === 'exported') return 'admin-badge--neutral';
  if (status === 'missing_fields') return 'admin-badge--attention';
  return 'admin-badge--neutral';
}

function fulfillmentStatusLabel(status) {
  if (status === 'unfulfilled') return 'Unfulfilled';
  return status || 'unfulfilled';
}

function renderTags(tags = []) {
  if (!Array.isArray(tags) || !tags.length) return '<span class="admin-muted">No tags</span>';
  return tags.map((tag) => `<span class="admin-tag">${escapeHtml(tag)}</span>`).join('');
}

function statusBadgeClass(status) {
  if (['confirmed', 'packed', 'shipped', 'delivered', 'paid', 'fulfilled', 'ready'].includes(status)) return 'admin-badge--success';
  if (['cancelled', 'refunded', 'unreachable'].includes(status)) return 'admin-badge--critical';
  if (status === 'cod_pending') return 'admin-badge--payment-pending';
  if (['pending', 'received', 'cod_pending', 'unfulfilled', 'out_for_delivery'].includes(status)) return 'admin-badge--attention';
  return 'admin-badge--neutral';
}

async function loadJntAddressGuide() {
  if (!jntAddressGuidePromise) {
    jntAddressGuidePromise = fetch(JNT_ADDRESS_GUIDE_URL)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load J&T address guide.');
        return response.json();
      });
  }
  return jntAddressGuidePromise;
}

async function loadOrderDetail(orderNumber) {
  selectedOrderNumber = orderNumber;
  if (!detailRoot) return;

  setOrderDetailMode(true);
  detailRoot.innerHTML = '<p class="loading-copy">Loading order...</p>';

  try {
    const { order } = await adminFetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}`);
    renderOrderDetail(order);
    await loadOrders();
  } catch (error) {
    detailRoot.innerHTML = `<p class="form-status">${escapeHtml(error.message)}</p>`;
  }
}

function renderOrderDetail(order) {
  detailRoot.innerHTML = `<article class="admin-card admin-detail-card">
    <header class="admin-card-header admin-order-detail-header">
      <button class="btn btn-outline-secondary btn-sm" type="button" data-admin-order-back>Back to orders</button>
      <div>
        <p class="checkout-success-eyebrow">Order</p>
        <h2>${escapeHtml(order.orderNumber)}</h2>
      </div>
      <span class="admin-badge ${statusBadgeClass(order.status)}">${escapeHtml(order.status)}</span>
    </header>
    <form class="admin-order-detail-grid admin-update-form" data-admin-update-form>
      <section class="card admin-editor-section">
        <div class="admin-card-header"><h3>Customer</h3></div>
        <div class="admin-order-edit-fields" data-admin-order-customer-fields>
          <label class="checkout-field">
            <span>Customer name</span>
            <input name="customerFullName" value="${escapeAttribute(order.customer?.fullName || '')}" required>
          </label>
          <label class="checkout-field">
            <span>Contact number</span>
            <input name="customerPhone" value="${escapeAttribute(order.customer?.phone || '')}" inputmode="tel" required>
          </label>
          <label class="checkout-field">
            <span>Email</span>
            <input name="customerEmail" value="${escapeAttribute(order.customer?.email || '')}" inputmode="email">
          </label>
        </div>
        ${renderOrderContactActions(order)}
      </section>
      <section class="card admin-editor-section">
        <div class="admin-card-header"><h3>Delivery address</h3></div>
        <div class="admin-order-edit-fields" data-admin-order-address-fields>
          <label class="checkout-field admin-notes-field">
            <span>Full address shown to courier</span>
            <textarea name="addressLine" rows="3">${escapeHtml(order.address?.addressLine || '')}</textarea>
          </label>
          <label class="checkout-field">
            <span>Detailed address / house / street / landmark</span>
            <input name="addressHouseAddress" value="${escapeAttribute(order.address?.houseAddress || '')}" required>
          </label>
          <div class="admin-order-address-grid">
            <label class="checkout-field">
              <span>Province</span>
              <select name="addressProvince" data-admin-address-province data-selected-value="${escapeAttribute(order.address?.province || '')}" required>
                <option value="${escapeAttribute(order.address?.province || '')}">${escapeHtml(order.address?.province || 'Loading provinces...')}</option>
              </select>
            </label>
            <label class="checkout-field">
              <span>City / Municipality</span>
              <select name="addressCity" data-admin-address-city data-selected-value="${escapeAttribute(order.address?.city || '')}" required disabled>
                <option value="${escapeAttribute(order.address?.city || '')}">${escapeHtml(order.address?.city || 'Select province first')}</option>
              </select>
            </label>
            <label class="checkout-field">
              <span>Barangay</span>
              <select name="addressBarangay" data-admin-address-barangay data-selected-value="${escapeAttribute(order.address?.barangay || '')}" required disabled>
                <option value="${escapeAttribute(order.address?.barangay || '')}">${escapeHtml(order.address?.barangay || 'Select city / municipality first')}</option>
              </select>
            </label>
          </div>
        </div>
        <dl class="admin-order-detail-list">
          <div><dt>Region</dt><dd>${escapeHtml(order.shippingRegionLabel || 'Shipping region')}</dd></div>
          <div><dt>Shipping fee</dt><dd>${money(order.shippingFeeCents)}</dd></div>
          <div><dt>Delivery method</dt><dd>${escapeHtml(order.deliveryMethod || 'Standard shipping')}</dd></div>
        </dl>
      </section>
      <section class="card admin-editor-section admin-order-items-card">
        <div class="admin-card-header"><h3>Items</h3><span>${Number(order.itemCount || order.items?.length || 0)} items</span></div>
        <div class="admin-order-item-list">
          ${(order.items || []).map((item) => `<article>
            <strong>${escapeHtml(item.productName)}</strong>
            <span>${escapeHtml(item.size)} · Qty ${Number(item.quantity || 0)} · ${money(Number(item.unitPriceCents || 0) * Number(item.quantity || 0))}</span>
          </article>`).join('')}
        </div>
      </section>
      <section class="card admin-editor-section">
        <div class="admin-card-header"><h3>Payment and COD</h3></div>
        <dl class="admin-order-detail-list">
          <div><dt>Total</dt><dd>${money(order.totalCents)}</dd></div>
          <div><dt>Payment</dt><dd><span class="admin-badge ${statusBadgeClass(order.paymentStatus)}">${escapeHtml(paymentStatusLabel(order.paymentStatus))}</span></dd></div>
          <div><dt>COD confirmation</dt><dd><span class="admin-badge ${statusBadgeClass(order.codConfirmationStatus || 'pending')}">${escapeHtml(order.codConfirmationStatus || 'pending')}</span></dd></div>
          <div><dt>Placed</dt><dd>${escapeHtml(formatAdminDate(order.placedAt))}</dd></div>
        </dl>
      </section>
      <section class="card admin-editor-section">
        <div class="admin-card-header"><h3>Fulfillment checklist</h3></div>
        ${renderFulfillmentChecklist(order)}
      </section>
      <section class="card admin-editor-section">
        <div class="admin-card-header"><h3>Notes and tags</h3></div>
        <div class="admin-order-workflow-form">
          <label class="checkout-field">
            <span>Order status</span>
            <select name="status">${statusOptions(['received', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'], order.status)}</select>
          </label>
          <label class="checkout-field">
            <span>Fulfillment status</span>
            <select name="fulfillmentStatus">${statusOptions(['unfulfilled', 'packed', 'shipped', 'delivered', 'cancelled'], order.fulfillmentStatus)}</select>
          </label>
          <label class="checkout-field">
            <span>Payment status</span>
            <select name="paymentStatus">${statusOptions(['cod_pending', 'paid', 'cancelled', 'refunded'], order.paymentStatus)}</select>
          </label>
          <label class="checkout-field">
            <span>COD confirmation</span>
            <select name="codConfirmationStatus">${statusOptions(['pending', 'confirmed', 'unreachable', 'cancelled'], order.codConfirmationStatus || 'pending')}</select>
          </label>
          <label class="checkout-field">
            <span>Delivery status</span>
            <select name="deliveryStatus">${statusOptions(['pending', 'ready', 'out_for_delivery', 'delivered', 'returned', 'cancelled'], order.deliveryStatus || 'pending')}</select>
          </label>
          <label class="checkout-field">
            <span>Tracking number</span>
            <input name="trackingNumber" value="${escapeAttribute(order.trackingNumber || '')}">
          </label>
          <input type="hidden" name="deliveryMethod" value="${escapeAttribute(order.deliveryMethod || 'Standard shipping')}">
          <label class="checkout-field">
            <span>Tags</span>
            <input name="tags" value="${escapeAttribute(Array.isArray(order.tags) ? order.tags.join(', ') : '')}">
          </label>
          <label class="checkout-field admin-notes-field">
            <span>Internal notes</span>
            <textarea name="notes" rows="4">${escapeHtml(order.notes || '')}</textarea>
          </label>
          <button class="btn btn-dark" type="submit">Save order</button>
          <p class="form-status" data-admin-update-status aria-live="polite"></p>
        </div>
      </section>
    </form>
  </article>`;

  detailRoot.querySelector('[data-admin-order-back]')?.addEventListener('click', backToOrdersList);
  detailRoot.querySelector('[data-admin-update-form]')?.addEventListener('submit', updateSelectedOrder);
  hydrateAdminOrderAddressDropdowns(order);
  detailRoot.querySelectorAll('[data-admin-copy-order-phone], [data-admin-copy-order-address]').forEach((button) => {
    button.addEventListener('click', () => copyOrderText(button.dataset.adminCopyOrderPhone || button.dataset.adminCopyOrderAddress || ''));
  });
}

function renderOrderContactActions(order) {
  const phone = order.customer?.phone || '';
  const address = order.address?.addressLine || '';
  const smsBody = `Hi ${order.customer?.fullName || 'Customer'}, this is Maria Clara Clothing confirming your COD order ${order.orderNumber}.`;
  return `<div class="admin-order-contact-actions">
    <button class="btn btn-outline-secondary btn-sm" type="button" data-admin-copy-order-phone="${escapeAttribute(phone)}">Copy phone</button>
    <button class="btn btn-outline-secondary btn-sm" type="button" data-admin-copy-order-address="${escapeAttribute(address)}">Copy address</button>
    <a class="btn btn-outline-secondary btn-sm" href="sms:${escapeAttribute(phone)}?&body=${encodeURIComponent(smsBody)}">SMS customer</a>
  </div>`;
}

function renderFulfillmentChecklist(order) {
  const checks = [
    ['COD confirmed', order.codConfirmationStatus === 'confirmed' || order.paymentStatus === 'paid'],
    ['Items checked', Array.isArray(order.items) && order.items.length > 0],
    ['Packed', ['packed', 'shipped', 'delivered'].includes(order.fulfillmentStatus)],
    ['Tracking added', Boolean(order.trackingNumber)],
    ['Shipped', ['shipped', 'delivered'].includes(order.fulfillmentStatus)]
  ];
  return `<div class="admin-fulfillment-checklist">
    ${checks.map(([label, done]) => `<span class="${done ? 'is-done' : ''}">${done ? '✓' : '○'} ${escapeHtml(label)}</span>`).join('')}
  </div>`;
}

async function copyOrderText(value) {
  if (!value) return;
  try {
    await navigator.clipboard?.writeText(value);
    showAdminToast('Copied.');
  } catch (_error) {
    window.prompt('Copy this value', value);
  }
}

function setOrderDetailMode(isEditing) {
  document.querySelector('[data-admin-page="orders"]')?.classList.toggle('is-order-detailing', Boolean(isEditing));
}

function backToOrdersList() {
  selectedOrderNumber = '';
  setOrderDetailMode(false);
  if (detailRoot) {
    detailRoot.innerHTML = `<article class="admin-card card">
      <p class="loading-copy">Select an order.</p>
    </article>`;
  }
  loadOrders();
}

function statusOptions(options, selectedValue) {
  return options.map((option) => `<option value="${escapeAttribute(option)}" ${option === selectedValue ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('');
}

function adminAddressOptionMarkup(items, selectedValue, placeholder) {
  const normalizedSelectedValue = String(selectedValue || '').trim().toUpperCase();
  const options = [`<option value="">${escapeHtml(placeholder)}</option>`].concat((items || []).map((item) => {
    const value = String(item.name || '').trim().toUpperCase();
    const code = String(item.code || '').trim();
    const selected = value === normalizedSelectedValue ? 'selected' : '';
    return `<option value="${escapeAttribute(value)}" data-address-code="${escapeAttribute(code)}" ${selected}>${escapeHtml(value)}</option>`;
  }));
  return options.join('');
}

function selectedAddressCode(select) {
  return select?.selectedOptions?.[0]?.dataset?.addressCode || '';
}

function selectedAdminAddressValue(select) {
  return String(select?.value || '').trim().toUpperCase();
}

async function hydrateAdminOrderAddressDropdowns(order) {
  const form = detailRoot?.querySelector('[data-admin-update-form]');
  const provinceSelect = form?.querySelector('[data-admin-address-province]');
  const citySelect = form?.querySelector('[data-admin-address-city]');
  const barangaySelect = form?.querySelector('[data-admin-address-barangay]');
  if (!provinceSelect || !citySelect || !barangaySelect) return;

  try {
    const guide = await loadJntAddressGuide();
    const selectedProvince = String(order.address?.province || '').trim().toUpperCase();
    const selectedCity = String(order.address?.city || '').trim().toUpperCase();
    const selectedBarangay = String(order.address?.barangay || '').trim().toUpperCase();

    const renderBarangays = () => {
      const cityCode = selectedAddressCode(citySelect);
      const barangays = guide.barangays?.[cityCode] || [];
      barangaySelect.innerHTML = adminAddressOptionMarkup(barangays, barangaySelect.dataset.selectedValue || '', 'Select barangay');
      barangaySelect.disabled = !barangays.length;
    };

    const renderCities = () => {
      const province = selectedAdminAddressValue(provinceSelect);
      const cities = guide.cities?.[province] || [];
      citySelect.innerHTML = adminAddressOptionMarkup(cities, citySelect.dataset.selectedValue || '', 'Select city / municipality');
      citySelect.disabled = !cities.length;
      renderBarangays();
    };

    provinceSelect.innerHTML = adminAddressOptionMarkup(guide.provinces || [], selectedProvince, 'Select province');
    citySelect.dataset.selectedValue = selectedCity;
    barangaySelect.dataset.selectedValue = selectedBarangay;
    renderCities();

    provinceSelect.addEventListener('change', () => {
      citySelect.dataset.selectedValue = '';
      barangaySelect.dataset.selectedValue = '';
      renderCities();
      syncAdminOrderAddressLine(form);
    });
    citySelect.addEventListener('change', () => {
      barangaySelect.dataset.selectedValue = '';
      renderBarangays();
      syncAdminOrderAddressLine(form);
    });
    barangaySelect.addEventListener('change', () => syncAdminOrderAddressLine(form));
    form.querySelector('[name="addressHouseAddress"]')?.addEventListener('input', () => syncAdminOrderAddressLine(form));
  } catch (error) {
    showAdminToast(error.message, 'error');
  }
}

function syncAdminOrderAddressLine(form) {
  const addressLineInput = form?.querySelector('[name="addressLine"]');
  if (!addressLineInput) return;

  addressLineInput.value = formatAdminOrderAddress({
    houseAddress: form.querySelector('[name="addressHouseAddress"]')?.value,
    barangay: form.querySelector('[name="addressBarangay"]')?.value,
    city: form.querySelector('[name="addressCity"]')?.value,
    province: form.querySelector('[name="addressProvince"]')?.value
  });
}

function formatAdminOrderAddress(address) {
  return [
    address.houseAddress,
    address.barangay,
    address.city,
    address.province,
    'Philippines'
  ].map((part) => String(part || '').trim()).filter(Boolean).join(', ');
}

async function updateSelectedOrder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector('[data-admin-update-status]');
  const formData = new FormData(form);

  try {
    const address = {
      houseAddress: String(formData.get('addressHouseAddress') || '').trim(),
      barangay: String(formData.get('addressBarangay') || '').trim(),
      city: String(formData.get('addressCity') || '').trim(),
      province: String(formData.get('addressProvince') || '').trim()
    };
    address.addressLine = String(formData.get('addressLine') || '').trim() || formatAdminOrderAddress(address);

    const { order } = await adminFetch(`/api/admin/orders/${encodeURIComponent(selectedOrderNumber)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customer: {
          fullName: formData.get('customerFullName'),
          phone: formData.get('customerPhone'),
          email: formData.get('customerEmail')
        },
        address,
        status: formData.get('status'),
        fulfillmentStatus: formData.get('fulfillmentStatus'),
        paymentStatus: formData.get('paymentStatus'),
        codConfirmationStatus: formData.get('codConfirmationStatus'),
        deliveryStatus: formData.get('deliveryStatus'),
        deliveryMethod: formData.get('deliveryMethod'),
        trackingNumber: formData.get('trackingNumber'),
        tags: String(formData.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean),
        notes: formData.get('notes')
      })
    });
    if (status) status.textContent = 'Order saved.';
    renderOrderDetail(order);
    await loadOrders();
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function loadProducts() {
  if (!productsRoot) return;

  const params = new URLSearchParams();
  const query = productSearchInput?.value.trim() || '';
  if (query) params.set('q', query);
  if (productStatusFilter?.value) params.set('status', productStatusFilter.value);
  if (productCategoryFilter?.value) params.set('collection', productCategoryFilter.value);
  if (productStockFilter?.value) params.set('stock', productStockFilter.value);
  if (productSortInput?.value) params.set('sort', productSortInput.value);

  productsRoot.innerHTML = renderProductTableSkeleton();

  try {
    const { products, summary } = await adminFetch(`/api/admin/products${params.toString() ? `?${params}` : ''}`);
    productRows = products;
    renderProductCategoryFilter(products);
    renderProductSummary(summary);
    renderProducts(products);
    if (productCount) productCount.textContent = String(summary?.total || products.length);
  } catch (error) {
    productsRoot.innerHTML = `<p class="form-status">${escapeHtml(error.message)}</p>`;
    if (/authentication/i.test(error.message)) {
      adminToken = '';
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      showDashboard(false);
    }
  }
}

function renderProductTableSkeleton() {
  return `<div class="admin-product-table-header">
    <h2>Products</h2>
    <span>Loading</span>
  </div>
  <div class="admin-table-scroll table-responsive">
    <table class="admin-product-table table table-hover align-middle">
      <tbody>
        <tr><td><span class="admin-skeleton"></span></td></tr>
        <tr><td><span class="admin-skeleton"></span></td></tr>
        <tr><td><span class="admin-skeleton"></span></td></tr>
      </tbody>
    </table>
  </div>`;
}

function renderProductSummary(summary = {}) {
  if (!productSummaryRoot) return;

  productSummaryRoot.innerHTML = `<article class="admin-product-summary-column admin-product-summary-column--date">
    <span class="admin-products-title-icon" aria-hidden="true">◷</span>
    <strong>30 days</strong>
  </article>
  <article class="admin-product-summary-column">
    <span>Average sell-through rate</span>
    <strong>35.09% —</strong>
  </article>
  <article class="admin-product-summary-column">
    <span>Products by days of inventory remaining</span>
    <strong>No data</strong>
  </article>
  <article class="admin-product-summary-column">
    <span>ABC product analysis</span>
    <div class="admin-product-abc-values">
      <strong>₱13,470.00 A</strong>
      <strong>₱449.00 B</strong>
      <strong>₱4,939.00 C</strong>
    </div>
    <div class="admin-product-abc-bars" aria-hidden="true"><span></span><span></span><span></span></div>
  </article>`;
}

function renderProductCategoryFilter(products) {
  if (!productCategoryFilter) return;

  const selected = productCategoryFilter.value;
  const categories = [...new Set(products.flatMap((product) => product.collections || [product.category]).filter(Boolean))].sort();
  productCategoryFilter.innerHTML = [
    '<option value="">All categories</option>',
    ...categories.map((category) => `<option value="${escapeAttribute(category)}" ${category === selected ? 'selected' : ''}>${escapeHtml(category)}</option>`)
  ].join('');
}

function renderProducts(products) {
  if (!products.length) {
    productsRoot.innerHTML = '<p class="loading-copy">No products found.</p>';
    return;
  }

  productsRoot.innerHTML = `<section class="admin-product-filter-shell" aria-label="Product filters">
    <button class="admin-product-view-button" type="button">All <span aria-hidden="true">⌄</span></button>
    <label class="admin-product-search">
      <span>Search products</span>
      <input type="search" placeholder="Search and filter" value="${escapeAttribute(productSearchInput?.value || '')}" data-admin-product-table-search>
    </label>
    <button class="btn btn-outline-secondary btn-sm admin-icon-button" type="button" aria-label="Table settings" data-admin-product-table-settings>⚙</button>
  </section>
  <div class="admin-product-table-header">
    <span>${products.length} shown · ${selectedProducts.size} selected</span>
  </div>
  <div class="admin-table-scroll">
    <table class="admin-product-table table table-hover align-middle">
      <thead>
        <tr>
          <th><input type="checkbox" aria-label="Select all products" data-admin-product-select-all></th>
          <th>Product</th>
          <th>Status</th>
          <th>Inventory</th>
          <th>Category</th>
          <th>Channels</th>
          <th>Product type</th>
          <th>Vendor</th>
        </tr>
      </thead>
      <tbody>
        ${products.map((product) => `<tr class="admin-product-row ${product.slug === selectedProductSlug ? 'is-selected' : ''}" data-admin-product="${escapeAttribute(product.slug)}" tabindex="0">
          <td data-admin-cell-label="Select"><input type="checkbox" aria-label="Select ${escapeAttribute(product.name)}" data-admin-product-checkbox="${escapeAttribute(product.slug)}" ${selectedProducts.has(product.slug) ? 'checked' : ''}></td>
          <td data-admin-cell-label="Product">
            <span class="admin-product-cell">
              <img class="admin-product-thumbnail" src="${escapeAttribute(product.image || '/product/3.png')}" alt="">
              <span><strong>${escapeHtml(product.name)}</strong></span>
            </span>
          </td>
          <td data-admin-cell-label="Status">${renderProductStatus(product.status)}</td>
          <td data-admin-cell-label="Inventory">${renderProductInventory(product)}</td>
          <td data-admin-cell-label="Category">${escapeHtml(product.category || product.collections?.[0] || 'T-Shirts')}</td>
          <td data-admin-cell-label="Channels">${escapeHtml(formatProductChannels(product.channels))}</td>
          <td data-admin-cell-label="Product type">${escapeHtml(product.productType || 'Tshirt')}</td>
          <td data-admin-cell-label="Vendor">${escapeHtml(product.vendor || 'Maria Clara')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;

  bindProductTableFilters();

  productsRoot.querySelectorAll('[data-admin-product]').forEach((button) => {
    button.addEventListener('click', () => loadProductDetail(button.dataset.adminProduct));
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        loadProductDetail(button.dataset.adminProduct);
      }
    });
  });
  productsRoot.querySelectorAll('[data-admin-product-checkbox]').forEach((checkbox) => {
    checkbox.addEventListener('click', (event) => event.stopPropagation());
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedProducts.add(checkbox.dataset.adminProductCheckbox);
      else selectedProducts.delete(checkbox.dataset.adminProductCheckbox);
      renderProducts(productRows);
    });
  });
  productsRoot.querySelector('[data-admin-product-select-all]')?.addEventListener('change', (event) => {
    selectedProducts = event.currentTarget.checked ? new Set(products.map((product) => product.slug)) : new Set();
    renderProducts(productRows);
  });
}

function renderProductInventory(product) {
  const stock = Number(product.inventoryQuantity || 0);
  const variants = Number(product.variantCount || 0);
  if (stock <= 0) return `<span class="admin-inventory-empty">0 in stock</span> for ${variants} variants`;
  return `${stock} in stock for ${variants} variants ${product.stockStatus === 'low_stock' ? '<span class="admin-limited-label">Limited pieces</span>' : ''}`;
}

function formatProductChannels(channels) {
  if (Array.isArray(channels)) return String(channels.length || 5);
  const value = String(channels || '').trim();
  if (!value || value === 'Online Store') return '5';
  if (/^\d+$/.test(value)) return value;
  return String(value.split(',').filter(Boolean).length || 5);
}

function bindProductTableFilters() {
  const tableSearch = productsRoot.querySelector('[data-admin-product-table-search]');
  tableSearch?.addEventListener('input', () => {
    if (productSearchInput) productSearchInput.value = tableSearch.value;
    loadProducts();
  });
  productsRoot.querySelector('[data-admin-product-table-settings]')?.addEventListener('click', () => window.alert('Table settings are available in this layout.'));
}

async function loadCollectionsPage() {
  if (!collectionTabsRoot || !collectionProductsRoot) return;

  collectionProductsRoot.innerHTML = '<p class="loading-copy">Loading collection products...</p>';
  if (collectionStatusRoot) collectionStatusRoot.textContent = '';

  try {
    const { products } = await adminFetch('/api/admin/products?sort=name_asc');
    collectionProducts = products;
    renderCollectionTabs();
    renderCollectionProductPicker();
    renderCollectionProducts();
  } catch (error) {
    collectionProductsRoot.innerHTML = `<p class="form-status">${escapeHtml(error.message)}</p>`;
  }
}

function renderCollectionTabs() {
  if (!collectionTabsRoot) return;

  collectionTabsRoot.innerHTML = STOREFRONT_COLLECTIONS.map((collectionName) => {
    const count = collectionProducts.filter((product) => productInCollection(product, collectionName)).length;
    return `<button class="btn btn-outline-secondary admin-collection-tab ${collectionName === activeCollectionName ? 'is-active' : ''}" type="button" data-admin-collection-tab="${escapeAttribute(collectionName)}">
      ${escapeHtml(collectionName)} <span>${count}</span>
    </button>`;
  }).join('');

  collectionTabsRoot.querySelectorAll('[data-admin-collection-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      activeCollectionName = button.dataset.adminCollectionTab || STOREFRONT_COLLECTIONS[0];
      renderCollectionTabs();
      renderCollectionProductPicker();
      renderCollectionProducts();
    });
  });
}

function renderCollectionProductPicker() {
  if (!collectionAddProductInput) return;

  const availableProducts = collectionProducts
    .filter((product) => !productInCollection(product, activeCollectionName))
    .sort((a, b) => a.name.localeCompare(b.name));
  collectionAddProductInput.innerHTML = [
    `<option value="">Add product to ${escapeHtml(activeCollectionName)}</option>`,
    ...availableProducts.map((product) => `<option value="${escapeAttribute(product.slug)}">${escapeHtml(product.name)}</option>`)
  ].join('');
  collectionAddProductInput.disabled = !availableProducts.length;
}

function renderCollectionProducts() {
  if (!collectionProductsRoot) return;

  const products = collectionProducts
    .filter((product) => productInCollection(product, activeCollectionName))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!products.length) {
    collectionProductsRoot.innerHTML = `<div class="admin-empty-state">
      <h2>No products in ${escapeHtml(activeCollectionName)}</h2>
      <p>Add products with the selector above to show them on the customer homepage.</p>
    </div>`;
    return;
  }

  collectionProductsRoot.innerHTML = products.map((product) => `<article class="admin-collection-product-row">
    <img src="${escapeAttribute(product.image || '/brand/logo.png')}" alt="">
    <div>
      <strong>${escapeHtml(product.name)}</strong>
      <span>${escapeHtml(product.status || 'active')} · ${Number(product.inventoryQuantity || 0)} in stock</span>
    </div>
    <div class="admin-collection-product-actions">
      <button class="btn btn-outline-secondary btn-sm" type="button" data-admin-collection-edit="${escapeAttribute(product.slug)}">Edit</button>
      <button class="btn btn-outline-danger btn-sm admin-critical-link" type="button" data-admin-collection-remove="${escapeAttribute(product.slug)}">Remove</button>
    </div>
  </article>`).join('');

  collectionProductsRoot.querySelectorAll('[data-admin-collection-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      renderAdminPage('products');
      loadProductDetail(button.dataset.adminCollectionEdit);
    });
  });
  collectionProductsRoot.querySelectorAll('[data-admin-collection-remove]').forEach((button) => {
    button.addEventListener('click', () => removeProductFromActiveCollection(button.dataset.adminCollectionRemove));
  });
}

async function addProductToActiveCollection(slug) {
  if (!slug) return;
  await saveProductCollections(slug, (collections) => [...collections, activeCollectionName]);
  if (collectionAddProductInput) collectionAddProductInput.value = '';
}

async function removeProductFromActiveCollection(slug) {
  if (!slug) return;
  await saveProductCollections(slug, (collections) => collections.filter((collectionName) => collectionName !== activeCollectionName));
}

async function saveProductCollections(slug, changeCollections) {
  if (collectionStatusRoot) collectionStatusRoot.textContent = 'Saving collection...';

  try {
    const { product } = await adminFetch(`/api/admin/products/${encodeURIComponent(slug)}`);
    const currentCollections = Array.isArray(product.collections) ? product.collections : [];
    const nextCollections = [...new Set(changeCollections(currentCollections))]
      .map((collectionName) => String(collectionName || '').trim())
      .filter(Boolean);
    const collections = nextCollections.length ? nextCollections : ['Uncategorized'];
    const response = await adminFetch(`/api/admin/products/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...product,
        collections
      })
    });
    collectionProducts = collectionProducts.map((item) => item.slug === slug
      ? { ...item, collections: response.product.collections, category: response.product.collections[0] || item.category }
      : item);
    renderCollectionTabs();
    renderCollectionProductPicker();
    renderCollectionProducts();
    showAdminToast('Collection updated.');
    if (collectionStatusRoot) collectionStatusRoot.textContent = 'Collection updated.';
  } catch (error) {
    if (collectionStatusRoot) collectionStatusRoot.textContent = error.message;
  }
}

function productInCollection(product, collectionName) {
  return Array.isArray(product.collections) && product.collections.includes(collectionName);
}

function productBadgeClass(status) {
  if (status === 'active') return 'admin-badge--success';
  if (status === 'draft') return 'admin-badge--attention';
  if (status === 'archived') return 'admin-badge--neutral';
  return 'admin-badge--neutral';
}

function renderProductStatus(status) {
  const normalizedStatus = String(status || 'draft').trim().toLowerCase();
  return `<span class="admin-product-status-indicator admin-product-status-indicator--${escapeAttribute(normalizedStatus)}">
    <span class="admin-product-status-dot" aria-hidden="true"></span>
    <span>${escapeHtml(normalizedStatus)}</span>
  </span>`;
}

function setProductEditingMode(isEditing) {
  document.querySelector('[data-admin-page="products"]')?.classList.toggle('is-product-editing', Boolean(isEditing));
  if (productsRoot) productsRoot.hidden = Boolean(isEditing);
  if (productDetailRoot) productDetailRoot.hidden = !isEditing;
}

async function backToProductsList() {
  setProductEditingMode(false);
  selectedProductSlug = '';
  if (productDetailRoot) {
    productDetailRoot.innerHTML = '';
  }
  await loadProducts();
}

async function loadProductDetail(slug) {
  selectedProductSlug = slug;
  if (!productDetailRoot) return;

  setProductEditingMode(true);
  productDetailRoot.innerHTML = '<p class="loading-copy">Loading product...</p>';

  try {
    const { product } = await adminFetch(`/api/admin/products/${encodeURIComponent(slug)}`);
    renderProductDetail(product);
    await loadProducts();
  } catch (error) {
    productDetailRoot.innerHTML = `<p class="form-status">${escapeHtml(error.message)}</p>`;
  }
}

function renderProductDetail(product = null) {
  const currentProduct = product || emptyProduct();
  const isNew = !product;
  const images = Array.isArray(currentProduct.images) ? currentProduct.images : [];
  const primaryImage = images[0]?.url || '/product/3.png';
  const variants = Array.isArray(currentProduct.variants) && currentProduct.variants.length ? currentProduct.variants : emptyProduct().variants;
  const totalInventory = variants.reduce((sum, variant) => sum + Number(variant.stockQuantity || 0), 0);
  const seo = currentProduct.seo || {};
  const metafields = currentProduct.metafields || {};
  setProductEditingMode(true);

  productDetailRoot.innerHTML = `<article class="admin-product-editor-shell">
    <header class="admin-card-header admin-product-editor-header">
      <button class="btn btn-outline-secondary btn-sm admin-icon-button" type="button" data-admin-product-back aria-label="Back to products">‹</button>
      <div>
        <p class="checkout-success-eyebrow">${isNew ? 'Create' : 'Edit'} product</p>
        <h2>${escapeHtml(currentProduct.name || 'New product')}</h2>
        ${renderProductStatus(currentProduct.status || 'draft')}
      </div>
      <div class="admin-page-actions">
        ${isNew ? '' : `<button class="btn btn-outline-secondary" type="button" data-admin-duplicate-product>Duplicate</button>`}
        ${isNew ? '' : `<a class="btn btn-outline-secondary" href="/product.html?slug=${escapeAttribute(currentProduct.slug)}" target="_blank" rel="noreferrer">View</a>`}
        <select class="form-select admin-compact-select" data-admin-editor-more-actions aria-label="More actions">
          <option value="">More actions</option>
          ${isNew ? '' : '<option value="duplicate">Duplicate product</option><option value="archive">Archive product</option><option value="delete">Delete product</option><option value="preview">Preview product</option>'}
        </select>
        <button class="btn btn-outline-secondary btn-sm admin-icon-button" type="button" aria-label="Previous product">‹</button>
        <button class="btn btn-outline-secondary btn-sm admin-icon-button" type="button" aria-label="Next product">›</button>
      </div>
    </header>
    <form class="admin-update-form" data-admin-product-form>
      <div class="admin-product-editor-grid">
        <div class="admin-product-editor-main">
          <section class="card admin-editor-section">
            <label class="checkout-field">
              <span>Product title</span>
              <input name="name" value="${escapeAttribute(currentProduct.name)}" placeholder="KAMALAYAN BLOOM BLACK - Oversized 240 GSM Shirt" required>
            </label>
            <input type="hidden" name="slug" value="${escapeAttribute(currentProduct.slug)}">
          </section>
          <section class="card admin-editor-section">
            <div class="admin-card-header">
              <h3>Description editor</h3>
            </div>
            <div class="admin-rich-toolbar" data-admin-rich-editor-toolbar>
              <select aria-label="Text format" data-admin-block-format><option value="div">Paragraph</option><option value="h2">Heading</option><option value="h3">Subheading</option></select>
              <button type="button" data-admin-description-command="bold"><strong>B</strong></button>
              <button type="button" data-admin-description-command="italic"><em>I</em></button>
              <button type="button" data-admin-description-command="underline"><u>U</u></button>
              <button type="button" data-admin-description-command="foreColor">Color</button>
              <button type="button" data-admin-description-command="justifyLeft">Left</button>
              <button type="button" data-admin-description-command="justifyCenter">Center</button>
              <button type="button" data-admin-description-command="createLink">Link</button>
              <button type="button" data-admin-description-command="insertUnorderedList">List</button>
              <button type="button" data-admin-description-command="formatBlock" data-admin-format-value="pre">Code</button>
            </div>
            <div class="admin-rich-editor" contenteditable="true" data-admin-description-editor aria-label="Product description">${renderAdminDescriptionForEditor(currentProduct.description)}</div>
            <textarea class="admin-hidden-field" name="description" rows="1">${escapeHtml(currentProduct.description)}</textarea>
          </section>
          <section class="card admin-editor-section admin-image-manager">
            <div class="admin-card-header">
              <h3>Media</h3>
              ${isNew ? '<span>Save product first</span>' : `<label class="btn btn-outline-secondary admin-image-upload">
                Add media
                <input type="file" accept="image/*" multiple data-admin-product-image-upload>
              </label>`}
            </div>
            <div class="admin-media-layout">
              <img class="admin-media-primary" src="${escapeAttribute(primaryImage)}" alt="${escapeAttribute(currentProduct.name || 'Product image')}">
              <div class="admin-image-grid" data-admin-product-image-grid>
                ${renderProductImages(images)}
                <label class="admin-media-add-box ${isNew ? 'is-disabled' : ''}">
                  <span>+</span>
                  <small>Add media</small>
                  ${isNew ? '' : '<input type="file" accept="image/*" multiple data-admin-product-image-upload>'}
                </label>
              </div>
            </div>
            ${isNew ? '' : '<button class="btn btn-outline-secondary" type="button" data-admin-save-product-images>Save photo details</button>'}
            <textarea class="admin-hidden-field" name="images" rows="1">${escapeHtml(formatImagesForForm(images))}</textarea>
          </section>
          <section class="card admin-editor-section">
            <div class="admin-card-header">
              <h3>Category</h3>
            </div>
            <label class="checkout-field">
              <span>Product category</span>
              <select name="category">
                ${statusOptions(['T-Shirts', 'Clothing Tops', 'Oversized Shirt', 'New Arrivals'], currentProduct.category || currentProduct.collections?.[0] || 'T-Shirts')}
              </select>
            </label>
            <p class="admin-helper-text">Used for storefront filters, reports, and product organization.</p>
          </section>
          <section class="card admin-editor-section">
            <div class="admin-card-header">
              <h3>Variants</h3>
              <button class="btn btn-outline-secondary btn-sm" type="button" data-admin-add-variant>Add Variant</button>
            </div>
            <div class="admin-size-pill-row">
              ${['Small', 'Medium', 'Large', 'XLarge', '2XLarge', '3XLarge'].map((size) => `<span>${escapeHtml(size)}</span>`).join('')}
              <button type="button">Add another option</button>
            </div>
            <div class="admin-table-scroll table-responsive">
              <table class="admin-variant-table table table-sm align-middle">
                <thead>
                  <tr>
                    <th><input type="checkbox" aria-label="Select variants"></th>
                    <th>Variant</th>
                    <th>Price</th>
                    <th>Available</th>
                    <th>Publishing</th>
                  </tr>
                </thead>
                <tbody>
                  ${variants.map((variant) => renderVariantRow(variant, currentProduct.priceCents)).join('')}
                </tbody>
              </table>
            </div>
            <p class="admin-total-inventory" data-admin-total-inventory>Total inventory: ${totalInventory} available</p>
          </section>
          <section class="card admin-editor-section admin-metafield-card">
            <div class="admin-card-header">
              <h3>Category metafields</h3>
              <button class="btn btn-outline-secondary btn-sm" type="button">Accept all</button>
            </div>
            <p class="admin-suggestion-banner">3 suggestions available</p>
            <div class="admin-metafield-grid">
              ${renderMetafieldInput('Color', 'color', metafields.color || ['Black', 'Floral'])}
              ${renderMetafieldInput('Size', 'size', metafields.size || ['Small', 'Medium', 'Large', 'XLarge', '2XLarge', '3XLarge'])}
              ${renderMetafieldInput('Fabric', 'fabric', metafields.fabric || ['Cotton'])}
              ${renderMetafieldInput('Age group', 'ageGroup', metafields.ageGroup || [])}
              ${renderMetafieldInput('Care instructions', 'careInstructions', metafields.careInstructions || ['Hand wash'])}
              ${renderMetafieldInput('Neckline', 'neckline', metafields.neckline || ['Crew'])}
              ${renderMetafieldInput('Sleeve length type', 'sleeveLengthType', metafields.sleeveLengthType || ['Short'])}
              ${renderMetafieldInput('Target gender', 'targetGender', metafields.targetGender || ['Unisex'])}
              ${renderMetafieldInput('Top length type', 'topLengthType', metafields.topLengthType || ['Medium', 'Long'])}
            </div>
          </section>
          <section class="card admin-editor-section">
            <div class="admin-card-header">
              <h3>Search engine listing</h3>
              <button class="btn btn-outline-secondary btn-sm admin-icon-button" type="button" aria-label="Edit SEO">✎</button>
            </div>
            <div class="admin-seo-preview" data-admin-seo-preview>
              <small>${escapeHtml(ADMIN_STORE_NAME)}</small>
              <span>/products/${escapeHtml(seo.handle || currentProduct.slug || 'new-product')}</span>
              <strong>${escapeHtml(seo.title || currentProduct.name || 'Product title')}</strong>
              <p>${escapeHtml(seo.description || currentProduct.description || 'Product meta description preview.')}</p>
              <b>${money(currentProduct.priceCents || 0)}</b>
            </div>
            <div class="admin-editor-grid">
              <label class="checkout-field">
                <span>Page title</span>
                <input name="seoTitle" value="${escapeAttribute(seo.title || currentProduct.name || '')}" data-admin-product-seo-title>
              </label>
              <label class="checkout-field">
                <span>URL handle</span>
                <input name="seoHandle" value="${escapeAttribute(seo.handle || currentProduct.slug || '')}">
              </label>
              <label class="checkout-field admin-notes-field">
                <span>Meta description</span>
                <textarea name="seoDescription" rows="3">${escapeHtml(seo.description || '')}</textarea>
              </label>
            </div>
          </section>
        </div>
        <aside class="admin-product-sidebar" data-admin-product-sidebar>
          <section class="card admin-editor-section admin-status-card">
            <h3>Status</h3>
            <div class="admin-status-select-row">
              ${renderProductStatus(currentProduct.status || 'active')}
              <select name="status">${statusOptions(['active', 'draft', 'archived'], currentProduct.status || 'active')}</select>
            </div>
          </section>
          <section class="card admin-editor-section">
            <div class="admin-card-header">
              <h3>Publishing</h3>
              <button class="btn btn-outline-secondary btn-sm admin-icon-button" type="button" aria-label="Channel settings">⚙</button>
            </div>
            <p>All channels</p>
            <span class="admin-channel-pill">Online Store / Website Catalog</span>
          </section>
          <section class="card admin-editor-section">
            <h3>Sales past 90 days</h3>
            <dl class="admin-mini-stats">
              <div><dt>Units sold</dt><dd>0</dd></div>
              <div><dt>Buyers</dt><dd>0</dd></div>
              <div><dt>Net sales</dt><dd>${money(0)}</dd></div>
            </dl>
            <button class="btn btn-link p-0 admin-link-button" type="button">View details</button>
          </section>
          <section class="card admin-editor-section">
            <h3>Product organization</h3>
            <label class="checkout-field">
              <span>Type</span>
              <input name="productType" value="${escapeAttribute(currentProduct.productType || 'Tshirt')}" data-admin-product-type>
            </label>
            <label class="checkout-field">
              <span>Vendor</span>
              <input name="vendor" value="${escapeAttribute(currentProduct.vendor || 'Maria Clara')}" data-admin-product-vendor>
            </label>
            <label class="checkout-field">
              <span>Collections</span>
              <input name="collections" value="${escapeAttribute((currentProduct.collections || ['New Arrivals']).join(', '))}" placeholder="New Arrivals">
            </label>
            <label class="checkout-field">
              <span>Tags</span>
              <input name="tags" value="${escapeAttribute((currentProduct.tags || []).join(', '))}" data-admin-product-tags>
            </label>
          </section>
          <section class="card admin-editor-section">
            <h3>Pricing</h3>
            <label class="checkout-field">
              <span>Price</span>
              <input name="pricePeso" type="number" min="1" step="0.01" value="${escapeAttribute(formatAdminPesoInput(currentProduct.priceCents || 64900))}" required>
            </label>
            <label class="checkout-field">
              <span>Compare-at price</span>
              <input name="compareAtPricePeso" type="number" min="1" step="0.01" value="${currentProduct.compareAtPriceCents ? escapeAttribute(formatAdminPesoInput(currentProduct.compareAtPriceCents)) : ''}">
            </label>
          </section>
          <section class="card admin-editor-section">
            <h3>Theme template</h3>
            <select name="themeTemplate">
              ${statusOptions(['Default product', 'Featured product', 'Limited release'], currentProduct.themeTemplate || 'Default product')}
            </select>
          </section>
        </aside>
      </div>
      <div class="admin-editor-save-bar">
        <button class="btn btn-dark" type="submit">${isNew ? 'Create product' : 'Save product'}</button>
        <p class="form-status" data-admin-product-status aria-live="polite"></p>
      </div>
    </form>
  </article>`;

  productDetailRoot.querySelector('[data-admin-product-back]')?.addEventListener('click', backToProductsList);
  productDetailRoot.querySelector('[data-admin-product-form]')?.addEventListener('submit', (event) => saveProduct(event, isNew, currentProduct.slug));
  productDetailRoot.querySelector('[data-admin-delete-product]')?.addEventListener('click', () => deleteProduct(currentProduct.slug));
  productDetailRoot.querySelector('[data-admin-duplicate-product]')?.addEventListener('click', () => duplicateProduct(currentProduct.slug));
  productDetailRoot.querySelector('[data-admin-editor-more-actions]')?.addEventListener('change', (event) => runEditorMoreAction(event, currentProduct));
  productDetailRoot.querySelectorAll('[data-admin-product-image-upload]').forEach((input) => {
    input.addEventListener('change', (event) => uploadProductImages(event, currentProduct.slug));
  });
  productDetailRoot.querySelector('[data-admin-save-product-images]')?.addEventListener('click', () => saveProductImages(currentProduct.slug));
  productDetailRoot.querySelectorAll('[data-admin-delete-product-image]').forEach((button) => {
    button.addEventListener('click', () => deleteProductImage(currentProduct.slug, Number(button.dataset.adminDeleteProductImage)));
  });
  bindProductDescriptionEditor(productDetailRoot);
  bindProductVariantEditor(productDetailRoot);
  bindProductSeoPreview(productDetailRoot);
}

function emptyProduct() {
  return {
    slug: '',
    name: '',
    description: '',
    collections: ['New Arrivals'],
    status: 'draft',
    priceCents: 0,
    compareAtPriceCents: null,
    category: 'T-Shirts',
    productType: 'Tshirt',
    vendor: 'Maria Clara',
    tags: [],
    seo: { title: '', description: '', handle: '' },
    metafields: {},
    themeTemplate: 'Default product',
    images: [],
    variants: [
      { size: 'Small', sku: 'BLOOMBLACK-S', stockQuantity: 0 },
      { size: 'Medium', sku: 'BLOOMBLACK-M', stockQuantity: 5 },
      { size: 'Large', sku: 'BLOOMBLACK-L', stockQuantity: 15 },
      { size: 'XLarge', sku: 'BLOOMBLACK-XL', stockQuantity: 10 },
      { size: '2XLarge', sku: 'BLOOMBLACK-2XL', stockQuantity: 0 },
      { size: '3XLarge', sku: 'BLOOMBLACK-3XL', stockQuantity: 0 }
    ]
  };
}

function formatImagesForForm(images = []) {
  return images.map((image) => image.url || image).filter(Boolean).join('\n');
}

function renderProductImages(images = []) {
  if (!images.length) {
    return '<p class="loading-copy">No product photos yet.</p>';
  }

  return images.map((image, index) => `<figure class="admin-image-tile">
    <img src="${escapeAttribute(image.url || image)}" alt="${escapeAttribute(image.altText || 'Product image')}">
    <figcaption>
      <span>Photo ${index + 1}</span>
      <small>${escapeHtml(image.url || image)}</small>
      <label class="checkout-field">
        <span>Alt text</span>
        <input value="${escapeAttribute(image.altText || '')}" data-admin-product-image-alt data-admin-image-url="${escapeAttribute(image.url || image)}" data-admin-image-sort-order="${Number(image.sortOrder ?? index)}">
      </label>
      <div class="admin-image-tile-actions">
        <button class="btn btn-outline-secondary btn-sm" type="button" data-admin-move-product-image="-1" disabled>Move up</button>
        <button class="btn btn-outline-danger btn-sm admin-critical-link" type="button" data-admin-delete-product-image="${index}">Delete</button>
      </div>
    </figcaption>
  </figure>`).join('');
}

function renderAdminDescriptionForEditor(description = '') {
  const value = String(description || '');
  return /<[a-z][\s\S]*>/i.test(value) ? value : escapeHtml(value);
}

function renderVariantRow(variant, productPriceCents) {
  return `<tr data-admin-variant-row>
    <td><input type="checkbox" aria-label="Select ${escapeAttribute(variant.size || 'variant')}"></td>
    <td>
      <div class="admin-variant-name">
        <span></span>
        <label>
          <input value="${escapeAttribute(variant.size || '')}" data-admin-variant-size aria-label="Variant size">
          <small><input value="${escapeAttribute(variant.sku || '')}" data-admin-variant-sku aria-label="Variant SKU"></small>
        </label>
      </div>
    </td>
    <td><input type="number" min="1" step="0.01" value="${escapeAttribute(formatAdminPesoInput(variant.priceCents || productPriceCents || 64900))}" data-admin-variant-price aria-label="Variant price"></td>
    <td><input type="number" min="0" step="1" value="${Number(variant.stockQuantity || 0)}" data-admin-variant-stock aria-label="Variant stock"></td>
    <td><span class="admin-channel-pill">Website</span><button class="btn btn-outline-danger btn-sm admin-critical-link" type="button" data-admin-delete-variant>Delete</button></td>
  </tr>`;
}

function renderMetafieldInput(label, key, values = []) {
  return `<label class="checkout-field">
    <span>${escapeHtml(label)}</span>
    <input value="${escapeAttribute((Array.isArray(values) ? values : []).join(', '))}" data-admin-product-metafield="${escapeAttribute(key)}">
  </label>`;
}

function productFromForm(form) {
  const formData = new FormData(form);
  const name = String(formData.get('name') || '').trim();
  const seoHandle = String(formData.get('seoHandle') || '').trim();
  return {
    name,
    slug: seoHandle || String(formData.get('slug') || '').trim(),
    status: formData.get('status'),
    priceCents: adminPesoToCents(formData.get('pricePeso')),
    compareAtPriceCents: formData.get('compareAtPricePeso') ? adminPesoToCents(formData.get('compareAtPricePeso')) : null,
    description: getProductDescriptionFromEditor(form),
    category: String(formData.get('category') || '').trim(),
    productType: String(formData.get('productType') || '').trim(),
    vendor: String(formData.get('vendor') || '').trim(),
    collections: String(formData.get('collections') || '').split(',').map((item) => item.trim()).filter(Boolean),
    tags: String(formData.get('tags') || '').split(',').map((item) => item.trim()).filter(Boolean),
    seo: {
      title: String(formData.get('seoTitle') || '').trim(),
      description: String(formData.get('seoDescription') || '').trim(),
      handle: seoHandle
    },
    metafields: collectProductMetafields(form),
    themeTemplate: String(formData.get('themeTemplate') || 'Default product').trim(),
    images: collectProductImages(form, name),
    variants: collectProductVariants(form)
  };
}

function getProductDescriptionFromEditor(form) {
  const editor = form.querySelector('[data-admin-description-editor]');
  if (!editor) return String(new FormData(form).get('description') || '');
  const html = editor.innerHTML
    .replace(/<div><br><\/div>$/i, '')
    .replace(/<br>$/i, '');
  return htmlToPlainTextIfUnformatted(html);
}

function htmlToPlainTextIfUnformatted(html) {
  const textOnly = String(html || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div><div>/gi, '\n')
    .replace(/^<div>/i, '')
    .replace(/<\/div>$/i, '');
  return /<(strong|b|em|i|u|h2|h3|ul|ol|li|a|span|pre)\b/i.test(html)
    ? html
    : decodeHtml(textOnly.replace(/<[^>]+>/g, ''));
}

function decodeHtml(value) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function collectProductVariants(form) {
  const rows = Array.from(form.querySelectorAll('[data-admin-variant-row]'));
  if (rows.length) {
    return rows.map((row) => ({
      size: row.querySelector('[data-admin-variant-size]')?.value.trim() || '',
      sku: row.querySelector('[data-admin-variant-sku]')?.value.trim() || '',
      priceCents: adminPesoToCents(row.querySelector('[data-admin-variant-price]')?.value || 0),
      stockQuantity: Number(row.querySelector('[data-admin-variant-stock]')?.value || 0)
    })).filter((variant) => variant.size);
  }

  return String(new FormData(form).get('variants') || '').split('\n').map((line) => {
    const [size, sku, stockQuantity] = line.split('|').map((part) => part.trim());
    return { size, sku, stockQuantity: Number(stockQuantity || 0) };
  }).filter((variant) => variant.size);
}

function collectProductMetafields(form) {
  return Object.fromEntries(Array.from(form.querySelectorAll('[data-admin-product-metafield]')).map((input) => [
    input.dataset.adminProductMetafield,
    input.value.split(',').map((item) => item.trim()).filter(Boolean)
  ]));
}

function collectProductImages(form, fallbackAltText = 'Product image') {
  const imageInputs = Array.from(form.querySelectorAll('[data-admin-product-image-alt]'));
  if (imageInputs.length) {
    return imageInputs.map((input, index) => ({
      url: input.dataset.adminImageUrl,
      altText: input.value.trim() || fallbackAltText,
      sortOrder: index
    })).filter((image) => image.url);
  }

  return String(new FormData(form).get('images') || '').split('\n').map((url, index) => ({
    url: url.trim(),
    altText: fallbackAltText,
    sortOrder: index
  })).filter((image) => image.url);
}

function bindProductDescriptionEditor(root) {
  const editor = root.querySelector('[data-admin-description-editor]');
  const hidden = root.querySelector('textarea[name="description"]');
  if (!editor || !hidden) return;

  root.querySelectorAll('[data-admin-description-command]').forEach((button) => {
    button.addEventListener('click', () => applyDescriptionCommand(button, editor, hidden));
  });
  root.querySelector('[data-admin-block-format]')?.addEventListener('change', (event) => {
    editor.focus();
    document.execCommand('formatBlock', false, event.currentTarget.value);
    hidden.value = getProductDescriptionFromEditor(root);
  });
  editor.addEventListener('input', () => {
    hidden.value = getProductDescriptionFromEditor(root);
    updateSeoPreview(root);
  });
}

function applyDescriptionCommand(button, editor, hidden) {
  const command = button.dataset.adminDescriptionCommand;
  let value = button.dataset.adminFormatValue || null;

  if (command === 'createLink') {
    value = window.prompt('Enter link URL');
    if (!value) return;
  }
  if (command === 'foreColor') {
    value = window.prompt('Enter text color', '#111111');
    if (!value) return;
  }

  editor.focus();
  document.execCommand(command, false, value);
  hidden.value = getProductDescriptionFromEditor(editor.closest('form'));
}

function bindProductVariantEditor(root) {
  const form = root.querySelector('[data-admin-product-form]');
  if (!form) return;

  form.querySelector('[data-admin-add-variant]')?.addEventListener('click', () => addVariantRow(form));
  form.querySelectorAll('[data-admin-delete-variant]').forEach((button) => {
    button.addEventListener('click', () => {
      button.closest('[data-admin-variant-row]')?.remove();
      updateVariantInventoryTotal(form);
    });
  });
  form.querySelectorAll('[data-admin-variant-stock]').forEach((input) => {
    input.addEventListener('input', () => updateVariantInventoryTotal(form));
  });
}

function addVariantRow(form) {
  const tableBody = form.querySelector('.admin-variant-table tbody');
  if (!tableBody) return;

  const row = document.createElement('tr');
  row.innerHTML = renderVariantRow({
    size: `Variant ${tableBody.querySelectorAll('[data-admin-variant-row]').length + 1}`,
    sku: '',
    priceCents: adminPesoToCents(form.querySelector('[name="pricePeso"]')?.value || 649),
    stockQuantity: 0
  }, adminPesoToCents(form.querySelector('[name="pricePeso"]')?.value || 649)).replace(/^<tr data-admin-variant-row>|<\/tr>$/g, '');
  row.setAttribute('data-admin-variant-row', '');
  tableBody.appendChild(row);
  row.querySelector('[data-admin-delete-variant]')?.addEventListener('click', () => {
    row.remove();
    updateVariantInventoryTotal(form);
  });
  row.querySelector('[data-admin-variant-stock]')?.addEventListener('input', () => updateVariantInventoryTotal(form));
  row.querySelector('[data-admin-variant-size]')?.focus();
  updateVariantInventoryTotal(form);
}

function updateVariantInventoryTotal(form) {
  const total = Array.from(form.querySelectorAll('[data-admin-variant-stock]'))
    .reduce((sum, input) => sum + Number(input.value || 0), 0);
  const output = form.querySelector('[data-admin-total-inventory]');
  if (output) output.textContent = `Total inventory: ${total} available`;
}

function bindProductSeoPreview(root) {
  root.querySelectorAll('[name="name"], [name="seoTitle"], [name="seoHandle"], [name="seoDescription"], [name="pricePeso"]').forEach((input) => {
    input.addEventListener('input', () => updateSeoPreview(root));
  });
  updateSeoPreview(root);
}

function updateSeoPreview(root) {
  const preview = root.querySelector('[data-admin-seo-preview]');
  const form = root.querySelector('[data-admin-product-form]');
  if (!preview || !form) return;

  const formData = new FormData(form);
  const name = String(formData.get('name') || 'Product title').trim();
  const title = String(formData.get('seoTitle') || name).trim();
  const handle = String(formData.get('seoHandle') || formData.get('slug') || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim();
  const description = String(formData.get('seoDescription') || getProductDescriptionFromEditor(form) || 'Product meta description preview.').trim();
  preview.innerHTML = `<small>${escapeHtml(ADMIN_STORE_NAME)}</small>
    <span>/products/${escapeHtml(handle || 'new-product')}</span>
    <strong>${escapeHtml(title || 'Product title')}</strong>
    <p>${escapeHtml(description.replace(/<[^>]+>/g, ''))}</p>
    <b>${money(adminPesoToCents(formData.get('pricePeso')))}</b>`;
}

async function saveProduct(event, isNew, originalSlug) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector('[data-admin-product-status]');

  try {
    const product = productFromForm(form);
    const response = await adminFetch(isNew ? '/api/admin/products' : `/api/admin/products/${encodeURIComponent(originalSlug)}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(product)
    });
    selectedProductSlug = response.product.slug;
    if (status) status.textContent = 'Changes saved successfully.';
    showAdminToast('Changes saved successfully.');
    renderProductDetail(response.product);
    await loadProducts();
  } catch (error) {
    if (status) status.textContent = error.message;
    showAdminToast(error.message, 'error');
  }
}

async function uploadProductImages(event, slug) {
  const input = event.currentTarget;
  const files = Array.from(input.files || []);
  if (!files.length || !slug) return;

  const status = productDetailRoot.querySelector('[data-admin-product-status]');
  const formData = new FormData();
  files.forEach((file) => formData.append('images', file));

  try {
    const response = await fetch(`/api/admin/products/${encodeURIComponent(slug)}/images`, {
      method: 'POST',
      headers: adminHeaders(),
      body: formData
    });
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.error || 'Image upload failed');
    }

    if (status) status.textContent = 'Media uploaded successfully.';
    showAdminToast('Media uploaded successfully.');
    renderProductDetail(body.product);
    await loadProducts();
  } catch (error) {
    if (status) status.textContent = error.message;
    showAdminToast(error.message, 'error');
  } finally {
    input.value = '';
  }
}

async function saveProductImages(slug) {
  const form = productDetailRoot.querySelector('[data-admin-product-form]');
  const status = productDetailRoot.querySelector('[data-admin-product-status]');
  if (!form || !slug) return;

  try {
    const body = await adminFetch(`/api/admin/products/${encodeURIComponent(slug)}/images`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ images: collectProductImages(form) })
    });
    if (status) status.textContent = 'Media changes saved successfully.';
    showAdminToast('Media changes saved successfully.');
    renderProductDetail(body.product);
    await loadProducts();
  } catch (error) {
    if (status) status.textContent = error.message;
    showAdminToast(error.message, 'error');
  }
}

async function deleteProductImage(slug, imageIndex) {
  const status = productDetailRoot.querySelector('[data-admin-product-status]');
  if (!slug || !Number.isInteger(imageIndex)) return;

  try {
    const body = await adminFetch(`/api/admin/products/${encodeURIComponent(slug)}/images/${imageIndex}`, {
      method: 'DELETE'
    });
    if (status) status.textContent = 'Media removed successfully.';
    showAdminToast('Media removed successfully.');
    renderProductDetail(body.product);
    await loadProducts();
  } catch (error) {
    if (status) status.textContent = error.message;
    showAdminToast(error.message, 'error');
  }
}

async function deleteProduct(slug) {
  if (!slug || !window.confirm(`Delete ${slug}?`)) return;

  try {
    await adminFetch(`/api/admin/products/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    selectedProductSlug = '';
    productDetailRoot.innerHTML = '<article class="admin-card"><p class="loading-copy">Product deleted.</p></article>';
    showAdminToast('Product deleted successfully.');
    await loadProducts();
  } catch (error) {
    productDetailRoot.innerHTML = `<p class="form-status">${escapeHtml(error.message)}</p>`;
    showAdminToast(error.message, 'error');
  }
}

async function duplicateProduct(slug) {
  if (!slug) return;
  const copySlug = `${slug}-copy-${Date.now().toString().slice(-4)}`;

  try {
    const { product } = await adminFetch(`/api/admin/products/${encodeURIComponent(slug)}/duplicate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slug: copySlug,
        name: `${productDetailRoot.querySelector('[name="name"]')?.value || slug} Copy`
      })
    });
    selectedProductSlug = product.slug;
    renderProductDetail(product);
    showAdminToast('Product duplicated successfully.');
    await loadProducts();
  } catch (error) {
    const status = productDetailRoot.querySelector('[data-admin-product-status]');
    if (status) status.textContent = error.message;
    showAdminToast(error.message, 'error');
  }
}

async function runEditorMoreAction(event, product) {
  const action = event.currentTarget.value;
  event.currentTarget.value = '';
  if (!action || !product?.slug) return;

  if (action === 'preview') {
    window.open(`/product.html?slug=${encodeURIComponent(product.slug)}`, '_blank', 'noopener,noreferrer');
    return;
  }
  if (action === 'duplicate') {
    await duplicateProduct(product.slug);
    return;
  }
  if (action === 'archive') {
    const updated = productFromForm(productDetailRoot.querySelector('[data-admin-product-form]'));
    updated.status = 'archived';
    const { product: savedProduct } = await adminFetch(`/api/admin/products/${encodeURIComponent(product.slug)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updated)
    });
    renderProductDetail(savedProduct);
    showAdminToast('Product archived successfully.');
    await loadProducts();
    return;
  }
  if (action === 'delete') {
    await deleteProduct(product.slug);
  }
}

async function exportProducts() {
  const { products } = await adminFetch('/api/admin/products/export');
  const blob = new Blob([JSON.stringify({ products }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'maria-clara-products.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

async function exportOrders() {
  const { orders } = await adminFetch('/api/admin/orders');
  const blob = new Blob([JSON.stringify({ orders }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'maria-clara-orders.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadBlob(blob, fallbackFilename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fallbackFilename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function filenameFromContentDisposition(header, fallbackFilename) {
  const match = String(header || '').match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallbackFilename;
}

async function exportJntOrders() {
  try {
    const selected = Array.from(selectedOrderNumbers);
    const response = await fetch('/api/admin/orders/export/jnt', {
      method: 'POST',
      headers: {
        ...adminHeaders(),
        'content-type': 'application/json'
      },
      body: JSON.stringify({ orderNumbers: selected })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const orderErrors = Array.isArray(body.orders)
        ? body.orders.map((order) => `${order.orderNumber}: ${order.missing.join(', ')}`).join('\n')
        : '';
      window.alert([body.error || 'J&T export failed.', orderErrors].filter(Boolean).join('\n\n'));
      return;
    }

    const blob = await response.blob();
    const fallbackFilename = `JNT_Orders_${new Date().toISOString().slice(0, 10)}.xlsx`;
    downloadBlob(blob, filenameFromContentDisposition(response.headers.get('content-disposition'), fallbackFilename));
    selectedOrderNumbers = new Set();
    showAdminToast('J&T Excel export ready.');
    await loadOrders();
  } catch (error) {
    window.alert(error.message || 'J&T export failed.');
  }
}

async function importProducts(file) {
  if (!file) return;
  const text = await file.text();
  const payload = /\.csv$/i.test(file.name || '') ? { products: parseProductsCsv(text) } : JSON.parse(text);
  await adminFetch('/api/admin/products/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await loadProducts();
}

function parseProductsCsv(text) {
  const [headerLine, ...lines] = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = headerLine.split(',').map((header) => header.trim());
  return lines.map((line) => {
    const values = line.split(',').map((value) => value.trim());
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    const name = row.name || row.title || 'Imported product';
    const slug = row.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return {
      slug,
      name,
      description: row.description || name,
      collections: [row.category || row.collection || 'Imported'],
      status: row.status || 'draft',
      priceCents: Number(row.priceCents || row.price_cents || 100),
      compareAtPriceCents: row.compareAtPriceCents ? Number(row.compareAtPriceCents) : null,
      images: [{ url: row.image || '/product/3.png', altText: name, sortOrder: 0 }],
      variants: [{ size: row.size || 'Small', sku: row.sku || `${slug}-S`, stockQuantity: Number(row.stockQuantity || row.inventory || 0) }]
    };
  });
}

async function runProductMoreAction(action) {
  if (!action) return;
  if (!selectedProducts.size) {
    window.alert('Select products first.');
    return;
  }
  if (action === 'bulk_edit') {
    window.alert('Bulk edit is ready for the selected products.');
    return;
  }
  if (action === 'duplicate') {
    window.alert('Duplicate will be added in the next product workflow pass.');
    return;
  }
  if (!window.confirm(`${action} ${selectedProducts.size} selected products?`)) return;

  if (action === 'delete') {
    for (const slug of selectedProducts) {
      await adminFetch(`/api/admin/products/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    }
    selectedProducts = new Set();
    await loadProducts();
  }
  if (action === 'archive') {
    for (const slug of selectedProducts) {
      const { product } = await adminFetch(`/api/admin/products/${encodeURIComponent(slug)}`);
      await adminFetch(`/api/admin/products/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...product, status: 'archived' })
      });
    }
    selectedProducts = new Set();
    await loadProducts();
  }
}

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);

  try {
    await login(formData.get('password'));
    loginStatus.textContent = '';
    window.location.assign(dashboardDestination());
  } catch (error) {
    loginStatus.textContent = error.message;
  }
});

document.querySelector('[data-admin-logout]')?.addEventListener('click', () => {
  adminToken = '';
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  window.location.assign('/admin-login.html');
});

searchInput?.addEventListener('input', () => loadOrders());
globalSearchInput?.addEventListener('input', () => {
  if (searchInput) searchInput.value = globalSearchInput.value;
  loadOrders();
});
statusFilter?.addEventListener('change', () => loadOrders());
orderDateFilter?.addEventListener('change', () => loadOrders());
orderPaymentFilter?.addEventListener('change', () => loadOrders());
orderFulfillmentFilter?.addEventListener('change', () => loadOrders());
productSearchInput?.addEventListener('input', () => loadProducts());
productStatusFilter?.addEventListener('change', () => loadProducts());
productCategoryFilter?.addEventListener('change', () => loadProducts());
productStockFilter?.addEventListener('change', () => loadProducts());
productSortInput?.addEventListener('change', () => loadProducts());
dashboardDateRangeInput?.addEventListener('change', () => loadDashboardSummary());
collectionAddProductInput?.addEventListener('change', () => addProductToActiveCollection(collectionAddProductInput.value));
document.querySelector('[data-admin-create-product]')?.addEventListener('click', () => renderProductDetail(null));
document.querySelector('[data-admin-dashboard-refresh]')?.addEventListener('click', () => loadDashboardSummary());
document.querySelector('[data-admin-export-products]')?.addEventListener('click', () => exportProducts());
document.querySelector('[data-admin-export-jnt]')?.addEventListener('click', () => exportJntOrders());
document.querySelector('[data-admin-print-products]')?.addEventListener('click', () => window.print());
document.querySelector('[data-admin-product-table-settings]')?.addEventListener('click', () => window.alert('Table settings are available in this layout.'));
document.querySelector('[data-admin-product-more-actions]')?.addEventListener('change', async (event) => {
  await runProductMoreAction(event.currentTarget.value);
  event.currentTarget.value = '';
});
document.querySelector('[data-admin-import-products]')?.addEventListener('change', async (event) => {
  try {
    await importProducts(event.currentTarget.files?.[0]);
    event.currentTarget.value = '';
  } catch (error) {
    if (productsRoot) productsRoot.innerHTML = `<p class="form-status">${escapeHtml(error.message)}</p>`;
  }
});
document.querySelectorAll('[data-admin-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    activeOrderTab = button.dataset.adminTab || '';
    document.querySelectorAll('[data-admin-tab]').forEach((tab) => tab.classList.toggle('is-active', tab === button));
    loadOrders();
  });
});

document.querySelectorAll('[data-admin-nav-link]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    navigateAdminPage(link.dataset.adminNavLink || 'orders');
  });
});

bindAdminPageTransitions();

window.addEventListener('hashchange', () => {
  if (!isDashboardPage || !adminToken) return;
  renderAdminPage(adminPageFromHash());
});

function adminPageFromHash() {
  return String(window.location.hash || '').replace(/^#/, '') || 'orders';
}

function setAdminPageHash(page, options = {}) {
  const normalizedPage = document.querySelector(`[data-admin-page="${page}"]`) ? page : 'dashboard';
  const nextHash = `#${normalizedPage}`;
  if (window.location.hash === nextHash) return normalizedPage;

  const nextUrl = `${window.location.pathname}${nextHash}`;
  if (options.replace) {
    window.history.replaceState(null, '', nextUrl);
  } else {
    window.history.pushState(null, '', nextUrl);
  }
  return normalizedPage;
}

function navigateAdminPage(page) {
  const normalizedPage = setAdminPageHash(page);
  renderAdminPage(normalizedPage);
}

function renderAdminPage(page) {
  const normalizedPage = document.querySelector(`[data-admin-page="${page}"]`) ? page : 'dashboard';

  document.querySelectorAll('[data-admin-page]').forEach((section) => {
    section.hidden = section.dataset.adminPage !== normalizedPage;
  });
  animateAdminPageSection(normalizedPage);
  document.querySelectorAll('[data-admin-nav-link]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.adminNavLink === normalizedPage);
  });

  if (normalizedPage === 'dashboard') {
    loadDashboardSummary();
  }
  if (normalizedPage === 'orders') {
    if (!selectedOrderNumber) setOrderDetailMode(false);
    loadOrders();
  }
  if (normalizedPage !== 'orders') {
    selectedOrderNumber = '';
    setOrderDetailMode(false);
  }
  if (normalizedPage === 'products') {
    setProductEditingMode(false);
    loadProducts();
  }
  if (normalizedPage === 'collections') {
    loadCollectionsPage();
  }
}

function animateAdminPageSection(page) {
  const section = document.querySelector(`[data-admin-page="${page}"]`);
  if (!section || section.hidden) return;

  section.classList.remove('is-page-transitioning');
  void section.offsetWidth;
  section.classList.add('is-page-transitioning');
  window.setTimeout(() => section.classList.remove('is-page-transitioning'), 240);
}

function bindAdminPageTransitions() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || link.matches('[data-admin-nav-link]') || !shouldTransitionAdminLink(event, link)) return;

    event.preventDefault();
    document.body.classList.add('is-page-leaving');
    window.setTimeout(() => {
      window.location.href = link.href;
    }, 150);
  });
}

function shouldTransitionAdminLink(event, link) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.target && link.target !== '_self') return false;
  if (link.hasAttribute('download')) return false;

  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return false;
  if (url.href === window.location.href) return false;

  return true;
}

document.querySelectorAll('[data-admin-store-name]').forEach((node) => {
  node.textContent = ADMIN_STORE_NAME;
});

initializeAdminPage();

async function initializeAdminPage() {
  if (isLoginPage) {
    if (adminToken) {
      window.location.replace(dashboardDestination());
    }
    return;
  }

  if (!isDashboardPage) return;

  if (!adminToken) {
    redirectToLogin();
    return;
  }

  try {
    await adminFetch('/api/admin/session');
    showDashboard(true);
    const initialPage = adminPageFromHash();
    setAdminPageHash(initialPage, { replace: true });
    renderAdminPage(initialPage);
  } catch (error) {
    adminToken = '';
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    redirectToLogin();
  }
}
