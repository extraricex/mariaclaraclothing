import { createOrder, getProducts } from './api.js';
import { addToCart, clearCart, getCart, removeFromCart, updateCartCount, updateQuantity } from './cart.js';
import { trackStorefrontEvent } from './shell.js';

const JNT_ADDRESS_DATA_URL = '/data/jnt-address-guide.json';
const FALLBACK_PROVINCES = [
  { code: 'CAVITE', name: 'CAVITE', islandGroup: 'Luzon' }
];
const FALLBACK_CITIES = {
  CAVITE: [
    { code: 'CAVITE|IMUS', name: 'IMUS', provinceCode: 'CAVITE', areaCode: 'CAVITE' }
  ]
};
const FALLBACK_BARANGAYS = {
  'CAVITE|IMUS': [
    { code: 'CAVITE|IMUS|BUCANDALA IV', name: 'BUCANDALA IV', cityCode: 'CAVITE|IMUS', provinceCode: 'CAVITE', doorToDoor: 'YES' }
  ]
};

const addressState = {
  provinces: FALLBACK_PROVINCES,
  cities: [],
  barangays: [],
  selectedProvince: null,
  selectedCity: null
};

let jntAddressGuidePromise = null;
let checkoutAddressTracked = false;

function formatMoney(cents) {
  return `${new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    currencyDisplay: 'narrowSymbol'
  }).format(cents / 100)} PHP`;
}

function cartQuantity(items) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function normalizeJntAddressItems(payload) {
  const items = Array.isArray(payload) ? payload : payload?.data;
  return Array.isArray(items) ? items.map((item) => ({
    code: String(item.code || item.id || '').trim().toUpperCase(),
    name: String(item.name || '').trim().toUpperCase(),
    provinceCode: String(item.provinceCode || item.province_code || '').trim().toUpperCase(),
    regionCode: String(item.regionCode || item.region_code || '').trim().toUpperCase(),
    islandGroup: String(item.island_group || item.islandRegion || item.island_region || ''),
    areaCode: String(item.areaCode || item.area_code || item.provinceCode || item.province_code || '').trim().toUpperCase(),
    cityCode: String(item.cityCode || item.city_code || '').trim().toUpperCase(),
    doorToDoor: String(item.doorToDoor || item.door_to_door || item.canDeliverDoorToDoor || '').trim().toUpperCase()
  })).filter((item) => item.code && item.name) : [];
}

async function loadJntAddressGuide() {
  if (!jntAddressGuidePromise) {
    jntAddressGuidePromise = fetch(JNT_ADDRESS_DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Could not load J&T checkout address guide.');
        }
        return response.json();
      });
  }
  return jntAddressGuidePromise;
}

async function loadProvinces() {
  try {
    const guide = await loadJntAddressGuide();
    addressState.provinces = normalizeJntAddressItems(guide.provinces)
      .sort((a, b) => a.name.localeCompare(b.name));
    return;
  } catch (_error) {
    jntAddressGuidePromise = null;
    addressState.provinces = FALLBACK_PROVINCES;
  }
}

async function loadCitiesForProvince(provinceCode) {
  if (!provinceCode) return [];
  try {
    const guide = await loadJntAddressGuide();
    const cities = normalizeJntAddressItems(guide.cities?.[provinceCode] || []);
    return cities.length ? cities.sort((a, b) => a.name.localeCompare(b.name)) : FALLBACK_CITIES[provinceCode] || [];
  } catch (_error) {
    return FALLBACK_CITIES[provinceCode] || [];
  }
}

async function loadBarangaysForCity(cityCode) {
  if (!cityCode) return [];
  try {
    const guide = await loadJntAddressGuide();
    const barangays = normalizeJntAddressItems(guide.barangays?.[cityCode] || []);
    return barangays.length ? barangays.sort((a, b) => a.name.localeCompare(b.name)) : FALLBACK_BARANGAYS[cityCode] || [];
  } catch (_error) {
    return FALLBACK_BARANGAYS[cityCode] || [];
  }
}

function selectedShippingRegion() {
  const province = addressState.selectedProvince;
  const provinceName = String(province?.name || '').toUpperCase();
  if (!province) return 'luzon';
  if (provinceName === 'CAVITE' || provinceName.includes('METRO MANILA')) return 'metro_manila_cavite';
  if (
    province.islandGroup === 'Visayas' ||
    province.islandGroup === 'Mindanao'
  ) return 'visayas_mindanao';
  return 'luzon';
}

function shippingRegionLabel(region) {
  if (region === 'metro_manila_cavite') return 'Metro Manila & Cavite Region';
  if (region === 'visayas_mindanao') return 'Visayas and Mindanao Region';
  return 'Luzon Region';
}

function shippingFeeForRegion(region) {
  if (region === 'metro_manila_cavite') return 8000;
  if (region === 'visayas_mindanao') return 18000;
  return 12000;
}

function deliveryEstimateForRegion(region) {
  if (region === 'metro_manila_cavite') return 'Estimated delivery: Metro Manila and Cavite 2-4 days.';
  if (region === 'visayas_mindanao') return 'Estimated delivery: Visayas and Mindanao 5-8 days.';
  if (region === 'luzon') return 'Estimated delivery: Luzon provinces 3-6 days.';
  return 'Complete your address to see estimated delivery time.';
}

function checkoutTotals(items, shippingRegion = selectedShippingRegion()) {
  const subtotalCents = items.reduce((sum, item) => {
    return sum + Number(item.unitPriceCents || 0) * Number(item.quantity || 0);
  }, 0);
  const freeShippingUnlocked = cartQuantity(items) >= 2;
  const shippingFeeCents = items.length && !freeShippingUnlocked ? shippingFeeForRegion(shippingRegion) : 0;

  return {
    subtotalCents,
    shippingFeeCents,
    discountTotalCents: 0,
    totalCents: subtotalCents + shippingFeeCents,
    shippingRegion,
    shippingRegionLabel: shippingRegionLabel(shippingRegion),
    freeShippingUnlocked
  };
}

function updateCheckoutShippingFromProvince(provinceSelect) {
  addressState.selectedProvince = addressState.provinces.find((province) => province.code === provinceSelect.value) || null;
  return renderCheckoutSummary(getCart());
}

function checkoutAdminFields(items, totals) {
  return {
    checkoutChannel: 'storefront_checkout',
    paymentMethod: 'cash_on_delivery',
    shippingRegion: totals.shippingRegion,
    shippingRegionLabel: totals.shippingRegionLabel,
    freeShippingUnlocked: totals.freeShippingUnlocked,
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

function optionMarkup(items, placeholder) {
  return [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(items.map((item) => `<option value="${escapeAttribute(item.code)}">${escapeHtml(item.name)}</option>`))
    .join('');
}

function selectedOptionText(select) {
  return select?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function selectedBarangay() {
  const barangaySelect = document.querySelector('[data-barangay-select]');
  return addressState.barangays.find((barangay) => barangay.code === barangaySelect?.value) || null;
}

function isCheckoutAddressReady() {
  return Boolean(
    document.querySelector('[data-house-address]')?.value.trim() &&
    document.querySelector('[data-province-select]')?.value &&
    document.querySelector('[data-city-select]')?.value &&
    document.querySelector('[data-barangay-select]')?.value
  );
}

function renderCheckoutShippingFee(totals, addressReady = isCheckoutAddressReady()) {
  const shippingText = addressReady
    ? totals.shippingFeeCents ? formatMoney(totals.shippingFeeCents) : 'Free'
    : 'Calculated after address';

  document.querySelectorAll('[data-shipping], [data-shipping-method-price]').forEach((node) => {
    node.textContent = shippingText;
    node.toggleAttribute('data-shipping-pending', !addressReady);
  });
}

function renderCheckoutDeliveryEstimate(totals, addressReady = isCheckoutAddressReady()) {
  document.querySelectorAll('[data-delivery-estimate]').forEach((node) => {
    node.textContent = addressReady
      ? deliveryEstimateForRegion(totals.shippingRegion)
      : 'Complete your address to see estimated delivery time.';
  });
}

function renderDoorToDoorWarning() {
  const warning = document.querySelector('[data-door-to-door-warning]');
  if (!warning) return;

  const barangay = selectedBarangay();
  const canDeliverDoorToDoor = String(barangay?.doorToDoor || '').trim().toUpperCase();
  const shouldWarn = Boolean(barangay) && canDeliverDoorToDoor !== 'YES';
  warning.hidden = !shouldWarn;
  warning.textContent = shouldWarn
    ? 'J&T door-to-door delivery is not confirmed for this barangay. We will review before shipping.'
    : '';
}

function renderCheckoutSummary(items) {
  const itemsRoot = document.querySelector('[data-checkout-items]');
  const addressReady = isCheckoutAddressReady();
  const totals = checkoutTotals(items, addressReady ? selectedShippingRegion() : 'pending_address');

  if (!items.length) {
    if (itemsRoot) {
      itemsRoot.innerHTML = `<div class="checkout-empty-summary">
        <p>Your cart is empty.</p>
        <a class="button button-dark btn btn-dark" href="/#new-arrivals">Continue shopping</a>
      </div>`;
    }
  } else if (itemsRoot) {
    itemsRoot.innerHTML = items.map((item) => `<article class="checkout-summary-item">
        <div class="checkout-summary-media">
          <img src="${escapeAttribute(item.imageUrl || '')}" alt="${escapeAttribute(item.productName)}" loading="lazy">
          <span>${Number(item.quantity || 0)}</span>
        </div>
        <div>
          <h3>${escapeHtml(item.productName)}</h3>
          <p>${escapeHtml(item.size)}</p>
          <div class="checkout-summary-actions">
            <div class="quantity-control" aria-label="Quantity for ${escapeAttribute(item.productName)}">
              <button type="button" aria-label="Decrease quantity" data-checkout-quantity="${escapeAttribute(item.variantId)}" data-delta="-1">-</button>
              <span>${Number(item.quantity || 0)}</span>
              <button type="button" aria-label="Increase quantity" data-checkout-quantity="${escapeAttribute(item.variantId)}" data-delta="1">+</button>
            </div>
            <button type="button" class="text-button" data-checkout-remove="${escapeAttribute(item.variantId)}">Remove</button>
          </div>
        </div>
        <strong>${formatMoney(Number(item.unitPriceCents || 0) * Number(item.quantity || 0))}</strong>
      </article>`).join('');
  }

  document.querySelectorAll('[data-subtotal]').forEach((node) => {
    node.textContent = formatMoney(totals.subtotalCents);
  });
  renderCheckoutShippingFee(totals, addressReady);
  renderCheckoutDeliveryEstimate(totals, addressReady);
  renderDoorToDoorWarning();
  document.querySelectorAll('[data-total]').forEach((node) => {
    node.textContent = formatMoney(totals.totalCents);
  });
  document.querySelectorAll('[data-free-shipping-message], [data-related-products-message]').forEach((node) => {
    if (!items.length) {
      node.textContent = 'Add 2 items to get free shipping.';
    } else if (totals.freeShippingUnlocked) {
      node.textContent = 'Free shipping unlocked.';
    } else {
      node.textContent = 'Add 1 more item to unlock free shipping.';
    }
  });

  if (items.length && addressReady && !checkoutAddressTracked) {
    checkoutAddressTracked = true;
    trackStorefrontEvent('checkout_address_completed', {
      shippingRegion: totals.shippingRegion,
      shippingFeeCents: totals.shippingFeeCents
    });
  }

  return totals;
}

async function renderRelatedProducts(items) {
  const root = document.querySelector('[data-related-products]');
  if (!root) return;

  try {
    const { products } = await getProducts();
    const cartSlugs = new Set(items.map((item) => item.slug).filter(Boolean));
    const suggestedProducts = products
      .filter((product) => !cartSlugs.has(product.slug))
      .filter((product) => product.variants.some((variant) => Number(variant.stockQuantity) > 0))
      .slice(0, 4);

    if (!suggestedProducts.length) {
      root.innerHTML = '<p class="checkout-muted">More products are being prepared.</p>';
      return;
    }

    root.innerHTML = suggestedProducts.map((product) => {
      const image = product.images[0]?.url || '';
      const variant = firstAvailableVariant(product);
      const sizeOptions = product.variants
        .filter((candidate) => Number(candidate.stockQuantity) > 0)
        .map((candidate) => `<option value="${escapeAttribute(candidate.id)}" ${candidate.id === variant?.id ? 'selected' : ''}>${escapeHtml(candidate.size)}</option>`)
        .join('');
      return `<article class="checkout-related-card" data-upsell-product="${escapeAttribute(product.id)}">
        <img src="${escapeAttribute(image)}" alt="${escapeAttribute(product.images[0]?.altText || product.name)}" loading="lazy">
        <span>${escapeHtml(product.name)}</span>
        <strong>${formatMoney(product.priceCents)}</strong>
        <div class="checkout-upsell-controls">
          <label>
            <span>Size</span>
            <select data-upsell-size>${sizeOptions}</select>
          </label>
          <label>
            <span>Qty</span>
            <input type="number" min="1" value="1" inputmode="numeric" data-upsell-quantity>
          </label>
        </div>
        <div class="checkout-related-card-actions">
          <button class="button button-dark btn btn-dark" type="button" data-upsell-add="${escapeAttribute(product.id)}" ${variant ? '' : 'disabled'}>Add</button>
          <a class="button button-outline btn btn-outline-dark" href="/product.html?slug=${encodeURIComponent(product.slug)}">View</a>
        </div>
      </article>`;
    }).join('');

    root.querySelectorAll('[data-upsell-add]').forEach((button) => {
      const product = suggestedProducts.find((candidate) => candidate.id === button.dataset.upsellAdd);
      button.addEventListener('click', () => addCheckoutUpsellItem(product, button.closest('[data-upsell-product]')));
    });
  } catch (error) {
    root.innerHTML = `<p class="form-status">${escapeHtml(error.message)}</p>`;
  }
}

function validateCheckoutAddress(form) {
  const missing = [];
  const house = String(form.querySelector('[data-house-address]')?.value || '').trim();
  const barangay = selectedOptionText(form.querySelector('[data-barangay-select]'));
  const province = selectedOptionText(form.querySelector('[data-province-select]'));
  const city = selectedOptionText(form.querySelector('[data-city-select]'));

  if (!house) missing.push('House Number / Street / Building / Unit');
  if (!barangay) missing.push('Barangay');
  if (!province) missing.push('Province');
  if (!city) missing.push('City / Municipality');

  return {
    valid: missing.length === 0,
    message: missing.length ? `Complete your shipping address: ${missing.join(', ')}.` : '',
    address: { house, barangay, province, city }
  };
}

function formatCheckoutAddress(address) {
  return `${address.house}, ${address.barangay}, ${address.city}, ${address.province}, Philippines`;
}

function refreshCheckoutCartViews(items = getCart()) {
  renderCheckoutSummary(items);
  renderRelatedProducts(items);
  updateCartCount();
}

function setCheckoutStatus(status, message, tone = 'neutral') {
  if (!status) return;
  status.textContent = message;
  status.classList.remove('checkout-status--error', 'checkout-status--success');
  if (tone === 'error') {
    status.classList.add('checkout-status--error');
  }
  if (tone === 'success') {
    status.classList.add('checkout-status--success');
  }
}

function setCheckoutPending(form, pending) {
  const submitButton = form.querySelector('[data-checkout-submit]');
  if (!submitButton) return;

  if (!submitButton.dataset.defaultText) {
    submitButton.dataset.defaultText = submitButton.textContent.trim() || 'Place COD order';
  }

  submitButton.disabled = pending;
  submitButton.textContent = pending ? 'Placing order...' : submitButton.dataset.defaultText;
}

function focusFirstInvalidCheckoutField(form) {
  const invalidField = form.querySelector(':invalid, [aria-invalid="true"]');
  invalidField?.focus();
}

function renderCheckoutSuccess(order) {
  const success = document.querySelector('[data-checkout-success]');
  const title = document.querySelector('[data-checkout-success-title]');
  const body = document.querySelector('[data-checkout-success-body]');
  if (!success || !title || !body) return;

  title.textContent = `Order ${order.orderNumber} received.`;
  body.textContent = 'Thank you for your order! Your order is now complete and will be prepared for packing and shipping.';
  success.hidden = false;
  success.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function saveCheckoutConfirmation(order, payload, totals) {
  sessionStorage.setItem('maria-clara-last-order', JSON.stringify({
    orderNumber: order.orderNumber,
    trackingEventId: order.trackingEventId,
    customerName: payload.customer.fullName,
    paymentMethod: order.paymentMethod || 'cash_on_delivery',
    paymentStatus: order.paymentStatus || 'cod_pending',
    addressLine: payload.address.addressLine,
    shippingRegionLabel: order.shippingRegionLabel || totals.shippingRegionLabel,
    shippingFeeCents: Number(order.shippingFeeCents ?? totals.shippingFeeCents),
    totalCents: Number(order.totalCents),
    items: order.items || [],
    placedAt: order.placedAt || new Date().toISOString()
  }));
}

function firstAvailableVariant(product) {
  return product.variants.find((variant) => Number(variant.stockQuantity) > 0) || null;
}

function selectedUpsellVariant(card, product) {
  const selectedVariantId = card?.querySelector('[data-upsell-size]')?.value;
  return product.variants.find((variant) => variant.id === selectedVariantId) || firstAvailableVariant(product);
}

function checkoutUpsellQuantity(card) {
  return Math.max(1, Number(card?.querySelector('[data-upsell-quantity]')?.value || 1));
}

function addCheckoutUpsellItem(product, card) {
  if (!product) return;
  const variant = selectedUpsellVariant(card, product);
  if (!variant) return;

  addToCart({
    productId: product.id,
    slug: product.slug,
    variantId: variant.id,
    productName: product.name,
    size: variant.size,
    quantity: checkoutUpsellQuantity(card),
    unitPriceCents: product.priceCents,
    imageUrl: product.images[0]?.url || '',
    externalPosProductId: product.externalPosProductId || '',
    externalPosVariantId: variant.externalPosVariantId || ''
  });

  refreshCheckoutCartViews();
}

async function initializeAddressSelectors(form) {
  const provinceSelect = document.querySelector('[data-province-select]');
  const citySelect = document.querySelector('[data-city-select]');
  const barangaySelect = document.querySelector('[data-barangay-select]');
  if (!provinceSelect || !citySelect || !barangaySelect) return;

  await loadProvinces();
  provinceSelect.innerHTML = optionMarkup(addressState.provinces, 'Select province');

  provinceSelect.addEventListener('change', async () => {
    updateCheckoutShippingFromProvince(provinceSelect);
    addressState.selectedCity = null;
    addressState.cities = [];
    addressState.barangays = [];
    citySelect.disabled = true;
    citySelect.innerHTML = '<option value="">Loading cities and municipalities...</option>';
    barangaySelect.value = '';
    barangaySelect.disabled = true;
    barangaySelect.innerHTML = '<option value="">Select city / municipality first</option>';
    renderDoorToDoorWarning();

    addressState.cities = await loadCitiesForProvince(provinceSelect.value);
    citySelect.innerHTML = optionMarkup(addressState.cities, 'Select city / municipality');
    citySelect.disabled = !addressState.cities.length;
  });

  citySelect.addEventListener('change', async () => {
    addressState.selectedCity = addressState.cities.find((city) => city.code === citySelect.value) || null;
    addressState.barangays = [];
    barangaySelect.value = '';
    barangaySelect.disabled = true;
    barangaySelect.innerHTML = '<option value="">Loading barangays...</option>';

    addressState.barangays = await loadBarangaysForCity(citySelect.value);
    barangaySelect.innerHTML = optionMarkup(addressState.barangays, 'Select barangay');
    barangaySelect.disabled = !addressState.barangays.length;
    renderDoorToDoorWarning();
  });

  form.addEventListener('input', (event) => {
    if (event.target.matches('[data-house-address], [data-barangay-select], [data-city-select], [data-province-select]')) {
      event.target.setCustomValidity('');
      renderCheckoutSummary(getCart());
    }
  });

  form.addEventListener('change', (event) => {
    if (event.target.matches('[data-house-address], [data-barangay-select], [data-city-select], [data-province-select]')) {
      renderCheckoutSummary(getCart());
    }
  });
}

function handleCheckoutSummaryAction(event) {
  const quantityButton = event.target.closest('[data-checkout-quantity]');
  const removeButton = event.target.closest('[data-checkout-remove]');

  if (quantityButton) {
    const item = getCart().find((cartItem) => cartItem.variantId === quantityButton.dataset.checkoutQuantity);
    if (item) {
      updateQuantity(item.variantId, Number(item.quantity) + Number(quantityButton.dataset.delta));
      refreshCheckoutCartViews();
    }
  }

  if (removeButton) {
    removeFromCart(removeButton.dataset.checkoutRemove);
    refreshCheckoutCartViews();
  }
}

function renderCheckoutPage() {
  const form = document.querySelector('#checkout-form');
  const status = document.querySelector('[data-checkout-status]');
  const summaryToggle = document.querySelector('[data-summary-toggle]');
  const summaryPanel = document.querySelector('[data-summary-panel]');

  if (!form) {
    return;
  }

  initializeAddressSelectors(form);
  const items = getCart();
  renderCheckoutSummary(items);
  renderRelatedProducts(items);
  updateCartCount();
  window.trackMetaPixelInitiateCheckout?.(items, checkoutTotals(items, isCheckoutAddressReady() ? selectedShippingRegion() : 'pending_address'));

  summaryToggle?.addEventListener('click', () => {
    summaryPanel.hidden = !summaryPanel.hidden;
  });

  summaryPanel?.addEventListener('click', handleCheckoutSummaryAction);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const currentItems = getCart();
    if (!currentItems.length) {
      setCheckoutStatus(status, 'Your cart is empty. Add an item before placing an order.', 'error');
      renderCheckoutSummary(currentItems);
      renderRelatedProducts(currentItems);
      return;
    }

    const addressValidation = validateCheckoutAddress(form);
    if (!addressValidation.valid) {
      setCheckoutStatus(status, addressValidation.message, 'error');
      focusFirstInvalidCheckoutField(form);
      return;
    }

    setCheckoutStatus(status, 'Placing your order...', 'neutral');
    setCheckoutPending(form, true);
    const totals = checkoutTotals(currentItems, selectedShippingRegion());
    const formData = new FormData(form);
    const fullName = String(formData.get('fullName') || `${formData.get('firstName') || ''} ${formData.get('lastName') || ''}`).trim();
    const contact = String(formData.get('contact') || '').trim();
    const phone = String(formData.get('phone') || contact).trim();
    const email = contact.includes('@') ? contact : '';
    const notes = String(formData.get('orderNotes') || '').trim();
    const formattedAddress = formatCheckoutAddress(addressValidation.address);

    const payload = {
      customer: {
        fullName,
        phone,
        email
      },
      address: {
        addressLine: formattedAddress,
        houseAddress: addressValidation.address.house,
        barangay: addressValidation.address.barangay,
        city: addressValidation.address.city,
        province: addressValidation.address.province,
        country: 'Philippines',
        postalCode: ''
      },
      shippingRegion: totals.shippingRegion,
      shippingRegionLabel: totals.shippingRegionLabel,
      freeShippingUnlocked: totals.freeShippingUnlocked,
      shippingFeeCents: totals.shippingFeeCents,
      discountTotalCents: totals.discountTotalCents,
      notes,
      items: currentItems,
      ...checkoutAdminFields(currentItems, totals)
    };

    try {
      const result = await createOrder(payload);
      saveCheckoutConfirmation(result, payload, totals);
      trackStorefrontEvent('order_placed', {
        orderNumber: result.orderNumber,
        shippingRegion: totals.shippingRegion,
        totalCents: totals.totalCents
      });
      window.trackMetaPixelPurchase?.(result, result.items || currentItems);
      clearCart();
      form.reset();
      addressState.selectedProvince = null;
      addressState.selectedCity = null;
      renderCheckoutSummary([]);
      renderRelatedProducts([]);
      setCheckoutStatus(status, `Thank you for your order! Order ${result.orderNumber} is complete and will be prepared for packing and shipping.`, 'success');
      renderCheckoutSuccess(result);
      window.location.href = `/thank-you.html?order=${encodeURIComponent(result.orderNumber)}`;
    } catch (error) {
      setCheckoutStatus(status, error.message, 'error');
    } finally {
      setCheckoutPending(form, false);
    }
  });
}

renderCheckoutPage();
