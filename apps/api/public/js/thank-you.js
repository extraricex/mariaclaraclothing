import { getOrderConfirmation } from './api.js';
import { updateCartCount } from './cart.js';
import './shell.js';

function formatMoney(cents) {
  return `${new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    currencyDisplay: 'narrowSymbol'
  }).format(Number(cents || 0) / 100)} PHP`;
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

function readLastOrder() {
  try {
    return JSON.parse(sessionStorage.getItem('maria-clara-last-order') || 'null');
  } catch (_error) {
    return null;
  }
}

async function getOrderFromQuery() {
  const orderNumber = new URLSearchParams(location.search).get('order');
  if (!orderNumber) return null;

  try {
    const { order } = await getOrderConfirmation(orderNumber);
    return order;
  } catch (_error) {
    return null;
  }
}

async function renderThankYouPage() {
  const page = document.querySelector('[data-thank-you-page]');
  const confirmation = document.querySelector('[data-order-confirmation]');
  const empty = document.querySelector('[data-empty-confirmation]');
  const summaryPanel = document.querySelector('[data-order-summary-panel]');
  if (!page || !confirmation || !empty) return;

  const order = await getOrderFromQuery() || readLastOrder();
  if (!order?.orderNumber) {
    confirmation.hidden = true;
    empty.hidden = false;
    if (summaryPanel) summaryPanel.hidden = true;
    empty.querySelector('[data-empty-message]').textContent = 'No recent order found.';
    return;
  }

  confirmation.hidden = false;
  empty.hidden = true;
  if (summaryPanel) summaryPanel.hidden = false;
  document.querySelector('[data-order-number]').textContent = order.orderNumber;
  document.querySelector('[data-order-customer]').textContent = order.customerName || 'Customer';
  document.querySelector('[data-order-contact]').textContent = order.customerPhone || order.customerEmail || 'Contact details saved';
  document.querySelector('[data-order-payment]').textContent = order.paymentMethod || 'Cash on Delivery';
  document.querySelector('[data-order-address]').textContent = order.addressLine || 'Delivery address saved';
  document.querySelector('[data-order-region]').textContent = order.shippingRegionLabel || 'Shipping region confirmed';
  document.querySelector('[data-order-shipping]').textContent = formatMoney(order.shippingFeeCents);
  document.querySelector('[data-order-total]').textContent = formatMoney(order.totalCents);
  document.querySelector('[data-order-subtotal]').textContent = formatMoney(order.subtotalCents);
  document.querySelector('[data-order-shipping-summary]').textContent = formatMoney(order.shippingFeeCents);
  document.querySelector('[data-order-total-summary]').textContent = formatMoney(order.totalCents);
  renderThankYouItems(order.items || order.cartSnapshot || []);
}

function renderThankYouItems(items) {
  const root = document.querySelector('[data-thank-you-items]');
  if (!root) return;

  if (!items.length) {
    root.innerHTML = '<p class="checkout-empty-summary">Order items saved.</p>';
    return;
  }

  root.innerHTML = items.map((item) => {
    const quantity = Number(item.quantity || 1);
    const lineTotal = Number(item.unitPriceCents || 0) * quantity;
    return `<article class="checkout-summary-item">
      <div class="checkout-summary-media">
        <img src="${escapeAttribute(item.imageUrl || '')}" alt="${escapeAttribute(item.productName || 'Order item')}" loading="lazy">
        <span>${quantity}</span>
      </div>
      <div>
        <h3>${escapeHtml(item.productName || 'Maria Clara item')}</h3>
        <p>${escapeHtml(item.size || '')}</p>
      </div>
      <strong>${formatMoney(lineTotal)}</strong>
    </article>`;
  }).join('');
}

updateCartCount();
renderThankYouPage();
