export const DEFAULT_INFO_PAGES = {
  faq: [
    { heading: 'How does Cash on Delivery work?', body: 'Place your order online — no payment needed. We text your mobile number to confirm, then ship via J&T Express. You pay the rider in cash when the parcel arrives.' },
    { heading: 'How long is delivery?', body: 'Metro Manila and Cavite: 2–4 days. Other Luzon provinces: 3–6 days. Visayas and Mindanao: 5–8 days. We confirm by text before shipping.' },
    { heading: 'How much is shipping?', body: 'Metro Manila & Cavite ₱80, Luzon ₱120, Visayas/Mindanao ₱180. Order any 2 items and shipping is free.' },
    { heading: 'What if my size is sold out?', body: 'Drops are limited runs. Follow our socials for restocks — once a run sells through, it usually does not return.' },
    { heading: 'What is 240 GSM cotton?', body: 'GSM is fabric weight. 240 GSM is heavyweight tee territory: structured, opaque, and it keeps its shape after repeated washing.' }
  ],
  shippingReturns: [
    { heading: 'Shipping coverage', body: 'We ship nationwide via J&T Express with structured Philippine addresses (province, city/municipality, barangay). Some barangays are not confirmed for door-to-door delivery; we review those orders before shipping and coordinate by text.' },
    { heading: 'Shipping rates', body: 'Metro Manila & Cavite ₱80 · Luzon ₱120 · Visayas/Mindanao ₱180. Free shipping on any order of 2 or more items.' },
    { heading: 'Order confirmation', body: 'Every COD order is confirmed by text message before it ships. Unreachable numbers may cause the order to be cancelled.' },
    { heading: 'Returns & exchanges', body: 'Wrong or damaged item? Message us within 7 days of delivery with photos and we will arrange a replacement. Items must be unworn and unwashed. Size exchanges are subject to stock availability; buyer shoulders return shipping for size exchanges.' }
  ],
  terms: [
    { heading: 'Orders', body: 'All orders are Cash on Delivery and are confirmed via text message before fulfillment. We reserve the right to cancel orders we cannot confirm.' },
    { heading: 'Pricing', body: 'Prices are in Philippine pesos and may change without notice. The price at the time of your order is what you pay.' },
    { heading: 'Product', body: 'Colors may vary slightly from photos due to screen settings and photography lighting. Measurements in size charts have a ±2cm tolerance.' },
    { heading: 'Privacy', body: 'Your name, mobile number, and address are used only to fulfill and deliver your order. We never sell your information.' },
    { heading: 'Contact', body: 'Questions about these terms? Reach us through our social channels or the contact details on your order confirmation text.' }
  ]
};

export const DEFAULT_STOREFRONT_SETTINGS = {
  storeName: 'Maria Clara Clothing',
  contactEmail: '',
  contactNumber: '',
  storeAddress: '',
  socialLinks: { facebook: '', instagram: '', tiktok: '' },
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
    imageUrl: ''
  },
  maintenanceMode: false,
  infoPages: DEFAULT_INFO_PAGES
};

let settingsPromise = null;

export function loadStorefrontSettings() {
  if (!settingsPromise) {
    settingsPromise = fetch('/api/storefront-settings', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Could not load storefront settings.');
        return response.json();
      })
      .then((body) => ({ ...DEFAULT_STOREFRONT_SETTINGS, ...(body.settings || {}) }))
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
  return `Add ${needed} more item${needed === 1 ? '' : 's'} to unlock free shipping.`;
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
