const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { hasDatabaseUrl, query, transaction } = require('../db/postgres');

const DEFAULT_SETTINGS_FILE = path.join(__dirname, '..', '..', 'data', 'store-settings.json');
const DEFAULT_CREDENTIALS_FILE = path.join(__dirname, '..', '..', 'data', 'admin-credentials.json');
const SETTINGS_KEY = 'storeSettings';
const CREDENTIALS_KEY = 'adminCredentials';
const SETTINGS_SECTIONS = ['general', 'shipping', 'payments', 'website', 'inventory', 'authentication'];
const WEBSITE_INFO_PAGE_KEYS = ['faq', 'shippingReturns', 'terms'];
const SHIPPING_REGION_IDS = ['metro_manila_cavite', 'luzon', 'visayas_mindanao'];
const PAYMENT_METHOD_IDS = ['cash_on_delivery', 'gcash', 'bank_transfer'];
const DEFAULT_STOREFRONT_COLLECTIONS = ['New Arrivals'];
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

function normalizeStorefrontCollections(value) {
  const incoming = Array.isArray(value) ? value : [];
  const collections = [];
  for (const item of [...DEFAULT_STOREFRONT_COLLECTIONS, ...incoming]) {
    const name = normalizeCollectionName(item);
    if (!collections.some((existing) => existing.toLowerCase() === name.toLowerCase())) collections.push(name);
  }
  return collections;
}

function defaultStoreSettings() {
  const storefrontCollections = [...DEFAULT_STOREFRONT_COLLECTIONS];
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
        { id: 'gcash', label: 'GCash', enabled: false, instructions: '' },
        { id: 'bank_transfer', label: 'Bank Transfer', enabled: false, instructions: '' }
      ]
    },
    authentication: {
      googleEnabled: true,
      facebookEnabled: true
    },
    website: {
      ticker: [
        'Free shipping on 2+ items',
        'Cash on delivery nationwide',
        '240 GSM premium cotton',
        'Ships via J&T Express'
      ],
      seo: {
        title: 'Maria Clara Clothing — Premium Philippine Streetwear',
        description: 'Oversized and crop-box 240 GSM cotton shirts. Cash on delivery nationwide. Free shipping on 2+ items.',
        imageUrl: '/brand/hero1v2.jpg'
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
        notificationEmail: 'asparedestrends@gmail.com',
        webhookUrl: '',
        pushNotificationsEnabled: false
      }
    },
    inventory: {
      lowStockThreshold: 12
    },
    storefrontCollections,
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
    if (fallback.id === 'cash_on_delivery' && !enabled) {
      throw badRequest('Cash on Delivery cannot be disabled.');
    }
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

function normalizeStoreSettings(settings) {
  const value = settings && typeof settings === 'object' ? settings : {};
  const storefrontCollections = normalizeStorefrontCollections(value.storefrontCollections);
  return {
    general: normalizeGeneral(value.general),
    shipping: normalizeShipping(value.shipping),
    payments: normalizePayments(value.payments),
    website: normalizeWebsite(value.website),
    inventory: normalizeInventory(value.inventory),
    authentication: normalizeAuthentication(value.authentication),
    storefrontCollections,
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
  const name = normalizeCollectionName(input);
  if (current.storefrontCollections.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
    throw conflict('Collection already exists.');
  }
  return {
    ...current,
    storefrontCollections: [...current.storefrontCollections, name],
    collectionCountdowns: {
      ...current.collectionCountdowns,
      [name]: defaultCollectionCountdown()
    }
  };
}

function addStorefrontCollection(name) {
  const normalizedName = normalizeCollectionName(name);
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
      const next = nextStorefrontCollection(current, normalizedName);
      await client.query(
        `UPDATE store_settings SET value = $2, updated_at = now() WHERE key = $1`,
        [SETTINGS_KEY, JSON.stringify(next)]
      );
      return next;
    });
  }

  const current = normalizeStoreSettings(readJsonFile(settingsDataFile()) || {});
  const next = nextStorefrontCollection(current, normalizedName);
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
  updateSettingsSection,
  verifyAdminPassword
};
