const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('customer storefront pages are prepared for Meta Pixel without tracking admin pages', () => {
  const customerPages = [
    'index.html',
    'product.html',
    'cart.html',
    'checkout.html',
    'thank-you.html',
    'faq.html',
    'shipping-returns.html',
    'terms.html'
  ];

  for (const page of customerPages) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', page), 'utf8');
    assert.match(html, /\/js\/meta-pixel-config\.js/);
    assert.match(html, /\/js\/meta-pixel\.js/);
  }

  for (const page of ['admin.html', 'admin-login.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', page), 'utf8');
    assert.doesNotMatch(html, /meta-pixel/);
  }
});

test('legacy storefront exposes pre-purchase events but cannot emit Purchase', () => {
  const config = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'meta-pixel-config.js'), 'utf8');
  const pixel = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'meta-pixel.js'), 'utf8');
  const storefront = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'storefront.js'), 'utf8');
  const cart = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'cart.js'), 'utf8');
  const checkout = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'checkout.js'), 'utf8');
  const thankYou = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'thank-you.js'), 'utf8');

  assert.match(config, /MARIA_CLARA_META_PIXEL_ID/);
  assert.match(config, /''/);
  assert.match(pixel, /facebook\.com\/tr/);
  assert.match(pixel, /connect\.facebook\.net\/en_US\/fbevents\.js/);
  assert.match(pixel, /fbq\('init', pixelId\)/);
  assert.match(pixel, /fbq\('track', 'PageView'\)/);
  assert.match(pixel, /trackMetaPixelEvent/);
  assert.match(pixel, /trackMetaPixelEvent\('ViewContent'/);
  assert.match(pixel, /trackMetaPixelEvent\('AddToCart'/);
  assert.match(pixel, /trackMetaPixelEvent\('InitiateCheckout'/);
  assert.doesNotMatch(pixel, /trackMetaPixelEvent\('Purchase'/);
  assert.match(pixel, /if \(eventName === 'Purchase'\) return false/);

  assert.match(storefront, /trackMetaPixelViewContent\?\.\(product, selectedVariant\)/);
  assert.match(storefront, /trackMetaPixelAddToCart\?\.\(product, selectedVariant/);
  assert.doesNotMatch(cart, /trackMetaPixelInitiateCheckout/);
  assert.doesNotMatch(checkout, /trackMetaPixelInitiateCheckout\?\.\(items, checkoutTotals\(items/);
  assert.match(checkout, /const totals = checkoutTotals\(currentItems, selectedShippingRegion\(\)\);\s*window\.trackMetaPixelInitiateCheckout\?\.\(currentItems, totals\)/);
  assert.doesNotMatch(checkout, /trackMetaPixelPurchase/);
  assert.doesNotMatch(thankYou, /trackMetaPixelPurchase/);
  assert.match(checkout, /totalCents: Number\(order\.totalCents\)/);
});

test('product and cart scripts preserve product imagery through checkout', () => {
  const api = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'api.js'), 'utf8');
  const storefront = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'storefront.js'), 'utf8');
  const cart = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'cart.js'), 'utf8');

  assert.match(api, /fetch\('\/api\/products',\s*\{\s*cache:\s*'no-store'\s*\}\)/s);
  assert.match(api, /fetch\(`\/api\/products\/\$\{encodeURIComponent\(slug\)\}`,\s*\{\s*cache:\s*'no-store'\s*\}\)/s);
  assert.match(storefront, /imageUrl: product\.images\[0\]\?\.url/);
  assert.match(storefront, /product-gallery-main/);
  assert.match(cart, /class="cart-item-media"/);
  assert.match(cart, /item\.imageUrl/);
});

test('add to cart starts with an available size and keeps cart product links slug based', () => {
  const storefront = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'storefront.js'), 'utf8');
  const cart = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'cart.js'), 'utf8');

  assert.match(storefront, /let selectedVariant = firstAvailableVariant\(product\)/);
  assert.match(storefront, /function firstAvailableVariant\(product\)/);
  assert.match(storefront, /stockQuantity\) > 0/);
  assert.match(storefront, /slug: product\.slug/);
  assert.match(cart, /const productHref = cartItemProductHref\(item\)/);
  assert.match(cart, /function cartItemProductHref\(item\)/);
  assert.match(cart, /\/product\.html\?slug=/);
  assert.doesNotMatch(cart, /\/product\.html\?product=/);
});

test('cart page matches the Shopify-style cart shell and empty state', () => {
  const cartHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'cart.html'), 'utf8');
  const cartJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'cart.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(cartHtml, /<title>Your Shopping Cart \| Maria Clara<\/title>/);
  assert.match(cartHtml, /class="[^"]*\bcart-page\b/);
  assert.match(cartHtml, /<main class="[^"]*\bshopify-cart-page\b[^"]*\bcontainer-fluid\b[^"]*" data-cart-page>/);
  assert.match(cartHtml, /<h1 class="title title--primary">Your cart<\/h1>/);
  assert.match(cartHtml, /class="underlined-link" href="\/collections\/all">Continue shopping<\/a>/);
  assert.match(cartHtml, /class="cart__warnings" data-empty-cart/);
  assert.doesNotMatch(cartHtml, /class="[^"]*\bcart__warnings\b[^"]*\bcard\b/);
  assert.match(cartHtml, /Your cart is empty/);
  assert.match(cartHtml, /href="\/collections\/all">Continue shopping<\/a>/);
  assert.match(cartHtml, /Have an account\?/);
  assert.match(cartHtml, /Log in<\/a> to check out faster\./);
  assert.match(cartHtml, /class="cart__footer"/);
  assert.match(cartHtml, /href="\/checkout\.html"[^>]*data-checkout-link/);
  assert.match(cartHtml, /class="cart-items-panel" data-filled-cart hidden/);
  assert.doesNotMatch(cartHtml, /class="[^"]*\bcart-items-panel\b[^"]*\bcard\b/);
  assert.match(cartHtml, /class="[^"]*\bbutton\b[^"]*\bbutton-dark\b[^"]*\bbtn\b[^"]*\bbtn-dark\b/);
  assert.doesNotMatch(cartHtml, /checkout-grid/);
  assert.doesNotMatch(cartHtml, /Order Summary/);
  assert.doesNotMatch(cartHtml, /mailto:support@mariaclaraclothing\.com/);

  assert.match(cartJs, /data-empty-cart/);
  assert.match(cartJs, /data-filled-cart/);
  assert.match(cartJs, /data-cart-footer/);
  assert.match(cartJs, /cartFooter\.hidden = false/);
  assert.match(cartJs, /cartFooter\.hidden = true/);
  assert.match(cartJs, /data-checkout-link/);
  assert.match(cartJs, /checkoutLink\.setAttribute\('aria-disabled', 'false'\)/);
  assert.match(cartJs, /checkoutLink\.setAttribute\('aria-disabled', 'true'\)/);
  assert.match(cartJs, /checkoutLink\?\.[\s\S]*render\(\);\s*\n}/);
  assert.match(cartJs, /class="cart-item__details"/);
  assert.match(cartJs, /class="cart-item__quantity-wrapper"/);
  assert.match(cartJs, /cartAdminFields/);

  assert.match(styles, /\.shopify-cart-page\s*{/);
  assert.match(styles, /\.cart__warnings\s*{/);
  assert.doesNotMatch(styles, /\.cart__warnings\.card/);
  assert.doesNotMatch(styles, /\.cart-items-panel\.card/);
  assert.match(styles, /\.cart__footer\[hidden\]\s*{[^}]*display:\s*none/s);
  assert.match(styles, /\.cart-items-table\s*{/);
  assert.match(styles, /\.cart__footer\s*{/);
  assert.match(styles, /@media \(max-width:\s*749px\)\s*{[\s\S]*\.cart-item\s*{[^}]*grid-template-columns:\s*96px minmax\(0,\s*1fr\)/s);
});

test('checkout page recreates Shopify-style checkout and admin-ready order payload', () => {
  const checkoutHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'checkout.html'), 'utf8');
  const checkoutJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'checkout.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(checkoutHtml, /<title>Checkout \| Maria Clara<\/title>/);
  assert.match(checkoutHtml, /class="[^"]*\bcheckout-page\b/);
  assert.match(checkoutHtml, /class="[^"]*\bshopify-checkout-shell\b[^"]*\bcontainer-fluid\b/);
  assert.doesNotMatch(checkoutHtml, /class="[^"]*\bcheckout-layout-row\b/);
  assert.match(checkoutHtml, /class="checkout-main"/);
  assert.match(checkoutHtml, /class="checkout-summary" aria-label="Order summary"/);
  assert.match(checkoutHtml, /class="checkout-brand-header"/);
  assert.match(checkoutHtml, /class="checkout-logo"/);
  assert.match(checkoutHtml, /class="checkout-breadcrumbs"/);
  assert.match(checkoutHtml, /Cart[\s\S]*Information[\s\S]*Shipping[\s\S]*Payment/);
  assert.match(checkoutHtml, /class="checkout-card"/);
  assert.doesNotMatch(checkoutHtml, /class="[^"]*\bcheckout-card\b[^"]*\bcard\b/);
  assert.doesNotMatch(checkoutHtml, /class="shopify-header"/);
  assert.match(checkoutHtml, /Contact/);
  assert.match(checkoutHtml, /Delivery/);
  assert.match(checkoutHtml, /Shipping method/);
  assert.match(checkoutHtml, /Full Name/);
  assert.match(checkoutHtml, /House Number \/ Street \/ Building \/ Unit/);
  assert.match(checkoutHtml, /Barangay/);
  assert.match(checkoutHtml, /Province/);
  assert.match(checkoutHtml, /Province \/ Area/);
  assert.match(checkoutHtml, /City \/ Municipality/);
  assert.match(checkoutHtml, /data-house-address/);
  assert.match(checkoutHtml, /data-barangay-select/);
  assert.match(checkoutHtml, /<select name="barangay"[^>]*data-barangay-select/);
  assert.match(checkoutHtml, /data-province-select/);
  assert.match(checkoutHtml, /data-city-select/);
  assert.match(checkoutHtml, /data-door-to-door-warning/);
  assert.match(checkoutHtml, /Order Notes optional/);
  assert.doesNotMatch(checkoutHtml, /data-barangay-input/);
  assert.doesNotMatch(checkoutHtml, /data-barangay-list/);
  assert.match(checkoutHtml, /data-shipping-method-price/);
  assert.match(checkoutHtml, /data-shipping-pending/);
  assert.match(checkoutHtml, /Calculated after address/);
  assert.doesNotMatch(checkoutHtml, /name="shippingRegion"/);
  assert.match(checkoutHtml, /data-free-shipping-message/);
  assert.match(checkoutHtml, /data-related-products/);
  assert.match(checkoutHtml, /Payment/);
  assert.match(checkoutHtml, /Cash on Delivery/);
  assert.match(checkoutHtml, /Billing address/);
  assert.doesNotMatch(checkoutHtml, /Discount code/);
  assert.match(checkoutHtml, /Return to cart/);
  assert.match(checkoutHtml, /Place COD order/);
  assert.match(checkoutHtml, /class="[^"]*\bbutton\b[^"]*\bbutton-dark\b[^"]*\bbtn\b[^"]*\bbtn-dark\b[^"]*\bcheckout-pay-button\b/);
  assert.match(checkoutHtml, /data-checkout-success/);
  assert.match(checkoutHtml, /data-checkout-success-title/);
  assert.match(checkoutHtml, /data-checkout-success-body/);
  assert.match(checkoutHtml, /data-checkout-submit/);
  assert.match(checkoutHtml, /Pay when your order arrives/);
  assert.match(checkoutHtml, /Add another item without leaving checkout/);

  assert.match(checkoutJs, /checkoutChannel:\s*'storefront_checkout'/);
  assert.match(checkoutJs, /JNT_ADDRESS_DATA_URL/);
  assert.match(checkoutJs, /\/data\/jnt-address-guide\.json/);
  assert.match(checkoutJs, /loadJntAddressGuide/);
  assert.match(checkoutJs, /normalizeJntAddressItems/);
  assert.match(checkoutJs, /guide\.cities\?\.\[provinceCode\]/);
  assert.match(checkoutJs, /guide\.barangays\?\.\[cityCode\]/);
  assert.match(checkoutJs, /data-barangay-select/);
  assert.match(checkoutJs, /initializeAddressSelectors/);
  assert.match(checkoutJs, /validateCheckoutAddress/);
  assert.match(checkoutJs, /formatCheckoutAddress/);
  assert.match(checkoutJs, /cartQuantity\(items\) >= 2/);
  assert.match(checkoutJs, /document\.querySelector\('\[data-province-select\]'\)/);
  assert.match(checkoutJs, /renderDoorToDoorWarning/);
  assert.match(checkoutJs, /doorToDoor/);
  assert.match(checkoutJs, /data-shipping-method-price/);
  assert.match(checkoutJs, /data-checkout-quantity/);
  assert.match(checkoutJs, /data-checkout-remove/);
  assert.match(checkoutJs, /handleCheckoutSummaryAction/);
  assert.doesNotMatch(checkoutJs, /input\[name="shippingRegion"\]/);
  assert.match(checkoutJs, /shippingRegion/);
  assert.match(checkoutJs, /freeShippingUnlocked/);
  assert.match(checkoutJs, /function updateCheckoutShippingFromProvince/);
  assert.match(checkoutJs, /updateCheckoutShippingFromProvince\(provinceSelect\)/);
  assert.match(checkoutJs, /function isCheckoutAddressReady/);
  assert.match(checkoutJs, /function renderCheckoutShippingFee/);
  assert.match(checkoutJs, /data-shipping-pending/);
  assert.match(checkoutJs, /Calculated after address/);
  assert.match(checkoutJs, /provinceName === 'CAVITE'/);
  assert.match(checkoutJs, /province\.islandGroup === 'Visayas'/);
  assert.match(checkoutJs, /province\.islandGroup === 'Mindanao'/);
  assert.match(checkoutJs, /shippingFeeForRegion\(region\)/);
  assert.match(checkoutJs, /renderRelatedProducts/);
  assert.match(checkoutJs, /paymentMethod:\s*'cash_on_delivery'/);
  assert.match(checkoutJs, /orderNotes/);
  assert.match(checkoutJs, /cartSnapshot/);
  assert.match(checkoutJs, /adminEditableTotals/);
  assert.match(checkoutJs, /renderCheckoutSummary/);
  assert.match(checkoutJs, /createOrder\(payload\)/);
  assert.match(checkoutJs, /saveCheckoutConfirmation/);
  assert.match(checkoutJs, /sessionStorage\.setItem\('maria-clara-last-order'/);
  assert.match(checkoutJs, /window\.location\.href = `\/thank-you\.html\?order=\$\{encodeURIComponent\(result\.orderNumber\)\}`/);
  assert.match(checkoutJs, /setCheckoutStatus/);
  assert.match(checkoutJs, /setCheckoutPending/);
  assert.match(checkoutJs, /renderCheckoutSuccess/);
  assert.match(checkoutJs, /focusFirstInvalidCheckoutField/);
  assert.match(checkoutJs, /dataset\.defaultText/);
  assert.match(checkoutJs, /addCheckoutUpsellItem/);
  assert.match(checkoutJs, /firstAvailableVariant/);
  assert.match(checkoutJs, /data-upsell-add/);
  assert.match(checkoutJs, /data-upsell-product/);
  assert.match(checkoutJs, /data-upsell-size/);
  assert.match(checkoutJs, /data-upsell-quantity/);
  assert.match(checkoutJs, /class="button button-dark btn btn-dark"/);
  assert.match(checkoutJs, /class="button button-outline btn btn-outline-dark"/);
  assert.match(checkoutJs, /selectedUpsellVariant/);
  assert.match(checkoutJs, /checkoutUpsellQuantity/);

  assert.match(styles, /\.shopify-checkout-shell\s*{/);
  assert.match(styles, /\.checkout-main\s*{/);
  assert.match(styles, /\.checkout-summary\s*{/);
  assert.match(styles, /\.checkout-summary-toggle\s*{/);
  assert.match(styles, /\.checkout-free-shipping-message\s*{/);
  assert.match(styles, /\.checkout-door-warning\s*{/);
  assert.match(styles, /\.checkout-related-products\s*{/);
  assert.match(styles, /\.checkout-related-card\s*{/);
  assert.match(styles, /\.checkout-success\s*{/);
  assert.match(styles, /\.checkout-success\[hidden\]\s*{/);
  assert.match(styles, /\.checkout-status--error\s*{/);
  assert.match(styles, /\.checkout-status--success\s*{/);
  assert.match(styles, /\.checkout-pay-button:disabled\s*{/);
  assert.match(styles, /\.checkout-related-card-actions\s*{/);
  assert.match(styles, /\.checkout-summary-actions\s*{/);
  assert.match(styles, /\.checkout-upsell-controls\s*{/);
  assert.match(styles, /\.shopify-prototype \.btn\s*{/);
  assert.match(styles, /\.checkout-brand-header\s*{/);
  assert.match(styles, /\.checkout-logo\s*{/);
  assert.match(styles, /\.checkout-breadcrumbs\s*{/);
  assert.match(styles, /\.checkout-card\s*{/);
  assert.doesNotMatch(styles, /\.checkout-card\.card\s*{/);
  assert.match(styles, /\.cart-items-panel\s*{/);
  assert.doesNotMatch(styles, /\.cart-items-panel\.card\s*{/);
  assert.match(styles, /@media \(min-width:\s*990px\)\s*{[\s\S]*\.shopify-checkout-shell\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(360px,\s*520px\)/s);
  assert.match(styles, /@media \(max-width:\s*749px\)\s*{[\s\S]*\.checkout-summary-item\s*{[^}]*grid-template-columns:\s*56px minmax\(0,\s*1fr\)/s);
  assert.match(styles, /@media \(max-width:\s*420px\)\s*{[\s\S]*\.checkout-upsell-controls\s*{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styles, /@media \(min-width:\s*750px\) and \(max-width:\s*989px\)\s*{[\s\S]*\.shopify-checkout-shell\s*{[^}]*grid-template-columns:\s*1fr/s);
});

test('thank you page confirms the last COD order', () => {
  const thankYouHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'thank-you.html'), 'utf8');
  const thankYouJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'thank-you.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(thankYouHtml, /<title>Thank You \| Maria Clara<\/title>/);
  assert.match(thankYouHtml, /class="[^"]*\bthank-you-page\b/);
  assert.match(thankYouHtml, /class="[^"]*\bthank-you-shell\b[^"]*\bcontainer-fluid\b[^"]*" data-thank-you-page/);
  assert.match(thankYouHtml, /class="[^"]*\bthank-you-main\b/);
  assert.match(thankYouHtml, /class="[^"]*\bthank-you-brand-header\b/);
  assert.match(thankYouHtml, /class="[^"]*\bthank-you-confirmation-icon\b/);
  assert.match(thankYouHtml, /class="[^"]*\bthank-you-summary-panel\b/);
  assert.doesNotMatch(thankYouHtml, /class="shopify-header"/);
  assert.doesNotMatch(thankYouHtml, /data-menu-drawer/);
  assert.match(thankYouHtml, /class="[^"]*\bbutton\b[^"]*\bbutton-dark\b[^"]*\bbtn\b[^"]*\bbtn-dark\b/);
  assert.match(thankYouHtml, /class="[^"]*\bbutton\b[^"]*\bbutton-outline\b[^"]*\bbtn\b[^"]*\bbtn-outline-dark\b/);
  assert.match(thankYouHtml, /data-thank-you-page/);
  assert.match(thankYouHtml, /data-order-number/);
  assert.match(thankYouHtml, /data-order-customer/);
  assert.match(thankYouHtml, /data-order-total/);
  assert.match(thankYouHtml, /data-thank-you-items/);
  assert.match(thankYouHtml, /Contact information/);
  assert.match(thankYouHtml, /Shipping address/);
  assert.match(thankYouHtml, /Shipping method/);
  assert.match(thankYouHtml, /Payment method/);
  assert.match(thankYouHtml, /Billing address/);
  assert.match(thankYouHtml, /What happens next/);
  assert.match(thankYouHtml, /We confirm by text/);
  assert.match(thankYouHtml, /data-thank-you-support/);
  assert.match(thankYouHtml, /Cash on Delivery/);
  assert.match(thankYouHtml, /Continue shopping/);
  assert.match(thankYouHtml, /data-empty-confirmation/);
  assert.match(thankYouHtml, /\/js\/thank-you\.js/);

  assert.match(thankYouJs, /sessionStorage\.getItem\('maria-clara-last-order'\)/);
  assert.match(thankYouJs, /getOrderConfirmation/);
  assert.match(thankYouJs, /new URLSearchParams\(location\.search\)\.get\('order'\)/);
  assert.match(thankYouJs, /data-order-number/);
  assert.match(thankYouJs, /data-thank-you-items/);
  assert.match(thankYouJs, /renderThankYouItems/);
  assert.match(thankYouJs, /No recent order found/);
  assert.match(thankYouJs, /updateCartCount/);

  assert.match(styles, /\.thank-you-shell\s*{/);
  assert.match(styles, /\.thank-you-main\s*{/);
  assert.match(styles, /\.thank-you-summary-panel\s*{/);
  assert.match(styles, /\.thank-you-confirmation-icon\s*{/);
  assert.match(styles, /\.thank-you-summary\s*{/);
  assert.match(styles, /@media \(max-width:\s*749px\)\s*{[\s\S]*\.thank-you-summary div\s*{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styles, /@media \(min-width:\s*990px\)\s*{[\s\S]*\.thank-you-shell\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(360px,\s*520px\)/s);
});

test('J&T checkout address data covers template provinces cities and barangays', () => {
  const addressData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'jnt-address-guide.json'), 'utf8'));
  const provinceNames = new Set(addressData.provinces.map((province) => province.name));
  const allCities = Object.values(addressData.cities).flat();
  const cityNames = new Set(allCities.map((city) => city.name));
  const imus = allCities.find((city) => city.name === 'IMUS');
  const cebu = allCities.find((city) => city.name === 'CEBU-CITY');
  const davao = allCities.find((city) => city.name === 'DAVAO-CITY');

  assert.equal(addressData.metadata.source, 'data/jnt/jntexportfile.xlsx');
  assert.equal(addressData.metadata.sheet, 'Addressing guide');
  assert.equal(addressData.metadata.provinceCount, 82);
  assert.ok(addressData.metadata.cityMunicipalityCount >= 1600);
  assert.ok(addressData.metadata.barangayCount >= 42000);
  assert.ok(provinceNames.has('BATANES'));
  assert.ok(provinceNames.has('CAVITE'));
  assert.ok(provinceNames.has('CEBU'));
  assert.ok(provinceNames.has('DAVAO-DEL-SUR'));
  assert.ok(provinceNames.has('TAWI-TAWI'));
  assert.ok(cityNames.has('IMUS'));
  assert.ok(cityNames.has('CEBU-CITY'));
  assert.ok(cityNames.has('DAVAO-CITY'));
  assert.ok(cityNames.has('BASCO'));
  assert.ok(addressData.cities.CAVITE.some((city) => city.name === 'IMUS'));
  assert.ok(addressData.barangays[imus.code].some((barangay) => barangay.name === 'BUCANDALA IV'));
  assert.ok(addressData.barangays[cebu.code].some((barangay) => barangay.name === 'LAHUG (POB.)'));
  assert.ok(addressData.barangays[davao.code].some((barangay) => barangay.name === 'BAGUIO (POB.)'));
});

test('product page renderer matches Shopify-style product detail structure', () => {
  const productHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'product.html'), 'utf8');
  const storefront = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'storefront.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(productHtml, /<main id="product-detail" class="[^"]*\bproduct-shell\b[^"]*\bcontainer-fluid\b/);
  assert.match(productHtml, /BUY 2 ITEMS TO GET FREE SHIPPING FEE/);
  assert.doesNotMatch(productHtml, /shopify-section size-guide compact-guide/);
  assert.doesNotMatch(productHtml, /<th>Chest Width<\/th>/);
  assert.match(productHtml, /<span>Payment methods<\/span>/);
  assert.match(storefront, /class="[^"]*\bshopify-product-detail\b/);
  assert.match(storefront, /product--large product--left product--stacked product--mobile-hide/);
  assert.match(storefront, /class="grid__item product__media-wrapper product-gallery"/);
  assert.match(storefront, /class="product__info-wrapper grid__item product-info-panel product-panel"/);
  assert.match(storefront, /<media-gallery class="product-media-gallery" data-desktop-layout="stacked">/);
  assert.match(storefront, /class="product__media-list contains-media grid grid--peek list-unstyled slider slider--mobile product-media-list"/);
  assert.match(storefront, /const gallery = product\.images;/);
  assert.doesNotMatch(storefront, /Math\.min\(5, galleryLimit\)/);
  assert.match(storefront, /data-product-gallery/);
  assert.match(storefront, /data-gallery-track/);
  assert.match(storefront, /data-gallery-prev/);
  assert.match(storefront, /data-gallery-next/);
  assert.match(storefront, /data-gallery-thumb/);
  assert.match(storefront, /data-gallery-image/);
  assert.match(storefront, /data-product-lightbox/);
  assert.match(storefront, /initializeProductGallery\(root\)/);
  assert.match(storefront, /initializeProductLightbox\(root\)/);
  assert.match(storefront, /class="product-media-counter slider-counter"/);
  assert.match(storefront, /class="sale-badge"/);
  assert.match(storefront, /LOW_STOCK_THRESHOLD = 12/);
  assert.match(storefront, /Limited pieces in \$\{escapeHtml\(selectedVariant\.size\)\}/);
  assert.match(storefront, /data-limited-stock-label/);
  assert.match(storefront, /isLimitedStock\(selectedVariant\)/);
  assert.match(storefront, /updateLimitedStockLabel\(root, selectedVariant\)/);
  assert.doesNotMatch(storefront, /data-size-guide-link/);
  assert.match(storefront, /data-variant-select/);
  assert.match(storefront, /handleVariantSelect/);
  assert.match(storefront, /<select class="select__select product-size-select" name="options\[Size\]" data-variant-select/);
  assert.match(storefront, /\$\{variant\.size\}\$\{disabled \? ' - Unavailable' : ''\}/);
  assert.doesNotMatch(storefront, /class="size-button/);
  assert.match(storefront, /240 GSM cotton/);
  assert.match(storefront, /Hand wash only for longevity/);
  assert.match(storefront, /Enjoy FREE SHIPPING NATIONWIDE/);
  assert.match(storefront, /Check the OVERSIZE CHART/);
  assert.match(storefront, /trackStorefrontEvent\('product_view'/);
  assert.match(storefront, /trackStorefrontEvent\('size_selected'/);
  assert.match(storefront, /trackStorefrontEvent\('add_to_cart'/);
  assert.match(storefront, /class="product-form__quantity"/);
  assert.match(storefront, /data-quantity-increase/);
  assert.match(storefront, /'Add to Cart'/);
  assert.match(storefront, /class="button button-primary btn btn-dark add-to-cart-button"/);
  assert.match(storefront, /class="button button-outline btn btn-outline-dark quick-checkout-button"/);
  assert.match(storefront, /data-buy-now/);
  assert.match(storefront, /Check out/);
  assert.match(storefront, /window\.location\.href = '\/checkout\.html'/);
  assert.match(storefront, /Couldn&#039;t load pickup availability/);
  assert.match(storefront, /renderProductDescription\(product\)/);
  assert.match(storefront, /renderProductUpsell\(product, relatedProducts\)/);
  assert.match(storefront, /renderProductFeaturedImage\(product\)/);
  assert.match(storefront, /product\.productPage\?\.heading/);
  assert.match(storefront, /product\.productPage\?\.sections/);
  assert.match(storefront, /section\.items/);
  assert.doesNotMatch(storefront, /OVERSIZED FIT SHIRT \| \$\{escapeHtml/);
  assert.match(storefront, /Why you\\u2019ll love it:/);
  assert.match(storefront, /product-vendor-link/);
  assert.doesNotMatch(storefront, /price-label/);
  assert.match(storefront, /product-size-chart-image/);
  assert.match(storefront, /sizeChartImage/);
  assert.match(storefront, /filterProductDescriptionSections/);
  assert.match(storefront, /isSizeGuideSection/);
  assert.doesNotMatch(storefront, /Check the size chart/);
  assert.doesNotMatch(storefront, /Regular price \$\{salePrice\} PHP/);
  assert.doesNotMatch(storefront, /Sale price <strong>/);
  assert.match(storefront, /class="product-upsell-section"/);
  assert.match(storefront, /Offer other items/);
  assert.match(storefront, /class="product-featured-image-section"/);
  assert.match(storefront, /product\.productPage\?\.featuredImageUrl/);
  assert.match(storefront, /class="product-share"/);
  assert.match(storefront, /data-copy-product-link/);
  assert.match(storefront, /data-share-modal/);
  assert.match(storefront, /Close share/);
  assert.match(storefront, /LIGHTBOX_PLACEHOLDER_SRC/);
  assert.match(storefront, /data-lightbox-image/);
  assert.match(storefront, /lightboxImage\.src = LIGHTBOX_PLACEHOLDER_SRC/);
  assert.doesNotMatch(storefront, /lightboxImage\.removeAttribute\('src'\)/);
  assert.doesNotMatch(storefront, /<img src="" alt="" data-lightbox-image>/);
  assert.match(storefront, /data-product-cart-drawer/);
  assert.match(storefront, /Item added to your cart/);
  assert.match(storefront, /class="product-cart-drawer-actions"/);
  assert.match(storefront, /class="button button-outline btn btn-outline-dark product-cart-drawer-button"/);
  assert.match(storefront, /class="button button-dark btn btn-dark product-cart-drawer-button product-cart-drawer-button--primary"/);
  assert.match(storefront, /showProductCartDrawer\(root\)/);
  assert.match(styles, /\.shopify-product-detail\s*{/);
  assert.match(styles, /\.product-media-list\s*{/);
  assert.match(styles, /\.product-gallery-carousel\s*{/);
  assert.match(styles, /\.product-gallery-control\s*{/);
  assert.match(styles, /\.limited-stock-label\s*{[^}]*color:\s*#c01818/s);
  assert.match(styles, /\.product-size-select\s*{/);
  assert.match(styles, /\.product-cart-drawer\s*{/);
  assert.match(styles, /\.product-cart-drawer-actions\s*{[^}]*display:\s*grid[^}]*gap:\s*8px/s);
  assert.match(styles, /\.product-cart-drawer-button\s*{[^}]*min-height:\s*40px[^}]*padding:\s*0 14px[^}]*font-size:\s*13px/s);
  assert.match(styles, /\.product-cart-drawer-button--primary\s*{/);
  assert.match(styles, /\.product-lightbox\s*{/);
  assert.match(styles, /\.product-share-modal\s*{/);
  assert.match(styles, /\.product-size-chart-image\s*{/);
  assert.match(styles, /\.mobile-sticky-bar\s*{[^}]*display:\s*none/s);
  assert.match(styles, /\.product-upsell-section\s*{[^}]*display:\s*block/s);
  assert.match(styles, /\.product-featured-image-section\s*{/);
  assert.match(styles, /\.product-featured-image-section img\s*{[^}]*width:\s*min\(100%,\s*1280px\)/s);
  assert.match(styles, /\.product-vendor-link\s*{/);
  assert.doesNotMatch(styles, /\.price-label,/);
  assert.match(styles, /\.product-info-panel\s*{/);
  assert.match(styles, /@media \(min-width:\s*990px\)\s*{[\s\S]*\.shopify-prototype \.product-detail\.shopify-product-detail\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*calc\(65% - 18px\)\)\s*minmax\(320px,\s*calc\(35% - 18px\)\)/s);
  assert.match(styles, /\.product-description-copy\s*{[^}]*max-width:\s*none/s);
});

test('product page layout adapts across mobile tablet and desktop screens', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(styles, /\.product-shell\s*{[^}]*overflow-x:\s*hidden/s);
  assert.match(styles, /\.shopify-prototype \.product-detail\.shopify-product-detail\s*{[^}]*width:\s*min\(100%,\s*1280px\)/s);
  assert.match(styles, /\.product__media-list\.product-media-list\s*{[^}]*display:\s*flex[^}]*overflow-x:\s*auto[^}]*scroll-snap-type:\s*x mandatory/s);
  assert.match(styles, /\.product-media-item\s*{[^}]*flex:\s*0 0 100%[^}]*scroll-snap-align:\s*start/s);
  assert.match(styles, /\.product-media-item img,[\s\S]*\.shopify-prototype \.product-gallery-main\s*{[^}]*width:\s*100%[^}]*height:\s*auto/s);
  assert.match(styles, /@media \(max-width:\s*749px\)\s*{[\s\S]*\.product__media-list\.product-media-list\s*{[^}]*margin-left:\s*0[^}]*width:\s*100%/s);
  assert.match(styles, /@media \(max-width:\s*749px\)\s*{[\s\S]*\.product__media-wrapper\s*{[^}]*padding:\s*0 14px/s);
  assert.match(styles, /@media \(max-width:\s*749px\)\s*{[\s\S]*\.product__info-wrapper\s*{[^}]*padding:\s*0 14px/s);
  assert.match(styles, /@media \(max-width:\s*749px\)\s*{[\s\S]*\.product-size-select\s*{[^}]*min-height:\s*50px/s);
  assert.match(styles, /@media \(min-width:\s*750px\) and \(max-width:\s*989px\)\s*{[\s\S]*\.shopify-prototype \.product-detail\.shopify-product-detail\s*{[^}]*grid-template-columns:\s*1fr/s);
  assert.doesNotMatch(styles, /@media \(min-width:\s*1280px\)\s*{[\s\S]*\.product-media-list\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
});

test('add to cart controls stay responsive across screen sizes', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(styles, /\.product-form\s*{[^}]*width:\s*100%/s);
  assert.match(styles, /\.quantity-stepper\s*{[^}]*width:\s*142px/s);
  assert.match(styles, /\.add-to-cart-button\s*{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*white-space:\s*normal/s);
  assert.match(styles, /\.product-purchase-buttons\s*{[^}]*display:\s*grid/s);
  assert.match(styles, /\.add-to-cart-button\s*{[^}]*background:\s*var\(--accent\)[^}]*border-color:\s*var\(--accent\)[^}]*color:\s*#fff/s);
  assert.match(styles, /\.add-to-cart-button:not\(:disabled\),\s*\.quick-checkout-button:not\(:disabled\)\s*{[^}]*cursor:\s*pointer/s);
  assert.match(styles, /\.add-to-cart-button:not\(:disabled\):is\(:hover,\s*:focus-visible\),\s*\.quick-checkout-button:not\(:disabled\):is\(:hover,\s*:focus-visible\)\s*{/);
  assert.match(styles, /\.mobile-sticky-bar\s*{[^}]*display:\s*none/s);
  assert.match(styles, /\.product-upsell-grid\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /@media \(max-width:\s*480px\)\s*{[\s\S]*\.product-upsell-grid\s*{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styles, /@media \(min-width:\s*750px\) and \(max-width:\s*989px\)\s*{[\s\S]*\.product-upsell-grid\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /@media \(min-width:\s*990px\)\s*{[\s\S]*\.product-upsell-grid\s*{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /\.product-featured-image-section img\s*{[^}]*aspect-ratio:\s*16 \/ 9/s);
  assert.match(styles, /@media \(max-width:\s*749px\)\s*{[\s\S]*\.product-featured-image-section\s*{[^}]*padding:\s*0 14px 44px/s);
  assert.match(styles, /@media \(max-width:\s*749px\)\s*{[\s\S]*\.product-featured-image-section img\s*{[^}]*width:\s*100%[^}]*height:\s*auto[^}]*max-height:\s*none[^}]*aspect-ratio:\s*auto[^}]*object-fit:\s*contain/s);
  assert.match(styles, /@media \(min-width:\s*750px\) and \(max-width:\s*989px\)\s*{[\s\S]*\.product-featured-image-section img\s*{[^}]*aspect-ratio:\s*3 \/ 2/s);
});

test('product cards and storefront buttons use centered text and hover-only underlines', () => {
  const storefront = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'storefront.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(storefront, /class="product-size-button"/);
  assert.match(storefront, />Choose size</);
  assert.match(styles, /\.product-media img\s*{[^}]*object-fit:\s*contain/s);
  assert.match(styles, /\.product-size-button\s*{/);
  assert.match(styles, /\.product-card-copy\s*{[^}]*grid-template-columns:\s*1fr[^}]*text-align:\s*center/s);
  assert.match(styles, /\.product-card h3\s*{[^}]*text-align:\s*center/s);
  assert.match(styles, /\.product-card p\s*{[^}]*text-align:\s*center/s);
  assert.match(styles, /\.shopify-product-grid \.product-card-copy\s*{[^}]*text-align:\s*center/s);
  assert.match(styles, /\.shopify-product-grid \.product-card h3\s*{[^}]*text-align:\s*center/s);
  assert.match(styles, /\.shopify-product-grid \.product-card p\s*{[^}]*text-align:\s*center/s);
  assert.match(styles, /\.section-link,\s*\.text-button\s*{[^}]*text-decoration:\s*none/s);
  assert.match(styles, /\.product-card a,\s*\.button\s*{[^}]*text-decoration:\s*none/s);
  assert.match(styles, /\.section-link:is\(:hover,\s*:focus-visible\),\s*\.text-button:is\(:hover,\s*:focus-visible\)\s*{[^}]*text-decoration:\s*underline/s);
  assert.match(styles, /\.product-card a:is\(:hover,\s*:focus-visible\)\s*{[^}]*text-decoration:\s*underline/s);
});

test('product page typography and controls follow the Shopify orange reference', () => {
  const storefront = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'storefront.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.doesNotMatch(storefront, /product\.productPage\?\.mediaLimit/);
  assert.match(storefront, /const primaryActionText = isSoldOut \? product\.productPage\?\.soldOutText/);
  assert.match(storefront, /disabled aria-disabled="true"/);
  assert.match(styles, /\.shopify-prototype \.product-detail\.shopify-product-detail\s*{[^}]*font-family:\s*Inter,\s*Arial,\s*sans-serif/s);
  assert.match(styles, /\.shopify-prototype \.product-panel \.product__title h1,[\s\S]*\.product__title h1\s*{[^}]*font-size:\s*clamp\(24px,\s*3vw,\s*34px\)[^}]*font-weight:\s*400[^}]*line-height:\s*1\.28/s);
  assert.match(styles, /\.product-media-item img,[\s\S]*\.shopify-prototype \.product-gallery-main\s*{[^}]*aspect-ratio:\s*1 \/ 1[^}]*border-radius:\s*0[^}]*box-shadow:\s*none/s);
  assert.match(styles, /\.product-size-select\s*{[^}]*border-radius:\s*10px[^}]*font-size:\s*15px/s);
  assert.match(styles, /\.add-to-cart-button\s*{[^}]*min-height:\s*47px[^}]*font-size:\s*15px/s);
  assert.match(styles, /\.product-description-copy\s*{[^}]*font-size:\s*15px[^}]*line-height:\s*1\.7/s);
  assert.match(styles, /@media \(max-width:\s*749px\)\s*{[\s\S]*\.shopify-prototype \.product-detail\.shopify-product-detail\s*{[^}]*padding:\s*20px 0 48px/s);
  assert.match(styles, /@media \(min-width:\s*990px\)\s*{[\s\S]*\.shopify-prototype \.product-detail\.shopify-product-detail\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*calc\(65% - 18px\)\)\s*minmax\(320px,\s*calc\(35% - 18px\)\)/s);
});

test('checkout removes inactive discount UI and adds COD delivery support guidance', () => {
  const checkoutHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'checkout.html'), 'utf8');
  const checkoutJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'checkout.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(checkoutHtml, /Mobile number for COD confirmation/);
  assert.match(checkoutHtml, /No online payment needed/);
  assert.match(checkoutHtml, /Need help\?/);
  assert.match(checkoutHtml, /support@mariaclaraclothing\.com/);
  assert.match(checkoutHtml, /data-delivery-estimate/);
  assert.doesNotMatch(checkoutHtml, /Discount code/);
  assert.doesNotMatch(checkoutHtml, /checkout-discount-row/);

  assert.match(checkoutJs, /deliveryEstimateForRegion/);
  assert.match(checkoutJs, /data-delivery-estimate/);
  assert.match(checkoutJs, /trackStorefrontEvent\('checkout_address_completed'/);
  assert.match(checkoutJs, /trackStorefrontEvent\('order_placed'/);
  assert.match(checkoutJs, /window\.location\.href = `\/thank-you\.html\?order=\$\{encodeURIComponent\(result\.orderNumber\)\}`/);
  assert.match(styles, /\.checkout-support-note\s*{/);
});
