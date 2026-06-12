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
  ]
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
