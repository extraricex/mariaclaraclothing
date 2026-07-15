import { trackStorefrontEvent } from './shell.js';

const CART_KEY = 'maria-clara-cart';
const SHIPPING_FEE_CENTS = 0;

export function getCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

export function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartCount();
}

export function addToCart(item) {
  const cart = getCart();
  const existing = cart.find((cartItem) => cartItem.variantId === item.variantId);

  if (existing) {
    existing.quantity += item.quantity;
  } else {
    cart.push(item);
  }

  saveCart(cart);
}

export function updateQuantity(variantId, quantity) {
  const nextQuantity = Number(quantity);
  const cart = getCart()
    .map((item) => item.variantId === variantId ? { ...item, quantity: nextQuantity } : item)
    .filter((item) => item.quantity > 0);

  saveCart(cart);
}

export function removeFromCart(variantId) {
  saveCart(getCart().filter((item) => item.variantId !== variantId));
}

export function clearCart() {
  saveCart([]);
}

export function updateCartCount() {
  const count = getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  document.querySelectorAll('[data-cart-count]').forEach((node) => {
    node.textContent = count > 0 ? String(count) : '';
  });
}

function formatMoney(cents) {
  return `${new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    currencyDisplay: 'narrowSymbol'
  }).format(cents / 100)} PHP`;
}

function cartTotals(items) {
  const subtotalCents = items.reduce((sum, item) => {
    return sum + Number(item.unitPriceCents || 0) * Number(item.quantity || 0);
  }, 0);

  return {
    subtotalCents,
    shippingFeeCents: items.length ? SHIPPING_FEE_CENTS : 0,
    discountTotalCents: 0,
    totalCents: subtotalCents + (items.length ? SHIPPING_FEE_CENTS : 0)
  };
}

function cartAdminFields(items, totals) {
  return {
    checkoutChannel: 'storefront_cart',
    cartSnapshot: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      sku: item.sku || '',
      slug: item.slug || '',
      productName: item.productName,
      size: item.size,
      imageUrl: item.imageUrl || '',
      unitPriceCents: Number(item.unitPriceCents || 0),
      quantity: Number(item.quantity || 0)
    })),
    adminEditableTotals: {
      subtotalCents: totals.subtotalCents,
      discountTotalCents: totals.discountTotalCents,
      shippingFeeCents: totals.shippingFeeCents,
      totalCents: totals.totalCents
    }
  };
}

function renderCartItems(items, root) {
  root.innerHTML = items.map((item) => {
    const itemTotalCents = Number(item.unitPriceCents || 0) * Number(item.quantity || 0);
    const productHref = cartItemProductHref(item);

    return `<article class="cart-item">
      <a class="cart-item__media" href="${productHref}">
        <img class="cart-item-media" src="${escapeAttribute(item.imageUrl || '')}" alt="${escapeAttribute(item.productName)}" loading="lazy">
      </a>
      <div class="cart-item__details">
        <a class="cart-item__name" href="${productHref}">${escapeHtml(item.productName)}</a>
        <p class="cart-item__meta">${escapeHtml(item.size)}</p>
        <p class="cart-item__price">${formatMoney(Number(item.unitPriceCents || 0))}</p>
        <div class="cart-item__quantity-wrapper">
          <div class="quantity-control" aria-label="Quantity for ${escapeHtml(item.productName)}">
            <button type="button" aria-label="Decrease quantity" data-quantity="${escapeAttribute(item.variantId)}" data-delta="-1">-</button>
            <span>${Number(item.quantity || 0)}</span>
            <button type="button" aria-label="Increase quantity" data-quantity="${escapeAttribute(item.variantId)}" data-delta="1">+</button>
          </div>
          <button type="button" class="text-button" data-remove="${escapeAttribute(item.variantId)}">Remove</button>
        </div>
      </div>
      <p class="cart-item__total">${formatMoney(itemTotalCents)}</p>
    </article>`;
  }).join('');
}

function cartItemProductHref(item) {
  const slug = item.slug || String(item.productId || '').replace(/^catalog-/, '');
  return `/product.html?slug=${encodeURIComponent(slug)}`;
}

function renderTotals(items) {
  const totals = cartTotals(items);
  document.querySelectorAll('[data-subtotal]').forEach((node) => {
    node.textContent = formatMoney(totals.subtotalCents);
  });
  document.querySelectorAll('[data-shipping]').forEach((node) => {
    node.textContent = totals.shippingFeeCents ? formatMoney(totals.shippingFeeCents) : 'Free';
  });
  document.querySelectorAll('[data-total]').forEach((node) => {
    node.textContent = formatMoney(totals.totalCents);
  });
  document.querySelectorAll('[data-bundle-message]').forEach((node) => {
    const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    node.textContent = quantity >= 2 ? 'Free shipping unlocked' : 'Add 1 more item';
  });
  return totals;
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

function renderCheckoutPage() {
  const itemsRoot = document.querySelector('#cart-items');
  const emptyCart = document.querySelector('[data-empty-cart]');
  const filledCart = document.querySelector('[data-filled-cart]');
  const cartFooter = document.querySelector('[data-cart-footer]');
  const checkoutLink = document.querySelector('[data-checkout-link]');

  if (!itemsRoot || !emptyCart || !filledCart) {
    return;
  }

  const render = () => {
    const items = getCart();
    const totals = renderTotals(items);

    if (items.length) {
      renderCartItems(items, itemsRoot);
      emptyCart.hidden = true;
      filledCart.hidden = false;
      cartFooter.hidden = false;
      if (checkoutLink) {
        checkoutLink.setAttribute('aria-disabled', 'false');
      }
    } else {
      itemsRoot.innerHTML = '';
      emptyCart.hidden = false;
      filledCart.hidden = true;
      cartFooter.hidden = true;
      if (checkoutLink) {
        checkoutLink.setAttribute('aria-disabled', 'true');
      }
    }

    updateCartCount();
    return { items, totals };
  };

  itemsRoot.addEventListener('click', (event) => {
    const quantityButton = event.target.closest('[data-quantity]');
    const removeButton = event.target.closest('[data-remove]');

    if (quantityButton) {
      const item = getCart().find((cartItem) => cartItem.variantId === quantityButton.dataset.quantity);
      if (item) {
        updateQuantity(item.variantId, Number(item.quantity) + Number(quantityButton.dataset.delta));
        render();
      }
    }

    if (removeButton) {
      removeFromCart(removeButton.dataset.remove);
      render();
    }
  });

  checkoutLink?.addEventListener('click', (event) => {
    if (!getCart().length) {
      event.preventDefault();
      return;
    }
    trackStorefrontEvent('cart_checkout_click', {
      itemCount: getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    });
  });

  render();
}

updateCartCount();
renderCheckoutPage();
