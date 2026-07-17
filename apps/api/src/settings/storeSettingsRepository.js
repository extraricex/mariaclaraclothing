const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { hasDatabaseUrl, query, transaction } = require('../db/postgres');

const DEFAULT_SETTINGS_FILE = path.join(__dirname, '..', '..', 'data', 'store-settings.json');
const DEFAULT_CREDENTIALS_FILE = path.join(__dirname, '..', '..', 'data', 'admin-credentials.json');
const SETTINGS_KEY = 'storeSettings';
const CREDENTIALS_KEY = 'adminCredentials';
const SETTINGS_SECTIONS = ['general', 'shipping', 'payments', 'website', 'inventory', 'authentication', 'marketing', 'reviews', 'orderNotifications'];
const WEBSITE_INFO_PAGE_KEYS = ['faq', 'shippingReturns', 'terms'];
const SHIPPING_REGION_IDS = ['metro_manila_cavite', 'luzon', 'visayas_mindanao'];
const PAYMENT_METHOD_IDS = ['cash_on_delivery', 'paymongo', 'gcash', 'bank_transfer'];
const DEFAULT_COLLECTION_DEFINITIONS = [
  {
    name: 'New Arrivals',
    slug: 'new-arrivals',
    description: 'Explore the latest Maria Clara Clothing releases in oversized, regular-fit, and crop-box cuts. Each product page shows current size availability, measurements, price, and delivery information.',
    imageUrl: '',
    visible: true,
    showOnHomepage: true,
    showOnShop: true,
    sortOrder: 0,
    aliases: []
  },
  {
    name: 'Tees',
    slug: 'tees',
    description: 'Shop Maria Clara Clothing tees in oversized, regular-fit, and crop-box cuts made for everyday streetwear. Compare real garment measurements and available sizes before ordering.',
    imageUrl: '',
    visible: true,
    showOnHomepage: true,
    showOnShop: true,
    sortOrder: 1,
    aliases: ['Catalog']
  },
  {
    name: 'Freedom of Mind',
    slug: 'freedom-of-mind',
    description: 'The statement line - graphics for loud thoughts and quiet days.',
    imageUrl: '',
    visible: true,
    showOnHomepage: true,
    showOnShop: true,
    sortOrder: 2,
    aliases: []
  }
];
const DEFAULT_STOREFRONT_COLLECTIONS = DEFAULT_COLLECTION_DEFINITIONS.map((collection) => collection.name);
const DEFAULT_COUNTDOWN_MESSAGE = 'Hurry! Limited time left';

let postgresCredentialsCache = { loaded: false, value: null };

function settingsDataFile() {
  return process.env.STORE_SETTINGS_FILE || DEFAULT_SETTINGS_FILE;
}

function credentialsDataFile() {
  return process.env.ADMIN_CREDENTIALS_FILE || DEFAULT_CREDENTIALS_FILE;
}

function usePostgresSettings() {
  return hasDatabaseUrl() && !process.env.STORE_SETTINGS_FILE;
}

function usePostgresCredentials() {
  return hasDatabaseUrl() && !process.env.ADMIN_CREDENTIALS_FILE;
}

function isPromise(value) {
  return Boolean(value) && typeof value.then === 'function';
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function defaultCollectionCountdown() {
  return {
    enabled: false,
    message: DEFAULT_COUNTDOWN_MESSAGE,
    durationSeconds: 2 * 60 * 60,
    revision: 0
  };
}

function defaultCollectionCountdowns(collections = DEFAULT_STOREFRONT_COLLECTIONS) {
  return Object.fromEntries(collections.map((name) => [name, defaultCollectionCountdown()]));
}

function normalizeCollectionName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) throw badRequest('Collection name is required.');
  if (name.length > 60) throw badRequest('Collection name must be 60 characters or fewer.');
  return name;
}

function collectionSlug(value, fallbackName = '') {
  const incoming = String(value || '').trim().toLowerCase();
  const slug = (incoming || String(fallbackName || '').trim().toLowerCase())
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) throw badRequest('Collection slug is required.');
  if (slug.length > 80) throw badRequest('Collection slug must be 80 characters or fewer.');
  return slug;
}

function normalizeCollectionImageUrl(value) {
  const imageUrl = String(value || '').trim();
  if (!imageUrl) return '';
  const localPath = imageUrl.startsWith('/') && !imageUrl.startsWith('//');
  if (imageUrl.length > 500 || (!localPath && !/^https:\/\//i.test(imageUrl))) {
    throw badRequest('Collection image must use an HTTPS URL or an uploaded image path.');
  }
  return imageUrl;
}

function normalizeCollectionSeoText(value, fallback, label, maxLength) {
  const text = String(value === undefined ? fallback || '' : value).trim().replace(/\s+/g, ' ');
  if (text.length > maxLength) throw badRequest(`${label} must be ${maxLength} characters or fewer.`);
  if (/[<>]/.test(text)) throw badRequest(`${label} must be plain text without HTML.`);
  return text;
}

function normalizeCanonicalOverride(value, fallback = '') {
  const input = String(value === undefined ? fallback : value).trim();
  if (!input) return '';
  if (input.length > 500) throw badRequest('Canonical URL must be 500 characters or fewer.');
  if (input.startsWith('/') && !input.startsWith('//')) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:') throw new Error('HTTPS required');
    return url.toString();
  } catch (_error) {
    throw badRequest('Canonical URL must be an HTTPS URL or a site-relative path.');
  }
}

function normalizeKeywordList(value, fallback = []) {
  const incoming = value === undefined ? fallback : value;
  const values = Array.isArray(incoming) ? incoming : String(incoming || '').split(',');
  const keywords = [...new Set(values.map((item) => String(item || '').trim().replace(/\s+/g, ' ')).filter(Boolean))];
  if (keywords.length > 20 || keywords.some((keyword) => keyword.length > 80 || /[<>]/.test(keyword))) {
    throw badRequest('Use up to 20 plain-text secondary keywords of 80 characters or fewer.');
  }
  return keywords;
}

function normalizeCollectionUrlAliases(value, fallback = [], currentSlug = '') {
  const aliases = [...new Set([
    ...(Array.isArray(fallback) ? fallback : []),
    ...(Array.isArray(value) ? value : [])
  ].map((item) => collectionSlug(item)).filter((item) => item && item !== currentSlug))];
  if (aliases.length > 30) throw badRequest('Collection URL history is limited to 30 aliases.');
  return aliases;
}

function normalizeCollectionDefinition(value, index, fallback = {}) {
  const input = value && typeof value === 'object' ? value : { name: value };
  const name = normalizeCollectionName(input.name === undefined ? fallback.name : input.name);
  const description = String(input.description === undefined ? fallback.description || '' : input.description).trim();
  if (description.length > 500) throw badRequest('Collection description must be 500 characters or fewer.');
  const sortOrder = Number(input.sortOrder === undefined ? fallback.sortOrder ?? index : input.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    throw badRequest('Collection sort order must be an integer between 0 and 9999.');
  }
  const aliases = [...new Set([
    ...(Array.isArray(fallback.aliases) ? fallback.aliases : []),
    ...(Array.isArray(input.aliases) ? input.aliases : [])
  ].map((alias) => String(alias || '').trim()).filter(Boolean))]
    .filter((alias) => alias.toLowerCase() !== name.toLowerCase());
  const bestSeller = ['best seller', 'best sellers'].includes(name.toLowerCase());
  const slug = collectionSlug(input.slug === undefined ? fallback.slug : input.slug, name);
  return {
    name,
    slug,
    description,
    introText: normalizeCollectionSeoText(input.introText, fallback.introText || description, 'Collection introduction', 1000),
    supportingText: normalizeCollectionSeoText(input.supportingText, fallback.supportingText, 'Collection supporting text', 5000),
    seoTitle: normalizeCollectionSeoText(input.seoTitle, fallback.seoTitle, 'Collection SEO title', 200),
    metaDescription: normalizeCollectionSeoText(input.metaDescription, fallback.metaDescription, 'Collection meta description', 500),
    mainKeyword: normalizeCollectionSeoText(input.mainKeyword, fallback.mainKeyword, 'Collection main keyword', 80),
    secondaryKeywords: normalizeKeywordList(input.secondaryKeywords, fallback.secondaryKeywords),
    canonicalUrl: normalizeCanonicalOverride(input.canonicalUrl, fallback.canonicalUrl),
    indexable: input.indexable === undefined ? fallback.indexable !== false : Boolean(input.indexable),
    ogImageUrl: normalizeCollectionImageUrl(input.ogImageUrl === undefined ? fallback.ogImageUrl : input.ogImageUrl),
    imageUrl: normalizeCollectionImageUrl(input.imageUrl === undefined ? fallback.imageUrl : input.imageUrl),
    visible: input.visible === undefined ? fallback.visible !== false : Boolean(input.visible),
    showOnHomepage: input.showOnHomepage === undefined
      ? (bestSeller ? false : fallback.showOnHomepage !== false)
      : Boolean(input.showOnHomepage),
    showOnShop: input.showOnShop === undefined ? fallback.showOnShop !== false : Boolean(input.showOnShop),
    sortOrder,
    aliases,
    urlAliases: normalizeCollectionUrlAliases(input.urlAliases, fallback.urlAliases, slug)
  };
}

function normalizeCollectionDefinitions(value, legacyNames) {
  const incoming = Array.isArray(value) ? value : [];
  const legacy = Array.isArray(legacyNames) ? legacyNames : [];
  const merged = DEFAULT_COLLECTION_DEFINITIONS.map((collection) => ({ ...collection }));

  for (const item of incoming) {
    const rawName = typeof item === 'object' ? item?.name : item;
    const rawSlug = typeof item === 'object' ? String(item?.slug || '').trim().toLowerCase() : '';
    const rawAliases = typeof item === 'object' && Array.isArray(item?.aliases)
      ? item.aliases.map((alias) => String(alias || '').trim().toLowerCase())
      : [];
    const normalizedName = String(rawName || '').trim().toLowerCase();
    const index = merged.findIndex((existing) => (
      existing.name.toLowerCase() === normalizedName ||
      (rawSlug && existing.slug === rawSlug) ||
      rawAliases.includes(existing.name.toLowerCase())
    ));
    const record = typeof item === 'object' ? item : { name: item };
    if (index >= 0) merged[index] = { ...merged[index], ...record };
    else merged.push(record);
  }
  for (const name of legacy) {
    if (!merged.some((existing) => String(existing?.name || existing).trim().toLowerCase() === String(name || '').trim().toLowerCase())) {
      merged.push({ name });
    }
  }

  const definitions = merged.map((item, index) => {
    const fallback = DEFAULT_COLLECTION_DEFINITIONS.find((collection) => collection.name.toLowerCase() === String(item?.name || item).trim().toLowerCase()) || {};
    return normalizeCollectionDefinition(item, index, fallback);
  });
  const duplicateName = definitions.find((collection, index) => definitions.findIndex((candidate) => candidate.name.toLowerCase() === collection.name.toLowerCase()) !== index);
  if (duplicateName) throw conflict('Collection names must be unique.');
  const duplicateSlug = definitions.find((collection, index) => definitions.findIndex((candidate) => candidate.slug === collection.slug) !== index);
  if (duplicateSlug) throw conflict('Collection slugs must be unique.');
  const routes = new Map();
  for (const collection of definitions) {
    for (const route of [collection.slug, ...(collection.urlAliases || [])]) {
      const owner = routes.get(route);
      if (owner && owner !== collection.slug) throw conflict(`Collection URL "${route}" is already in use.`);
      routes.set(route, collection.slug);
    }
  }
  return definitions.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

function defaultStoreSettings() {
  const collectionDefinitions = DEFAULT_COLLECTION_DEFINITIONS.map((collection) => ({ ...collection, aliases: [...collection.aliases] }));
  const storefrontCollections = collectionDefinitions.map((collection) => collection.name);
  return {
    general: {
      storeName: 'Maria Clara Clothing',
      contactEmail: 'mariaclaraclothing@gmail.com',
      contactNumber: '09155003061',
      storeAddress: 'Bucandala IV, Imus City, Cavite',
      messengerUrl: 'https://m.me/mariaclaraclothing',
      socialLinks: {
        facebook: 'https://www.facebook.com/mariaclaraclothing',
        instagram: 'https://www.instagram.com/mariaclaraclothingshop/',
        tiktok: ''
      }
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
    payments: {
      methods: [
        { id: 'cash_on_delivery', label: 'Cash on Delivery', enabled: true, instructions: '' },
        { id: 'paymongo', label: 'Online Payment via PayMongo', enabled: false, instructions: 'Continue to PayMongo secure checkout. The payment methods currently available for your order will appear there. Your order is confirmed only after PayMongo verifies payment.' },
        { id: 'gcash', label: 'GCash', enabled: false, instructions: '' },
        { id: 'bank_transfer', label: 'Bank Transfer', enabled: false, instructions: '' }
      ]
    },
    authentication: {
      googleEnabled: true,
      facebookEnabled: true
    },
    marketing: {
      metaPixel: {
        enabled: true,
        pixelId: '595813035761213',
        requireConsent: true
      }
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
    orderNotifications: {
      enabled: true,
      primaryRecipientEmail: '',
      additionalRecipientEmails: [],
      sendPaymongoPaymentConfirmation: false,
      maximumRetryAttempts: 8
    },
    website: {
      ticker: [
        'Free shipping on 2+ items',
        'Cash on delivery nationwide',
        '240 GSM premium cotton',
        'Ships via J&T Express'
      ],
      seo: {
        title: 'Maria Clara Clothing | Premium Filipino Streetwear',
        description: 'Shop oversized, regular-fit, and crop-box T-shirts from Maria Clara Clothing, a Philippine streetwear brand with nationwide online ordering.',
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
      infoPages: {
        faq: [
          { heading: 'How does Cash on Delivery work?', body: 'Place your order online — no advance payment needed. Our team reviews your order and may contact you by text or phone before shipping via J&T Express. You pay the rider in cash when the parcel arrives.' },
          { heading: 'How does online payment work?', body: 'Choose Online Payment at checkout to continue to PayMongo. The payment methods currently available for your order appear on the secure PayMongo page. Your order is confirmed after PayMongo verifies successful payment.' },
          { heading: 'How long is delivery?', body: 'Metro Manila and Cavite: 2–4 days. Other Luzon provinces: 3–6 days. Visayas and Mindanao: 5–8 days. Estimates begin after your order is reviewed and prepared for shipment.' },
          { heading: 'How much is shipping?', body: 'Metro Manila & Cavite ₱80, Luzon ₱120, Visayas/Mindanao ₱180. Order any 2 items and shipping is free.' },
          { heading: 'What if my size is sold out?', body: 'Check the product page for current size availability and follow our social channels for confirmed restock announcements.' },
          { heading: 'What is 240 GSM cotton?', body: 'GSM means grams per square metre and describes fabric weight. A 240 GSM shirt uses more fabric weight than a lightweight tee, which can give it a heavier, more structured feel. Check the exact product details before ordering.' }
        ],
        shippingReturns: [
          { heading: 'Shipping coverage', body: 'We ship nationwide via J&T Express with structured Philippine addresses (province, city/municipality, barangay). Some barangays are not confirmed for door-to-door delivery; we review those orders before shipping and coordinate by text.' },
          { heading: 'Shipping rates', body: 'Metro Manila & Cavite ₱80 · Luzon ₱120 · Visayas/Mindanao ₱180. Free shipping on any order of 2 or more items.' },
          { heading: 'Order confirmation', body: 'We review every COD order before shipment and may contact you by text or phone. Orders with invalid or unreachable contact details may be held or cancelled.' },
          { heading: 'Returns & exchanges', body: 'Wrong or damaged item? Message us within 7 days of delivery with photos and we will arrange a replacement. Items must be unworn and unwashed. Size exchanges are subject to stock availability; buyer shoulders return shipping for size exchanges.' }
        ],
        terms: [
          { heading: 'Orders', body: 'Orders may use any enabled payment method shown at checkout, including Cash on Delivery or secure online payment through PayMongo. COD orders are reviewed before fulfillment, and online-payment orders are confirmed only after the payment provider verifies payment. We may contact you by text or phone and may hold or cancel orders with invalid or unreachable contact details.' },
          { heading: 'Pricing', body: 'Prices are in Philippine pesos and may change without notice. The price at the time of your order is what you pay.' },
          { heading: 'Size Chart', body: 'Check the size chart before ordering. Measurements have a ±2cm tolerance and size exchanges depend on available stock.', linkText: 'View Size Chart', linkHref: '/size-chart' },
          { heading: 'Privacy', body: 'We use your name, mobile number, and address to fulfill and deliver orders. The customer website also uses the Facebook Meta Pixel to send page visits and shopping actions to Meta for advertising measurement. When an order is completed, our server may send purchase details and hashed contact details to Meta through the Conversions API to match the purchase without sending your delivery address. Meta handles this information under its own privacy policy. We do not sell your personal information.' },
          { heading: 'Contact', body: 'Questions about these terms? Reach us through our social channels or the contact details on your order confirmation text.' }
        ]
      },
      sizeChart: {
        imageUrl: '/brand/size-chart.jpg',
        altText: 'Maria Clara Clothing oversized shirt size chart'
      },
      reportIssue: {
        enabled: true,
        buttonLabel: 'Report Issue',
        mobileButtonLabel: 'Issue?',
        position: 'bottom-right',
        notificationEmail: 'mariaclaraclothing@gmail.com',
        webhookUrl: '',
        pushNotificationsEnabled: false
      }
    },
    inventory: {
      lowStockThreshold: 12
    },
    storefrontCollections,
    collectionDefinitions,
    collectionCountdowns: defaultCollectionCountdowns(storefrontCollections)
  };
}

function normalizeCollectionCountdown(value, fallback) {
  const input = value && typeof value === 'object' ? value : {};
  const enabled = input.enabled === undefined ? fallback.enabled : Boolean(input.enabled);
  const message = String(input.message === undefined ? fallback.message : input.message).trim();
  const durationSeconds = Number(input.durationSeconds === undefined
    ? fallback.durationSeconds
    : input.durationSeconds);
  const revision = Number(input.revision === undefined ? fallback.revision : input.revision);

  if (message.length > 120) throw badRequest('Countdown message must be 120 characters or fewer.');
  if (enabled && !message) throw badRequest('Countdown message is required when enabled.');
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 359999) {
    throw badRequest('Countdown duration must be an integer between 1 and 359999 seconds.');
  }
  if (!Number.isInteger(revision) || revision < 0) {
    throw badRequest('Countdown revision is invalid.');
  }
  return { enabled, message, durationSeconds, revision };
}

function normalizeCollectionCountdowns(value, collections) {
  const input = value && typeof value === 'object' ? value : {};
  const defaults = defaultCollectionCountdowns(collections);
  return Object.fromEntries(collections.map((name) => [
    name,
    normalizeCollectionCountdown(input[name], defaults[name])
  ]));
}

function normalizeMessengerUrl(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  let parsed;
  try {
    parsed = new URL(input);
  } catch (_error) {
    throw badRequest('Enter a valid Messenger URL.');
  }
  const hosts = new Set([
    'm.me',
    'messenger.com',
    'www.messenger.com',
    'facebook.com',
    'www.facebook.com'
  ]);
  if (parsed.protocol !== 'https:' || !hosts.has(parsed.hostname.toLowerCase())) {
    throw badRequest('Messenger URL must use HTTPS and point to Messenger or Facebook.');
  }
  return parsed.toString();
}

function normalizeGeneral(general) {
  const value = general && typeof general === 'object' ? general : {};
  const defaults = defaultStoreSettings().general;
  const socialLinks = value.socialLinks && typeof value.socialLinks === 'object' ? value.socialLinks : {};
  const contactEmail = String(value.contactEmail || '').trim();
  if (contactEmail && !contactEmail.includes('@')) {
    throw badRequest('Contact email is invalid.');
  }
  return {
    storeName: String(value.storeName || '').trim() || 'Maria Clara Clothing',
    contactEmail,
    contactNumber: String(value.contactNumber || '').trim(),
    storeAddress: String(value.storeAddress || '').trim(),
    messengerUrl: normalizeMessengerUrl(value.messengerUrl === undefined ? defaults.messengerUrl : value.messengerUrl),
    socialLinks: {
      facebook: String(socialLinks.facebook === undefined ? defaults.socialLinks.facebook : socialLinks.facebook).trim(),
      instagram: String(socialLinks.instagram === undefined ? defaults.socialLinks.instagram : socialLinks.instagram).trim(),
      tiktok: String(socialLinks.tiktok || '').trim()
    }
  };
}

function normalizeShipping(shipping) {
  const value = shipping && typeof shipping === 'object' ? shipping : {};
  const defaults = defaultStoreSettings().shipping;
  const incoming = Array.isArray(value.regions) ? value.regions : [];

  const unknownRegion = incoming.find((region) => region && !SHIPPING_REGION_IDS.includes(region.id));
  if (unknownRegion) {
    throw badRequest('Shipping region is invalid.');
  }

  const regions = defaults.regions.map((fallback) => {
    const match = incoming.find((region) => region && region.id === fallback.id) || {};
    const feeCents = match.feeCents === undefined ? fallback.feeCents : Number(match.feeCents);
    if (!Number.isInteger(feeCents) || feeCents < 0) {
      throw badRequest(`Shipping fee for ${fallback.label} must be a non-negative integer of centavos.`);
    }
    return {
      id: fallback.id,
      label: String(match.label || fallback.label).trim() || fallback.label,
      feeCents,
      deliveryEstimate: String(match.deliveryEstimate || fallback.deliveryEstimate).trim() || fallback.deliveryEstimate
    };
  });

  const freeShippingMinimumItems = value.freeShippingMinimumItems === undefined
    ? defaults.freeShippingMinimumItems
    : Number(value.freeShippingMinimumItems);
  if (!Number.isInteger(freeShippingMinimumItems) || freeShippingMinimumItems < 1) {
    throw badRequest('Free shipping minimum items must be an integer of at least 1.');
  }

  return {
    regions,
    freeShippingEnabled: value.freeShippingEnabled === undefined
      ? defaults.freeShippingEnabled
      : Boolean(value.freeShippingEnabled),
    freeShippingMinimumItems
  };
}

function normalizePayments(payments) {
  const value = payments && typeof payments === 'object' ? payments : {};
  const defaults = defaultStoreSettings().payments;
  const incoming = Array.isArray(value.methods) ? value.methods : [];

  const unknownMethod = incoming.find((method) => method && !PAYMENT_METHOD_IDS.includes(method.id));
  if (unknownMethod) {
    throw badRequest('Payment method is invalid.');
  }

  const methods = defaults.methods.map((fallback) => {
    const match = incoming.find((method) => method && method.id === fallback.id) || {};
    const enabled = match.enabled === undefined ? fallback.enabled : Boolean(match.enabled);
    if (fallback.id === 'cash_on_delivery' && !enabled) throw badRequest('Cash on Delivery cannot be disabled.');
    return {
      id: fallback.id,
      label: String(match.label || fallback.label).trim() || fallback.label,
      enabled,
      instructions: String(match.instructions || '').trim()
    };
  });

  return { methods };
}

function normalizeTicker(ticker) {
  if (!Array.isArray(ticker) || ticker.length < 1 || ticker.length > 8) {
    throw badRequest('Ticker must have 1 to 8 items.');
  }
  return ticker.map((item) => {
    const text = String(item || '').trim();
    if (!text) {
      throw badRequest('Ticker items must be non-empty text.');
    }
    return text;
  });
}

function normalizeSeo(seo, current) {
  const value = seo && typeof seo === 'object' ? seo : {};
  return {
    title: String(value.title || '').trim() || current.title,
    description: String(value.description || '').trim() || current.description,
    imageUrl: String(value.imageUrl || '').trim()
  };
}

function normalizeHeroButtonLink(value, fallback) {
  const input = String(value === undefined ? fallback : value).trim();
  if (!input) return fallback;
  if (input.startsWith('#') || input.startsWith('/')) return input;
  let parsed;
  try {
    parsed = new URL(input);
  } catch (_error) {
    throw badRequest('Hero button links must be HTTPS, a site path, or an in-page anchor.');
  }
  if (parsed.protocol !== 'https:') {
    throw badRequest('Hero button links must be HTTPS, a site path, or an in-page anchor.');
  }
  return parsed.toString();
}

function normalizeHeroText(value, fallback, label, maxLength, required = true) {
  const text = String(value === undefined ? fallback : value).trim().replace(/\s+/g, ' ');
  if (required && !text) throw badRequest(`${label} is required.`);
  if (text.length > maxLength) throw badRequest(`${label} must be ${maxLength} characters or fewer.`);
  return text;
}

function normalizeHero(hero, current) {
  const value = hero && typeof hero === 'object' ? hero : {};
  const fallback = current || defaultStoreSettings().website.hero;
  return {
    eyebrow: normalizeHeroText(value.eyebrow, fallback.eyebrow, 'Hero small text', 80, false),
    title: normalizeHeroText(value.title, fallback.title, 'Hero title', 48),
    highlight: normalizeHeroText(value.highlight, fallback.highlight, 'Hero highlight text', 48),
    subtitle: normalizeHeroText(value.subtitle, fallback.subtitle, 'Hero subtitle', 220, false),
    primaryButtonText: normalizeHeroText(value.primaryButtonText, fallback.primaryButtonText, 'Primary hero button text', 40),
    primaryButtonLink: normalizeHeroButtonLink(value.primaryButtonLink, fallback.primaryButtonLink),
    secondaryButtonText: normalizeHeroText(value.secondaryButtonText, fallback.secondaryButtonText, 'Secondary hero button text', 40),
    secondaryButtonLink: normalizeHeroButtonLink(value.secondaryButtonLink, fallback.secondaryButtonLink)
  };
}

function normalizeInfoPages(infoPages, current) {
  const value = infoPages && typeof infoPages === 'object' ? infoPages : {};
  const unknownPage = Object.keys(value).find((key) => !WEBSITE_INFO_PAGE_KEYS.includes(key));
  if (unknownPage) {
    throw badRequest('Info page is invalid.');
  }
  const result = {};
  for (const key of WEBSITE_INFO_PAGE_KEYS) {
    if (value[key] === undefined) {
      result[key] = current[key];
      continue;
    }
    const rows = Array.isArray(value[key]) ? value[key] : null;
    if (!rows || rows.length < 1 || rows.length > 30) {
      throw badRequest('Info pages must have 1 to 30 sections.');
    }
    result[key] = rows.map((row) => {
      const heading = String(row?.heading || '').trim();
      const body = String(row?.body || '').trim();
      if (!heading || !body) {
        throw badRequest('Info page sections need a heading and body.');
      }
      const normalized = { heading, body };
      const linkText = String(row?.linkText || '').trim();
      const linkHref = String(row?.linkHref || '').trim();
      const imageUrl = String(row?.imageUrl || '').trim();
      const imageAltText = String(row?.imageAltText || '').trim();
      if (linkText && linkHref) {
        normalized.linkText = linkText;
        normalized.linkHref = normalizeHeroButtonLink(linkHref, linkHref);
      }
      if (imageUrl) {
        normalized.imageUrl = normalizeHeroButtonLink(imageUrl, imageUrl);
        normalized.imageAltText = imageAltText;
      }
      return normalized;
    });
  }
  return result;
}

function normalizeSizeChart(sizeChart, current = defaultStoreSettings().website.sizeChart) {
  const value = sizeChart && typeof sizeChart === 'object' ? sizeChart : {};
  const imageUrl = String(value.imageUrl === undefined ? current.imageUrl : value.imageUrl).trim();
  const altText = String(value.altText === undefined ? current.altText : value.altText).trim();
  return {
    imageUrl: imageUrl ? normalizeHeroButtonLink(imageUrl, imageUrl) : '',
    altText: altText || 'Maria Clara Clothing size chart'
  };
}

function normalizeReportIssue(reportIssue, current = defaultStoreSettings().website.reportIssue) {
  const value = reportIssue && typeof reportIssue === 'object' ? reportIssue : {};
  const position = String(value.position === undefined ? current.position : value.position).trim();
  if (!['bottom-right', 'bottom-left'].includes(position)) {
    throw badRequest('Issue button position is invalid.');
  }
  const notificationEmail = String(value.notificationEmail === undefined ? current.notificationEmail : value.notificationEmail).trim();
  if (notificationEmail && !notificationEmail.includes('@')) {
    throw badRequest('Issue notification email is invalid.');
  }
  const webhookUrl = String(value.webhookUrl === undefined ? current.webhookUrl : value.webhookUrl).trim();
  if (webhookUrl) normalizeHeroButtonLink(webhookUrl, webhookUrl);
  return {
    enabled: value.enabled === undefined ? Boolean(current.enabled) : Boolean(value.enabled),
    buttonLabel: normalizeHeroText(value.buttonLabel, current.buttonLabel || 'Report Issue', 'Issue button label', 28),
    mobileButtonLabel: normalizeHeroText(value.mobileButtonLabel, current.mobileButtonLabel || 'Issue?', 'Mobile issue button label', 16),
    position,
    notificationEmail,
    webhookUrl,
    pushNotificationsEnabled: value.pushNotificationsEnabled === undefined
      ? Boolean(current.pushNotificationsEnabled)
      : Boolean(value.pushNotificationsEnabled)
  };
}

function normalizeWebsite(website, current = defaultStoreSettings().website) {
  const value = website && typeof website === 'object' ? website : {};
  return {
    ticker: value.ticker === undefined ? current.ticker : normalizeTicker(value.ticker),
    seo: value.seo === undefined ? current.seo : normalizeSeo(value.seo, current.seo),
    hero: value.hero === undefined ? normalizeHero(current.hero, defaultStoreSettings().website.hero) : normalizeHero(value.hero, current.hero),
    maintenanceMode: value.maintenanceMode === undefined ? current.maintenanceMode : Boolean(value.maintenanceMode),
    infoPages: value.infoPages === undefined ? current.infoPages : normalizeInfoPages(value.infoPages, current.infoPages),
    sizeChart: value.sizeChart === undefined ? normalizeSizeChart(current.sizeChart) : normalizeSizeChart(value.sizeChart, current.sizeChart),
    reportIssue: value.reportIssue === undefined ? normalizeReportIssue(current.reportIssue) : normalizeReportIssue(value.reportIssue, current.reportIssue)
  };
}

function normalizeInventory(inventory) {
  const value = inventory && typeof inventory === 'object' ? inventory : {};
  const defaults = defaultStoreSettings().inventory;
  const lowStockThreshold = value.lowStockThreshold === undefined
    ? defaults.lowStockThreshold
    : Number(value.lowStockThreshold);
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 1 || lowStockThreshold > 999) {
    throw badRequest('Low stock threshold must be an integer between 1 and 999.');
  }
  return { lowStockThreshold };
}

function normalizeAuthentication(authentication) {
  const value = authentication && typeof authentication === 'object' ? authentication : {};
  const defaults = defaultStoreSettings().authentication;
  return {
    googleEnabled: value.googleEnabled === undefined ? defaults.googleEnabled : Boolean(value.googleEnabled),
    facebookEnabled: value.facebookEnabled === undefined ? defaults.facebookEnabled : Boolean(value.facebookEnabled)
  };
}

function normalizeMarketing(marketing) {
  const value = marketing && typeof marketing === 'object' ? marketing : {};
  const incoming = value.metaPixel && typeof value.metaPixel === 'object' ? value.metaPixel : {};
  const defaults = defaultStoreSettings().marketing.metaPixel;
  const enabled = incoming.enabled === undefined ? defaults.enabled : Boolean(incoming.enabled);
  const pixelId = String(incoming.pixelId === undefined ? defaults.pixelId : incoming.pixelId).trim();
  if (pixelId && !/^\d{5,30}$/.test(pixelId)) {
    throw badRequest('Meta Pixel ID must contain 5 to 30 digits.');
  }
  if (enabled && !pixelId) throw badRequest('Meta Pixel ID is required when Meta Pixel is enabled.');
  return {
    metaPixel: {
      enabled,
      pixelId,
      requireConsent: incoming.requireConsent === undefined ? defaults.requireConsent : Boolean(incoming.requireConsent)
    }
  };
}

function normalizeReviews(reviews) {
  const value = reviews && typeof reviews === 'object' ? reviews : {};
  const defaults = defaultStoreSettings().reviews;
  return Object.fromEntries(Object.keys(defaults).map((key) => [
    key,
    value[key] === undefined ? defaults[key] : Boolean(value[key])
  ]));
}

function normalizeNotificationEmail(value, label, { required = false } = {}) {
  const email = String(value || '').trim().toLowerCase();
  if (!email && !required) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw badRequest(`${label} is invalid.`);
  }
  return email;
}

function normalizeOrderNotifications(orderNotifications) {
  const value = orderNotifications && typeof orderNotifications === 'object' ? orderNotifications : {};
  const defaults = defaultStoreSettings().orderNotifications;
  const primaryRecipientEmail = normalizeNotificationEmail(
    value.primaryRecipientEmail === undefined ? defaults.primaryRecipientEmail : value.primaryRecipientEmail,
    'Primary order-notification email'
  );
  const incomingAdditional = value.additionalRecipientEmails === undefined
    ? defaults.additionalRecipientEmails
    : Array.isArray(value.additionalRecipientEmails)
      ? value.additionalRecipientEmails
      : String(value.additionalRecipientEmails || '').split(',');
  const additionalRecipientEmails = [...new Set(incomingAdditional
    .map((email) => normalizeNotificationEmail(email, 'Additional order-notification email'))
    .filter((email) => email && email !== primaryRecipientEmail))];
  if (additionalRecipientEmails.length > 10) {
    throw badRequest('Use no more than 10 additional order-notification recipients.');
  }
  const maximumRetryAttempts = Number(value.maximumRetryAttempts === undefined
    ? defaults.maximumRetryAttempts
    : value.maximumRetryAttempts);
  if (!Number.isInteger(maximumRetryAttempts) || maximumRetryAttempts < 1 || maximumRetryAttempts > 20) {
    throw badRequest('Maximum order-notification retry attempts must be an integer from 1 to 20.');
  }
  return {
    enabled: value.enabled === undefined ? defaults.enabled : Boolean(value.enabled),
    primaryRecipientEmail,
    additionalRecipientEmails,
    sendPaymongoPaymentConfirmation: value.sendPaymongoPaymentConfirmation === undefined
      ? defaults.sendPaymongoPaymentConfirmation
      : Boolean(value.sendPaymongoPaymentConfirmation),
    maximumRetryAttempts
  };
}

function normalizeStoreSettings(settings) {
  const value = settings && typeof settings === 'object' ? settings : {};
  const collectionDefinitions = normalizeCollectionDefinitions(value.collectionDefinitions, value.storefrontCollections);
  const storefrontCollections = collectionDefinitions.map((collection) => collection.name);
  return {
    general: normalizeGeneral(value.general),
    shipping: normalizeShipping(value.shipping),
    payments: normalizePayments(value.payments),
    website: normalizeWebsite(value.website),
    inventory: normalizeInventory(value.inventory),
    authentication: normalizeAuthentication(value.authentication),
    marketing: normalizeMarketing(value.marketing),
    reviews: normalizeReviews(value.reviews),
    orderNotifications: normalizeOrderNotifications(value.orderNotifications),
    storefrontCollections,
    collectionDefinitions,
    collectionCountdowns: normalizeCollectionCountdowns(value.collectionCountdowns, storefrontCollections)
  };
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readPostgresValue(key) {
  const result = await query('SELECT value FROM store_settings WHERE key = $1', [key]);
  return result.rows[0]?.value || null;
}

async function writePostgresValue(key, value) {
  await query(
    `INSERT INTO store_settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

function getStoreSettings() {
  if (usePostgresSettings()) {
    return readPostgresValue(SETTINGS_KEY).then((stored) => normalizeStoreSettings(stored || {}));
  }
  return normalizeStoreSettings(readJsonFile(settingsDataFile()) || {});
}

function normalizeSectionValue(section, value, current) {
  if (section === 'general') return normalizeGeneral(value);
  if (section === 'shipping') return normalizeShipping(value);
  if (section === 'payments') return normalizePayments(value);
  if (section === 'inventory') return normalizeInventory(value);
  if (section === 'authentication') return normalizeAuthentication(value);
  if (section === 'marketing') return normalizeMarketing(value);
  if (section === 'reviews') return normalizeReviews(value);
  if (section === 'orderNotifications') return normalizeOrderNotifications(value);
  return normalizeWebsite(value, current.website);
}

function updateSettingsSection(section, value) {
  if (!SETTINGS_SECTIONS.includes(section)) {
    throw badRequest('Settings section is invalid.');
  }

  if (usePostgresSettings()) {
    return readPostgresValue(SETTINGS_KEY).then(async (stored) => {
      const current = normalizeStoreSettings(stored || {});
      const next = { ...current, [section]: normalizeSectionValue(section, value, current) };
      await writePostgresValue(SETTINGS_KEY, next);
      return next;
    });
  }

  const current = normalizeStoreSettings(readJsonFile(settingsDataFile()) || {});
  const next = { ...current, [section]: normalizeSectionValue(section, value, current) };
  writeJsonFile(settingsDataFile(), next);
  return next;
}

function nextStorefrontCollection(current, input) {
  const record = normalizeCollectionDefinition(input, current.collectionDefinitions.length, {
    name: typeof input === 'object' ? input?.name : input,
    sortOrder: current.collectionDefinitions.length
  });
  const name = record.name;
  if (current.storefrontCollections.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
    throw conflict('Collection already exists.');
  }
  if (current.collectionDefinitions.some((existing) => existing.slug === record.slug)) {
    throw conflict('Collection slug already exists.');
  }
  const collectionDefinitions = [...current.collectionDefinitions, record]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  return {
    ...current,
    storefrontCollections: collectionDefinitions.map((collection) => collection.name),
    collectionDefinitions,
    collectionCountdowns: {
      ...current.collectionCountdowns,
      [name]: defaultCollectionCountdown()
    }
  };
}

function addStorefrontCollection(input) {
  if (usePostgresSettings()) {
    return transaction(async (client) => {
      await client.query(
        `INSERT INTO store_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO NOTHING`,
        [SETTINGS_KEY, JSON.stringify(defaultStoreSettings())]
      );
      const result = await client.query(
        'SELECT value FROM store_settings WHERE key = $1 FOR UPDATE',
        [SETTINGS_KEY]
      );
      const current = normalizeStoreSettings(result.rows[0]?.value || {});
      const next = nextStorefrontCollection(current, input);
      await client.query(
        `UPDATE store_settings SET value = $2, updated_at = now() WHERE key = $1`,
        [SETTINGS_KEY, JSON.stringify(next)]
      );
      return next;
    });
  }

  const current = normalizeStoreSettings(readJsonFile(settingsDataFile()) || {});
  const next = nextStorefrontCollection(current, input);
  writeJsonFile(settingsDataFile(), next);
  return next;
}

function nextUpdatedStorefrontCollection(current, identifier, input) {
  const lookup = String(identifier || '').trim().toLowerCase();
  const index = current.collectionDefinitions.findIndex((collection) => collection.slug === lookup || collection.name.toLowerCase() === lookup);
  if (index < 0) throw badRequest('Collection was not found.');
  const previous = current.collectionDefinitions[index];
  const record = normalizeCollectionDefinition({ ...previous, ...(input || {}) }, index, previous);
  if (current.collectionDefinitions.some((collection, candidateIndex) => candidateIndex !== index && collection.name.toLowerCase() === record.name.toLowerCase())) {
    throw conflict('Collection already exists.');
  }
  if (current.collectionDefinitions.some((collection, candidateIndex) => candidateIndex !== index && collection.slug === record.slug)) {
    throw conflict('Collection slug already exists.');
  }
  if (record.name.toLowerCase() !== previous.name.toLowerCase()) {
    record.aliases = [...new Set([...record.aliases, previous.name])];
  }
  if (record.slug !== previous.slug) {
    record.urlAliases = [...new Set([...(record.urlAliases || []), previous.slug])]
      .filter((alias) => alias !== record.slug);
  }
  const occupiedRoutes = new Map();
  current.collectionDefinitions.forEach((collection, candidateIndex) => {
    if (candidateIndex === index) return;
    [collection.slug, ...(collection.urlAliases || [])].forEach((route) => occupiedRoutes.set(route, collection.slug));
  });
  for (const route of [record.slug, ...(record.urlAliases || [])]) {
    if (occupiedRoutes.has(route)) throw conflict(`Collection URL "${route}" is already in use.`);
  }
  const collectionDefinitions = current.collectionDefinitions
    .map((collection, candidateIndex) => candidateIndex === index ? record : collection)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  const previousCountdown = current.collectionCountdowns[previous.name] || defaultCollectionCountdown();
  const collectionCountdowns = { ...current.collectionCountdowns, [record.name]: previousCountdown };
  if (record.name !== previous.name) delete collectionCountdowns[previous.name];
  return {
    ...current,
    storefrontCollections: collectionDefinitions.map((collection) => collection.name),
    collectionDefinitions,
    collectionCountdowns
  };
}

function updateStorefrontCollection(identifier, input) {
  if (usePostgresSettings()) {
    return transaction(async (client) => {
      await client.query(
        `INSERT INTO store_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO NOTHING`,
        [SETTINGS_KEY, JSON.stringify(defaultStoreSettings())]
      );
      const result = await client.query('SELECT value FROM store_settings WHERE key = $1 FOR UPDATE', [SETTINGS_KEY]);
      const next = nextUpdatedStorefrontCollection(normalizeStoreSettings(result.rows[0]?.value || {}), identifier, input);
      await client.query('UPDATE store_settings SET value = $2, updated_at = now() WHERE key = $1', [SETTINGS_KEY, JSON.stringify(next)]);
      return next;
    });
  }
  const next = nextUpdatedStorefrontCollection(normalizeStoreSettings(readJsonFile(settingsDataFile()) || {}), identifier, input);
  writeJsonFile(settingsDataFile(), next);
  return next;
}

function nextCollectionCountdown(current, collectionName, input) {
  if (!current.storefrontCollections.includes(collectionName)) {
    throw badRequest('Collection is invalid.');
  }
  const previous = current.collectionCountdowns[collectionName];
  const normalized = normalizeCollectionCountdown({
    ...input,
    revision: previous.revision
  }, previous);
  return {
    ...current,
    collectionCountdowns: {
      ...current.collectionCountdowns,
      [collectionName]: { ...normalized, revision: previous.revision + 1 }
    }
  };
}

function updateCollectionCountdown(collectionName, input) {
  if (usePostgresSettings()) {
    return transaction(async (client) => {
      await client.query(
        `INSERT INTO store_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO NOTHING`,
        [SETTINGS_KEY, JSON.stringify(defaultStoreSettings())]
      );
      const result = await client.query(
        'SELECT value FROM store_settings WHERE key = $1 FOR UPDATE',
        [SETTINGS_KEY]
      );
      const current = normalizeStoreSettings(result.rows[0]?.value || {});
      const next = nextCollectionCountdown(current, collectionName, input);
      await client.query(
        `INSERT INTO store_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [SETTINGS_KEY, JSON.stringify(next)]
      );
      return next;
    });
  }

  const current = normalizeStoreSettings(readJsonFile(settingsDataFile()) || {});
  const next = nextCollectionCountdown(current, collectionName, input);
  writeJsonFile(settingsDataFile(), next);
  return next;
}

function listEnabledPaymentMethodIds() {
  const settings = getStoreSettings();
  if (isPromise(settings)) {
    return settings.then((value) => value.payments.methods.filter((method) => method.enabled).map((method) => method.id));
  }
  return settings.payments.methods.filter((method) => method.enabled).map((method) => method.id);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { passwordHash: hash, passwordSalt: salt };
}

function verifyAdminPassword(password, credentials) {
  if (!credentials?.passwordHash || !credentials?.passwordSalt) return false;
  const { passwordHash } = hashPassword(password, credentials.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(passwordHash, 'hex'), Buffer.from(credentials.passwordHash, 'hex'));
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getAdminCredentials() {
  if (usePostgresCredentials()) {
    if (postgresCredentialsCache.loaded) return Promise.resolve(postgresCredentialsCache.value);
    return readPostgresValue(CREDENTIALS_KEY).then((value) => {
      postgresCredentialsCache = { loaded: true, value };
      return value;
    });
  }
  return readJsonFile(credentialsDataFile());
}

function saveCredentials(record) {
  if (usePostgresCredentials()) {
    return writePostgresValue(CREDENTIALS_KEY, record).then(() => {
      postgresCredentialsCache = { loaded: true, value: record };
      return record;
    });
  }
  writeJsonFile(credentialsDataFile(), record);
  return record;
}

function setAdminPassword(newPassword) {
  const record = {
    ...hashPassword(newPassword),
    token: newToken(),
    updatedAt: new Date().toISOString()
  };
  return saveCredentials(record);
}

function rotateAdminToken() {
  const current = getAdminCredentials();
  const build = (existing) => ({
    ...(existing || {}),
    token: newToken(),
    updatedAt: new Date().toISOString()
  });
  if (isPromise(current)) {
    return current.then((existing) => saveCredentials(build(existing)));
  }
  return saveCredentials(build(current));
}

function resetStoreSettingsForTests() {
  postgresCredentialsCache = { loaded: false, value: null };
}

module.exports = {
  addStorefrontCollection,
  defaultStoreSettings,
  getAdminCredentials,
  getStoreSettings,
  listEnabledPaymentMethodIds,
  resetStoreSettingsForTests,
  rotateAdminToken,
  setAdminPassword,
  updateCollectionCountdown,
  updateStorefrontCollection,
  updateSettingsSection,
  verifyAdminPassword
};
