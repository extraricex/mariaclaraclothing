import { useEffect, useState } from 'react';

export const DEFAULT_INFO_PAGES = {
  faq: [
    { heading: 'How does Cash on Delivery work?', body: 'Place your order online — no advance payment needed. Our team reviews your order and may contact you by text or phone before shipping via J&T Express. You pay the rider in cash when the parcel arrives.' },
    { heading: 'How long is delivery?', body: 'Metro Manila and Cavite: 2–4 days. Other Luzon provinces: 3–6 days. Visayas and Mindanao: 5–8 days. Estimates begin after your order is reviewed and prepared for shipment.' },
    { heading: 'How much is shipping?', body: 'Metro Manila & Cavite ₱80, Luzon ₱120, Visayas/Mindanao ₱180. Order any 2 items and shipping is free.' },
    { heading: 'What if my size is sold out?', body: 'Drops are limited runs. Follow our socials for restocks — once a run sells through, it usually does not return.' },
    { heading: 'What is 240 GSM cotton?', body: 'GSM is fabric weight. 240 GSM is heavyweight tee territory: structured, opaque, and it keeps its shape after repeated washing.' }
  ],
  shippingReturns: [
    { heading: 'Shipping coverage', body: 'We ship nationwide via J&T Express with structured Philippine addresses (province, city/municipality, barangay). Some barangays are not confirmed for door-to-door delivery; we review those orders before shipping and coordinate by text.' },
    { heading: 'Shipping rates', body: 'Metro Manila & Cavite ₱80 · Luzon ₱120 · Visayas/Mindanao ₱180. Free shipping on any order of 2 or more items.' },
    { heading: 'Order confirmation', body: 'We review every COD order before shipment and may contact you by text or phone. Orders with invalid or unreachable contact details may be held or cancelled.' },
    { heading: 'Returns & exchanges', body: 'Wrong or damaged item? Message us within 7 days of delivery with photos and we will arrange a replacement. Items must be unworn and unwashed. Size exchanges are subject to stock availability; buyer shoulders return shipping for size exchanges.' }
  ],
  terms: [
    { heading: 'Orders', body: 'All orders are Cash on Delivery and are reviewed before fulfillment. We may contact you by text or phone, and reserve the right to hold or cancel orders with invalid or unreachable contact details.' },
    { heading: 'Pricing', body: 'Prices are in Philippine pesos and may change without notice. The price at the time of your order is what you pay.' },
    { heading: 'Size Chart', body: 'Check the size chart before ordering. Measurements have a ±2cm tolerance and size exchanges depend on available stock.', linkText: 'View Size Chart', linkHref: '/size-chart' },
    { heading: 'Privacy', body: 'We use your name, mobile number, and address to fulfill and deliver orders. The customer website also uses the Facebook Meta Pixel to send page visits and shopping actions to Meta for advertising measurement. When an order is completed, our server may send purchase details and hashed contact details to Meta through the Conversions API to match the purchase without sending your delivery address or order notes. Meta handles this information under its own privacy policy. We do not sell your personal information.' },
    { heading: 'Contact', body: 'Questions about these terms? Reach us through our social channels or the contact details on your order confirmation text.' }
  ]
};

export const DEFAULT_SIZE_CHART = {
  imageUrl: '/brand/size-chart.jpg',
  altText: 'Maria Clara Clothing oversized shirt size chart'
};

export const DEFAULT_COLLECTION_DEFINITIONS = [
  {
    name: 'New Arrivals', slug: 'new-arrivals', description: 'Oversized premium shirt.', imageUrl: '',
    visible: true, showOnHomepage: true, showOnShop: true, sortOrder: 0, aliases: []
  },
  {
    name: 'Tees', slug: 'tees', description: 'Regular Fit Tees with premium quality shirt.', imageUrl: '',
    visible: true, showOnHomepage: true, showOnShop: true, sortOrder: 1, aliases: ['Catalog']
  },
  {
    name: 'Freedom of Mind', slug: 'freedom-of-mind', description: 'The statement line - graphics for loud thoughts and quiet days.', imageUrl: '',
    visible: true, showOnHomepage: true, showOnShop: true, sortOrder: 2, aliases: []
  }
];

export const DEFAULT_STOREFRONT_SETTINGS = {
  storeName: 'Maria Clara Clothing',
  contactEmail: 'mariaclaraclothing@gmail.com',
  contactNumber: '09155003061',
  storeAddress: 'Bucandala IV, Imus City, Cavite',
  messengerUrl: 'https://m.me/mariaclaraclothing',
  socialLinks: {
    facebook: 'https://www.facebook.com/mariaclaraclothing',
    instagram: 'https://www.instagram.com/mariaclaraclothingshop/',
    tiktok: ''
  },
  metaPixel: {
    enabled: true,
    pixelId: '595813035761213',
    requireConsent: false
  },
  reviews: {
    enabled: true,
    showOnProductPages: true,
    showRatingsOnProductCards: true,
    allowCustomerSubmissions: true,
    autoPublishVerified: false,
    requireAdminApproval: true,
    showStoreReviews: false,
    allowReviewPhotos: true
  },
  shipping: {
    regions: [
      { id: 'metro_manila_cavite', label: 'Metro Manila & Cavite', feeCents: 8000, deliveryEstimate: 'Estimated delivery: Metro Manila and Cavite 2-4 days.' },
      { id: 'luzon', label: 'Luzon', feeCents: 12000, deliveryEstimate: 'Estimated delivery: Luzon provinces 3-6 days.' },
      { id: 'visayas_mindanao', label: 'Visayas & Mindanao', feeCents: 18000, deliveryEstimate: 'Estimated delivery: Visayas and Mindanao 5-8 days.' }
    ],
    freeShippingEnabled: true,
    freeShippingMinimumItems: 2
  },
  paymentMethods: [
    { id: 'cash_on_delivery', label: 'Cash on Delivery', instructions: '' }
  ],
  ticker: [
    'Free shipping on 2+ items',
    'Cash on delivery nationwide',
    '240 GSM premium cotton',
    'Ships via J&T Express'
  ],
  seo: {
    title: 'Maria Clara Clothing — Premium Philippine Streetwear',
    description: 'Oversized and crop-box 240 GSM cotton shirts. Cash on delivery nationwide. Free shipping on 2+ items.',
    imageUrl: '/brand/hero1v2-web.jpg'
  },
  hero: {
    eyebrow: '',
    title: 'Maria Clara',
    highlight: 'Clothing',
    subtitle: 'Oversized and crop-box tees in 240 GSM premium cotton. Cash on delivery nationwide, with free shipping when you grab two.',
    primaryButtonText: 'Shop new arrivals',
    primaryButtonLink: '#new-arrivals',
    secondaryButtonText: 'Freedom of Mind',
    secondaryButtonLink: '#freedom-of-mind'
  },
  maintenanceMode: false,
  infoPages: DEFAULT_INFO_PAGES,
  sizeChart: DEFAULT_SIZE_CHART,
  reportIssue: {
    enabled: true,
    buttonLabel: 'Report Issue',
    mobileButtonLabel: 'Issue?',
    position: 'bottom-right',
    notificationEmail: 'asparedestrends@gmail.com',
    webhookUrl: '',
    pushNotificationsEnabled: false
  },
  inventory: { lowStockThreshold: 12 },
  storefrontCollections: DEFAULT_COLLECTION_DEFINITIONS.map((collection) => collection.name),
  collectionDefinitions: DEFAULT_COLLECTION_DEFINITIONS,
  collectionCountdowns: {}
};

let settingsPromise = null;

export function invalidateStorefrontSettings() {
  settingsPromise = null;
}

export function loadStorefrontSettings() {
  if (!settingsPromise) {
    const bootstrappedRequest = typeof window !== 'undefined' &&
      window.__mariaClaraStorefrontSettingsPromise?.then
      ? window.__mariaClaraStorefrontSettingsPromise
      : null;
    const request = bootstrappedRequest || fetch('/api/storefront-settings', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Could not load storefront settings.');
        return response.json();
      })
      .then((body) => body.settings || {});

    settingsPromise = request
      .then((settings) => ({ ...DEFAULT_STOREFRONT_SETTINGS, ...(settings || {}) }))
      .catch(() => {
        settingsPromise = null;
        return DEFAULT_STOREFRONT_SETTINGS;
      });
  }
  return settingsPromise;
}

function findRegion(settings, region) {
  return settings.shipping.regions.find((candidate) => candidate.id === region) || null;
}

export function regionFee(settings, region) {
  const match = findRegion(settings, region);
  return match ? Number(match.feeCents) : 12000;
}

export function regionEstimate(settings, region) {
  const match = findRegion(settings, region);
  return match ? match.deliveryEstimate : 'Complete your address to see estimated delivery time.';
}

export function isFreeShipping(settings, quantity) {
  return settings.shipping.freeShippingEnabled && quantity >= settings.shipping.freeShippingMinimumItems;
}

export function freeShippingHint(settings, quantity) {
  if (!settings.shipping.freeShippingEnabled) return 'Standard shipping rates apply.';
  const needed = Math.max(0, settings.shipping.freeShippingMinimumItems - quantity);
  return `Add ${needed} more item${needed === 1 ? '' : 's'} to unlock FREE shipping.`;
}

function upsertMetaTag(attribute, name, content) {
  let tag = document.head.querySelector(`meta[${attribute}="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

export function applySeoTags(seo) {
  if (!seo) return;
  if (seo.title) document.title = seo.title;
  if (seo.description) upsertMetaTag('name', 'description', seo.description);
  if (seo.imageUrl) upsertMetaTag('property', 'og:image', seo.imageUrl);
}

export function useStorefrontSettings() {
  const [settings, setSettings] = useState(DEFAULT_STOREFRONT_SETTINGS);

  useEffect(() => {
    let active = true;
    loadStorefrontSettings().then((value) => {
      if (active) setSettings(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return settings;
}
