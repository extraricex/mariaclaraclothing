import { getProducts, getProduct } from './api.js';
import { addToCart, updateCartCount } from './cart.js';
import { trackStorefrontEvent } from './shell.js';

const LOW_STOCK_THRESHOLD = 12;
const LIGHTBOX_PLACEHOLDER_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

updateCartCount();

const grid = document.querySelector('#product-grid');
if (grid) {
  renderProductGrid(grid, 'New Arrivals');
}

const freedomGrid = document.querySelector('#freedom-grid');
if (freedomGrid) {
  renderProductGrid(freedomGrid, 'Freedom of Mind');
}

const productRoot = document.querySelector('#product-detail');
if (productRoot) {
  renderProductPage(productRoot);
}

async function renderProductGrid(root, collection) {
  try {
    root.innerHTML = '<p class="loading-copy">Loading featured pieces...</p>';
    const { products } = await getProducts();

    if (!products.length) {
      root.innerHTML = '<p class="loading-copy">Featured pieces are being prepared.</p>';
      return;
    }

    const visibleProducts = collection ? products.filter((product) => {
      return product.collection === collection || product.collections?.includes(collection);
    }) : products;
    root.innerHTML = visibleProducts.map((product) => {
      const image = product.images[0]?.url || exampleProductImage(product.name);
      const hoverImage = product.images[1]?.url || exampleProductImage(`${product.name} hover`);
      const sizes = product.variants.map((variant) => variant.size).join(' / ');
      const isSoldOut = product.merchandisingStatus === 'sold_out' || product.variants.every((variant) => Number(variant.stockQuantity) < 1);

      const productHref = `/product.html?slug=${encodeURIComponent(product.slug)}`;

      return `<article class="product-card">
        <div class="product-badge ${isSoldOut ? 'is-sold-out' : ''}">${isSoldOut ? 'Sold out' : 'Sale'}</div>
        <a href="${productHref}" aria-label="View ${escapeHtml(product.name)}">
          <span class="product-media">
            <img class="primary-image" src="${escapeAttribute(image)}" alt="${escapeAttribute(product.images[0]?.altText || product.name)}" loading="lazy">
            <img class="hover-image" src="${escapeAttribute(hoverImage)}" alt="" loading="lazy" aria-hidden="true">
          </span>
          <div class="product-card-copy">
            <h3>${escapeHtml(product.name)}</h3>
            <p>${renderPrice(product)}</p>
            <span>${escapeHtml(sizes)}</span>
          </div>
        </a>
        <a class="product-size-button" href="${productHref}" aria-label="Choose size for ${escapeAttribute(product.name)}">Choose size</a>
      </article>`;
    }).join('');
  } catch (error) {
    root.innerHTML = `<p class="form-status">${escapeHtml(error.message)}</p>`;
  }
}

async function renderProductPage(root) {
  try {
    const slug = new URLSearchParams(location.search).get('slug');
    const [{ product }, catalog] = await Promise.all([
      getProduct(slug),
      getProducts()
    ]);
    const relatedProducts = Array.isArray(catalog.products) ? catalog.products : [];
    let selectedVariant = firstAvailableVariant(product);

    root.innerHTML = renderProductDetail(product, selectedVariant, relatedProducts);
    initializeProductGallery(root);
    initializeProductLightbox(root);
    initializeProductShareModal(root);
    initializeProductCartDrawer(root);
    trackStorefrontEvent('product_view', {
      productId: product.id,
      slug: product.slug
    });
    window.trackMetaPixelViewContent?.(product);

    root.querySelectorAll('[data-variant-select]').forEach((select) => {
      select.addEventListener('change', () => {
        selectedVariant = handleVariantSelect(root, product, select);
      });
    });

    root.querySelectorAll('[data-add-to-cart]').forEach((button) => {
      button.addEventListener('click', () => {
        addProductToCart(root, product, selectedVariant);
      });
    });

    root.querySelectorAll('[data-buy-now]').forEach((button) => {
      button.addEventListener('click', () => {
        if (addProductToCart(root, product, selectedVariant)) {
          window.location.href = '/checkout.html';
        }
      });
    });

    root.querySelectorAll('[data-quantity-decrease]').forEach((button) => {
      button.addEventListener('click', () => updateQuantity(root, -1));
    });

    root.querySelectorAll('[data-quantity-increase]').forEach((button) => {
      button.addEventListener('click', () => updateQuantity(root, 1));
    });

    root.querySelectorAll('[data-copy-product-link]').forEach((button) => {
      button.addEventListener('click', async () => {
        const status = root.querySelector('[data-share-status]');
        const url = window.location.href;
        try {
          await navigator.clipboard?.writeText(url);
          if (status) status.textContent = 'Link copied';
        } catch (_error) {
          if (status) status.textContent = url;
        }
      });
    });
  } catch (error) {
    root.innerHTML = `<section class="section"><p class="form-status">${escapeHtml(error.message)}</p></section>`;
  }
}

function handleVariantSelect(root, product, select) {
  const selectedVariant = product.variants.find((variant) => variant.id === select.value) || null;
  root.querySelectorAll('[data-selected-size]').forEach((node) => {
    node.textContent = selectedVariant ? selectedVariant.size : 'Select size';
  });
  updateLimitedStockLabel(root, selectedVariant);
  trackStorefrontEvent('size_selected', {
    productId: product.id,
    variantId: selectedVariant?.id || '',
    size: selectedVariant?.size || ''
  });
  return selectedVariant;
}

function updateQuantity(root, delta) {
  const input = root.querySelector('[data-quantity-input]');
  if (!input) return;
  const nextValue = Math.max(1, Number(input.value || 1) + delta);
  input.value = String(nextValue);
}

function addProductToCart(root, product, selectedVariant) {
  const status = root.querySelector('[data-status]');
  const quantityInput = root.querySelector('[data-quantity-input]');

  if (!selectedVariant) {
    status.textContent = 'Choose a size first.';
    return false;
  }

  const quantity = Math.max(1, Number(quantityInput?.value || 1));

  addToCart({
    productId: product.id,
    slug: product.slug,
    variantId: selectedVariant.id,
    productName: product.name,
    size: selectedVariant.size,
    quantity,
    unitPriceCents: product.priceCents,
    imageUrl: product.images[0]?.url || '',
    externalPosProductId: product.externalPosProductId || '',
    externalPosVariantId: selectedVariant.externalPosVariantId || ''
  });

  trackStorefrontEvent('add_to_cart', {
    productId: product.id,
    variantId: selectedVariant.id,
    size: selectedVariant.size,
    quantity
  });
  window.trackMetaPixelAddToCart?.(product, selectedVariant, quantity);
  status.textContent = 'Added to cart.';
  showProductCartDrawer(root);
  return true;
}

function firstAvailableVariant(product) {
  return product.variants.find((variant) => Number(variant.stockQuantity) > 0) || null;
}

function isLimitedStock(variant) {
  const stockQuantity = Number(variant?.stockQuantity || 0);
  return stockQuantity > 0 && stockQuantity <= LOW_STOCK_THRESHOLD;
}

function updateLimitedStockLabel(root, selectedVariant) {
  root.querySelectorAll('[data-limited-stock-label]').forEach((label) => {
    label.hidden = !isLimitedStock(selectedVariant);
    label.innerHTML = isLimitedStock(selectedVariant) ? `Limited pieces in ${escapeHtml(selectedVariant.size)}` : '';
  });
}

function initializeProductGallery(root) {
  root.querySelectorAll('[data-product-gallery]').forEach((gallery) => {
    const track = gallery.querySelector('[data-gallery-track]');
    const slides = Array.from(gallery.querySelectorAll('[data-gallery-slide]'));
    const thumbs = Array.from(gallery.querySelectorAll('[data-gallery-thumb]'));
    const counter = gallery.querySelector('[data-gallery-counter]');
    const previousButton = gallery.querySelector('[data-gallery-prev]');
    const nextButton = gallery.querySelector('[data-gallery-next]');
    let activeIndex = 0;
    let scrollTimer;

    if (!track || !slides.length) return;

    const updateState = (index) => {
      activeIndex = Math.max(0, Math.min(index, slides.length - 1));
      if (counter) counter.textContent = `${activeIndex + 1} / ${slides.length}`;
      if (previousButton) previousButton.disabled = activeIndex === 0;
      if (nextButton) nextButton.disabled = activeIndex === slides.length - 1;
      thumbs.forEach((thumb, thumbIndex) => {
        thumb.setAttribute('aria-current', thumbIndex === activeIndex ? 'true' : 'false');
      });
    };

    const scrollToSlide = (index) => {
      const nextIndex = Math.max(0, Math.min(index, slides.length - 1));
      slides[nextIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      updateState(nextIndex);
    };

    previousButton?.addEventListener('click', () => scrollToSlide(activeIndex - 1));
    nextButton?.addEventListener('click', () => scrollToSlide(activeIndex + 1));
    thumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => scrollToSlide(Number(thumb.dataset.galleryIndex || 0)));
    });

    track.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollToSlide(activeIndex - 1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollToSlide(activeIndex + 1);
      }
    });

    track.addEventListener('scroll', () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        const nextIndex = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        updateState(nextIndex);
      }, 80);
    }, { passive: true });

    updateState(0);
  });
}

function initializeProductLightbox(root) {
  const lightbox = root.querySelector('[data-product-lightbox]');
  const lightboxImage = root.querySelector('[data-lightbox-image]');
  const lightboxCounter = root.querySelector('[data-lightbox-counter]');
  const lightboxClose = root.querySelector('[data-lightbox-close]');
  if (!lightbox || !lightboxImage) return;

  const openLightbox = (image) => {
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt || 'Product photo';
    if (lightboxCounter) lightboxCounter.textContent = image.dataset.galleryImage || '';
    lightbox.hidden = false;
    lightboxClose?.focus();
  };

  const closeLightbox = () => {
    lightbox.hidden = true;
    lightboxImage.src = LIGHTBOX_PLACEHOLDER_SRC;
  };

  root.querySelectorAll('[data-gallery-image]').forEach((image) => {
    image.addEventListener('click', () => openLightbox(image));
  });
  lightboxClose?.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });
}

function initializeProductShareModal(root) {
  const modal = root.querySelector('[data-share-modal]');
  if (!modal) return;

  const openModal = () => {
    modal.hidden = false;
    modal.querySelector('[data-copy-product-link]')?.focus();
  };
  const closeModal = () => {
    modal.hidden = true;
  };

  root.querySelectorAll('[data-share-open]').forEach((button) => {
    button.addEventListener('click', openModal);
  });
  root.querySelectorAll('[data-share-close]').forEach((button) => {
    button.addEventListener('click', closeModal);
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
}

function initializeProductCartDrawer(root) {
  root.querySelectorAll('[data-product-cart-drawer-close]').forEach((button) => {
    button.addEventListener('click', () => {
      const drawer = root.querySelector('[data-product-cart-drawer]');
      if (drawer) drawer.hidden = true;
    });
  });
}

function showProductCartDrawer(root) {
  const drawer = root.querySelector('[data-product-cart-drawer]');
  if (!drawer) return;
  drawer.hidden = false;
  drawer.querySelector('[data-product-cart-drawer-close]')?.focus();
}

function renderProductDetail(product, selectedVariant, relatedProducts = []) {
  const gallery = product.images;
  const isSoldOut = product.variants.every((variant) => Number(variant.stockQuantity) < 1);
  const primaryActionText = isSoldOut ? product.productPage?.soldOutText || 'Sold out' : 'Add to Cart';
  const displayTitle = stripProductSuffix(product.name);
  const productTitle = product.name || displayTitle;

  return `<section class="shopify-product-detail product product--large product--left product--stacked product--mobile-hide grid grid--1-col grid--2-col-tablet product-detail">
    <div class="grid__item product__media-wrapper product-gallery" aria-label="Product media" data-product-gallery>
      <media-gallery class="product-media-gallery" data-desktop-layout="stacked">
        <div class="product-gallery-carousel">
        <button class="product-gallery-control product-gallery-control--previous" type="button" aria-label="Previous product photo" data-gallery-prev>&lsaquo;</button>
        <ul class="product__media-list contains-media grid grid--peek list-unstyled slider slider--mobile product-media-list" tabindex="0" data-gallery-track>${gallery.map((item, index) => {
        return `<li class="product-media-item" data-gallery-slide><figure>
          <button class="product__modal-opener product__modal-opener--image" type="button" aria-label="Open media ${index + 1} in modal">
          <img class="${index === 0 ? 'product-gallery-main' : ''}" src="${escapeAttribute(item.url)}" alt="${escapeAttribute(item.altText || product.name)}" loading="${index === 0 ? 'eager' : 'lazy'}" data-gallery-image="${index + 1} / ${gallery.length}">
          </button>
          <figcaption>Open media ${index + 1} in modal</figcaption>
        </figure></li>`;
      }).join('')}</ul>
        <button class="product-gallery-control product-gallery-control--next" type="button" aria-label="Next product photo" data-gallery-next>&rsaquo;</button>
        </div>
        <div class="product-media-counter slider-counter" data-gallery-counter>1 / ${gallery.length}</div>
        <div class="product-gallery-thumbs thumbnail-list list-unstyled">${gallery.map((item, index) => {
        return `<button type="button" aria-label="Show product photo ${index + 1}" data-gallery-thumb data-gallery-index="${index}" aria-current="${index === 0 ? 'true' : 'false'}">
          <img src="${escapeAttribute(item.url)}" alt="${escapeAttribute(item.altText || product.name)}" loading="lazy">
        </button>`;
      }).join('')}</div>
      </media-gallery>
    </div>
    <aside class="product__info-wrapper grid__item product-info-panel product-panel">
      <div class="product__info-container">
      <a class="product-vendor-link" href="/#new-arrivals">${escapeHtml(product.vendor || 'Maria Clara')}</a>
      <div class="product__title"><h1>${escapeHtml(productTitle)}</h1></div>
      <div class="product-price-block">${renderShopifyPrice(product)}</div>
      <div class="product-badge-row">
        <span class="sale-badge">Sale</span>
        ${isSoldOut ? '<span class="sold-out-badge">Sold out</span>' : ''}
      </div>
      <div class="product-actions product-form">
        <fieldset class="product-form__input product-form__input--dropdown product-option-fieldset">
          <legend class="option-label">Size</legend>
          <p class="limited-stock-label" data-limited-stock-label ${isLimitedStock(selectedVariant) ? '' : 'hidden'}>${isLimitedStock(selectedVariant) ? `Limited pieces in ${escapeHtml(selectedVariant.size)}` : ''}</p>
          <div class="select"><select class="select__select product-size-select" name="options[Size]" data-variant-select aria-label="Size">${product.variants.map((variant) => {
            const disabled = Number(variant.stockQuantity) < 1;
            const label = `${variant.size}${disabled ? ' - Unavailable' : ''}`;
            return `<option value="${escapeAttribute(variant.id)}" ${selectedVariant?.id === variant.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</option>`;
          }).join('')}</select></div>
        </fieldset>
        <label class="product-form__quantity">
          <span>Quantity</span>
          <span class="quantity-helper">(0 in cart)</span>
          <span class="quantity-stepper">
            <button type="button" aria-label="Decrease quantity for ${escapeAttribute(product.name)}" data-quantity-decrease>-</button>
            <input type="number" min="1" value="1" inputmode="numeric" data-quantity-input>
            <button type="button" aria-label="Increase quantity for ${escapeAttribute(product.name)}" data-quantity-increase>+</button>
          </span>
        </label>
        <div class="product-purchase-buttons">
          <button class="button button-primary btn btn-dark add-to-cart-button" type="button" data-add-to-cart ${isSoldOut ? 'disabled aria-disabled="true"' : ''}>${escapeHtml(primaryActionText)}</button>
          <button class="button button-outline btn btn-outline-dark quick-checkout-button" type="button" data-buy-now ${isSoldOut ? 'disabled aria-disabled="true"' : ''}>Check out</button>
        </div>
        <p data-status class="form-status" aria-live="polite"></p>
        <div class="pickup-status">
          <p>Couldn&#039;t load pickup availability</p>
          <button type="button">Refresh</button>
        </div>
      </div>
      ${renderProductDescription(product)}
      </div>
    </aside>
  </section>
  ${renderProductUpsell(product, relatedProducts)}
  ${renderProductFeaturedImage(product)}
  <aside class="product-cart-drawer" data-product-cart-drawer hidden aria-live="polite">
    <div class="product-cart-drawer-panel">
      <button class="product-modal-close" type="button" data-product-cart-drawer-close aria-label="Close cart drawer">Close</button>
      <h2>Item added to your cart</h2>
      <p>${escapeHtml(displayTitle)}</p>
      <div class="product-cart-drawer-actions">
        <a class="button button-dark btn btn-dark product-cart-drawer-button product-cart-drawer-button--primary" href="/checkout.html">Check out</a>
        <a class="button button-outline btn btn-outline-dark product-cart-drawer-button" href="/cart.html">View cart</a>
        <button class="button button-outline btn btn-outline-dark product-cart-drawer-button" type="button" data-product-cart-drawer-close>Continue shopping</button>
      </div>
    </div>
  </aside>
  <aside class="product-lightbox" data-product-lightbox hidden aria-modal="true" role="dialog" aria-label="Product image preview">
    <button class="product-modal-close" type="button" data-lightbox-close aria-label="Close image preview">Close</button>
    <img src="${LIGHTBOX_PLACEHOLDER_SRC}" alt="" data-lightbox-image>
    <span data-lightbox-counter></span>
  </aside>`;
}

function renderProductUpsell(product, relatedProducts = []) {
  const upsellProducts = relatedProducts
    .filter((item) => item.slug !== product.slug)
    .filter((item) => item.merchandisingStatus !== 'sold_out')
    .filter((item) => item.variants?.some((variant) => Number(variant.stockQuantity) > 0))
    .slice(0, 4);

  if (!upsellProducts.length) return '';

  return `<section class="product-upsell-section" aria-label="Offer other items">
    <div class="product-upsell-inner">
      <h2>Offer other items</h2>
      <div class="product-upsell-grid">${upsellProducts.map((item) => {
        const image = item.images?.[0]?.url || exampleProductImage(item.name);
        return `<a class="product-upsell-card" href="/product.html?slug=${encodeURIComponent(item.slug)}">
          <img src="${escapeAttribute(image)}" alt="${escapeAttribute(item.images?.[0]?.altText || item.name)}" loading="lazy">
          <span>${escapeHtml(stripProductSuffix(item.name))}</span>
          <strong>${renderPrice(item)}</strong>
        </a>`;
      }).join('')}</div>
    </div>
  </section>`;
}

function renderProductFeaturedImage(product) {
  const featuredImage = product.productPage?.featuredImageUrl
    || product.images.find((image) => !/chart/i.test(image.url || image.altText || '') && Number(image.sortOrder) >= 3)?.url
    || product.images[1]?.url
    || product.images[0]?.url
    || '';

  if (!featuredImage) return '';

  return `<section class="product-featured-image-section" aria-label="Featured product image">
    <img src="${escapeAttribute(featuredImage)}" alt="${escapeAttribute(product.name)} featured image" loading="lazy">
  </section>`;
}

function renderProductDescription(product) {
  const fallbackProductPage = defaultProductPage(product);
  const sizeChartImage = product.productPage?.sizeChartImageUrl || product.images.find((image) => /chart/i.test(image.url || image.altText || ''))?.url || product.images[2]?.url || '';
  const productPage = {
    heading: product.productPage?.heading || fallbackProductPage.heading,
    intro: product.productPage?.intro || fallbackProductPage.intro,
    sections: filterProductDescriptionSections(product.productPage?.sections || fallbackProductPage.sections)
  };

  return `<section class="product__description rte quick-add-hidden product-description-section">
    <div class="product-description-copy">
      <h2>${escapeHtml(productPage.heading)}</h2>
      <div class="product-description-rich">${renderRichProductText(productPage.intro)}</div>
      ${productPage.sections.map((section) => renderProductPageSection(section)).join('')}
      ${sizeChartImage ? `<img class="product-size-chart-image" src="${escapeAttribute(sizeChartImage)}" alt="Maria Clara oversized shirt size chart" loading="lazy">` : ''}
      <div class="product-share">
        <button type="button" data-share-open>Share</button>
      </div>
      <aside class="product-share-modal" data-share-modal hidden aria-modal="true" role="dialog" aria-label="Share product">
        <div>
          <button class="product-modal-close" type="button" data-share-close>Close share</button>
          <h2>Share</h2>
          <p>Copy this product link and send it to a friend.</p>
          <button class="button button-dark btn btn-dark" type="button" data-copy-product-link>Copy link</button>
          <small data-share-status aria-live="polite"></small>
        </div>
      </aside>
    </div>
  </section>`;
}

function renderRichProductText(value) {
  const text = String(value || '');
  if (!/<[a-z][\s\S]*>/i.test(text)) return escapeHtml(text);

  const template = document.createElement('template');
  template.innerHTML = text;
  sanitizeRichNode(template.content);
  return template.innerHTML;
}

function sanitizeRichNode(root) {
  const allowedTags = new Set(['A', 'B', 'BR', 'DIV', 'EM', 'H2', 'H3', 'I', 'LI', 'OL', 'P', 'SPAN', 'STRONG', 'U', 'UL']);
  Array.from(root.querySelectorAll('*')).forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(document.createTextNode(node.textContent || ''));
      return;
    }

    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (node.tagName === 'A' && name === 'href') {
        const href = node.getAttribute('href') || '';
        if (/^(https?:|mailto:|tel:|\/)/i.test(href)) return;
      }
      if (node.tagName === 'SPAN' && name === 'style') {
        const style = node.getAttribute('style') || '';
        const safeStyle = style
          .split(';')
          .map((rule) => rule.trim())
          .filter((rule) => /^(color|text-align)\s*:/i.test(rule))
          .join('; ');
        if (safeStyle) {
          node.setAttribute('style', safeStyle);
          return;
        }
      }
      node.removeAttribute(attribute.name);
    });
  });
}

function renderProductPageSection(section) {
  return `<h2>${escapeHtml(section.title)}</h2>
    ${section.body ? `<p>${escapeHtml(section.body)}</p>` : ''}
    ${Array.isArray(section.items) ? `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}`;
}

function filterProductDescriptionSections(sections = []) {
  return sections.filter((section) => !isSizeGuideSection(section));
}

function isSizeGuideSection(section) {
  const sectionText = [
    section?.title,
    section?.body,
    ...(Array.isArray(section?.items) ? section.items : [])
  ].filter(Boolean).join(' ').toLowerCase();

  return /\b(size guide|size chart|oversize chart|oversized chart)\b/.test(sectionText);
}

function defaultProductPage(product) {
  return {
    heading: `OVERSIZED FIT SHIRT | ${stripProductSuffix(product.name)} | MARIA CLARA CLOTHING | OVERSIZED FIT | 100% COTTON`,
    intro: product.description || 'This oversized fit crew neck tee offers a premium quality thread 240 GSM cotton fabric. It\'s designed for comfort and style, ensuring you feel alive wherever you go. Peace for mind and clarity of thoughts are just a wear away. Hand wash only for longevity.',
    sections: [
      {
        title: 'Why you\u2019ll love it:',
        items: [
          'Premium 240 GSM cotton',
          'Oversized streetwear fit',
          'Proudly made in the Philippines',
          'COD available',
          'Ships nationwide',
          'Easy size exchange within 7 days'
        ]
      },
      {
        title: 'Shipping & Style:',
        body: 'Enjoy FREE SHIPPING NATIONWIDE on orders of minimum 2. Bring your style anywhere with the Maria Clara Premium Shirt. Check the OVERSIZE CHART for the perfect fit.'
      }
    ]
  };
}

function stripProductSuffix(name) {
  return String(name || '').replace(/\s+—\s+Oversized 240 GSM Shirt$/i, '');
}

function formatMoney(cents) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100);
}

function renderPrice(product) {
  const salePrice = formatMoney(product.priceCents);
  if (!product.compareAtPriceCents) return salePrice;
  return `<span class="sale-price">${salePrice}</span> <s>${formatMoney(product.compareAtPriceCents)}</s>`;
}

function renderShopifyPrice(product) {
  const salePrice = formatMoney(product.priceCents);
  const comparePrice = product.compareAtPriceCents ? formatMoney(product.compareAtPriceCents) : '';
  if (!comparePrice) return `<p class="price">${salePrice} PHP</p>`;
  return `<p class="price price--on-sale">
    <strong>${salePrice} PHP</strong>
    <s>${comparePrice} PHP</s>
  </p>`;
}

function exampleProductImage(seed) {
  const examples = [
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=82',
    'https://images.unsplash.com/photo-1562157873-818bc0726f68?auto=format&fit=crop&w=900&q=82',
    'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=82',
    'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=900&q=82'
  ];
  const index = Array.from(seed || '').reduce((sum, char) => sum + char.charCodeAt(0), 0) % examples.length;
  return examples[index];
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
