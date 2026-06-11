import { getProducts, getSiteContent } from './api.js';

const CART_KEY = 'maria-clara-cart';

updateShellCartCount();
initializeShell();

export function trackStorefrontEvent(eventName, payload = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: eventName,
    ...payload
  });
}

export async function initializeShell() {
  const menuDrawer = document.querySelector('[data-menu-drawer]');
  const searchOverlay = document.querySelector('[data-search-overlay]');
  const searchInput = document.querySelector('[data-search-input]');
  const searchResults = document.querySelector('[data-search-results]');

  bindPageTransitions();
  bindOverlay('[data-menu-open]', '[data-menu-close]', menuDrawer);
  bindOverlay('[data-search-open]', '[data-search-close]', searchOverlay, () => {
    searchInput?.focus();
    renderSearchResults('', searchResults);
  });

  searchInput?.addEventListener('input', () => {
    renderSearchResults(searchInput.value, searchResults);
  });

  await renderHomepageBanners();
  initializeCarousel();

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeOverlay(menuDrawer);
    closeOverlay(searchOverlay);
  });

  document.querySelector('[data-video-poster]')?.addEventListener('click', (event) => {
    const poster = event.currentTarget;
    const videoSrc = poster.dataset.videoSrc || '/brand/video-poster.mp4';

    poster.outerHTML = `<video class="prototype-video" controls autoplay loop playsinline>
      <source src="${escapeAttribute(videoSrc)}" type="video/mp4">
    </video>`;
  });
}

async function renderHomepageBanners() {
  const carousel = document.querySelector('[data-homepage-banners]');
  if (!carousel) return;

  try {
    const { siteContent } = await getSiteContent();
    const banners = Array.isArray(siteContent?.homepageBanners) ? siteContent.homepageBanners : [];
    if (!banners.length) return;

    carousel.innerHTML = `${banners.map((banner, index) => `<article class="slide${index === 0 ? ' is-active' : ''}">
      <img src="${escapeAttribute(banner.url)}" alt="${escapeAttribute(banner.altText || 'Maria Clara banner')}">
    </article>`).join('')}
    <div class="slide-dots" aria-hidden="true">${banners.map(() => '<span></span>').join('')}</div>`;
  } catch (_error) {
    // Keep the static fallback banners if the content API is unavailable.
  }
}

function bindPageTransitions() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || !shouldTransitionLink(event, link)) return;

    event.preventDefault();
    document.body.classList.add('is-page-leaving');
    window.setTimeout(() => {
      window.location.href = link.href;
    }, 150);
  });
}

function shouldTransitionLink(event, link) {
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

function initializeCarousel() {
  document.querySelectorAll('[data-carousel]').forEach((carousel) => {
    const slides = Array.from(carousel.querySelectorAll('.slide'));
    const dots = Array.from(carousel.querySelectorAll('.slide-dots span'));
    let activeIndex = slides.findIndex((slide) => slide.classList.contains('is-active'));

    if (slides.length < 2) return;
    if (activeIndex < 0) activeIndex = 0;

    const showSlide = (nextIndex) => {
      activeIndex = nextIndex % slides.length;
      slides.forEach((slide, index) => slide.classList.toggle('is-active', index === activeIndex));
      dots.forEach((dot, index) => dot.classList.toggle('is-active', index === activeIndex));
    };

    showSlide(activeIndex);
    window.setInterval(() => showSlide(activeIndex + 1), 4200);
  });
}

function bindOverlay(openSelector, closeSelector, overlay, onOpen) {
  if (!overlay) return;

  document.querySelectorAll(openSelector).forEach((button) => {
    button.addEventListener('click', () => {
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      onOpen?.();
    });
  });

  overlay.querySelectorAll(closeSelector).forEach((button) => {
    button.addEventListener('click', () => closeOverlay(overlay));
  });

  overlay.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => closeOverlay(overlay));
  });
}

function closeOverlay(overlay) {
  if (!overlay) return;
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
}

async function renderSearchResults(query, root) {
  if (!root) return;

  try {
    const { products } = await getProducts();
    const normalizedQuery = query.trim().toLowerCase();
    const matches = products
      .filter((product) => !normalizedQuery || productSearchText(product).includes(normalizedQuery))
      .slice(0, 6);

    if (!matches.length) {
      root.innerHTML = '<p class="loading-copy">No products found. Try "orange", "mandala", or "oversized".</p>';
      return;
    }

    root.innerHTML = matches.map((product) => {
      const image = product.images[0]?.url || '';
      const availableSizes = product.variants
        .filter((variant) => Number(variant.stockQuantity || 0) > 0)
        .map((variant) => variant.size)
        .join(' / ');
      return `<a class="search-result" href="/product.html?slug=${encodeURIComponent(product.slug)}">
        <img src="${escapeAttribute(image)}" alt="${escapeAttribute(product.images[0]?.altText || product.name)}">
        <span>${escapeHtml(product.name)}</span>
        <small>Available sizes: ${escapeHtml(availableSizes || 'Sold out')}</small>
        <strong>${renderPrice(product)}</strong>
      </a>`;
    }).join('');
  } catch (error) {
    root.innerHTML = `<p class="form-status">${escapeHtml(error.message)}</p>`;
  }
}

function productSearchText(product) {
  return [
    product.name,
    product.description,
    product.collection,
    ...(Array.isArray(product.collections) ? product.collections : []),
    ...(Array.isArray(product.variants) ? product.variants.map((variant) => variant.size) : [])
  ].filter(Boolean).join(' ').toLowerCase();
}

function updateShellCartCount() {
  let count = 0;
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    count = Array.isArray(cart) ? cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0) : 0;
  } catch (_error) {
    count = 0;
  }

  document.querySelectorAll('[data-cart-count]').forEach((node) => {
    node.textContent = String(count);
  });
}

function renderPrice(product) {
  const salePrice = formatMoney(product.priceCents);
  if (!product.compareAtPriceCents) return salePrice;
  return `<span class="sale-price">${salePrice}</span> <s>${formatMoney(product.compareAtPriceCents)}</s>`;
}

function formatMoney(cents) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100);
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
