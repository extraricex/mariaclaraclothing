const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { hasDatabaseUrl, query } = require('../db/postgres');

const DEFAULT_SETTINGS_FILE = path.join(__dirname, '..', '..', 'data', 'store-settings.json');
const DEFAULT_CREDENTIALS_FILE = path.join(__dirname, '..', '..', 'data', 'admin-credentials.json');
const SETTINGS_KEY = 'storeSettings';
const CREDENTIALS_KEY = 'adminCredentials';
const SETTINGS_SECTIONS = ['general', 'shipping', 'payments'];
const SHIPPING_REGION_IDS = ['metro_manila_cavite', 'luzon', 'visayas_mindanao'];
const PAYMENT_METHOD_IDS = ['cash_on_delivery', 'gcash', 'bank_transfer'];

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

function defaultStoreSettings() {
  return {
    general: {
      storeName: 'Maria Clara Clothing',
      contactEmail: '',
      contactNumber: '',
      storeAddress: '',
      socialLinks: { facebook: '', instagram: '', tiktok: '' }
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
    }
  };
}

function normalizeGeneral(general) {
  const value = general && typeof general === 'object' ? general : {};
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
    socialLinks: {
      facebook: String(socialLinks.facebook || '').trim(),
      instagram: String(socialLinks.instagram || '').trim(),
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

function normalizeStoreSettings(settings) {
  const value = settings && typeof settings === 'object' ? settings : {};
  return {
    general: normalizeGeneral(value.general),
    shipping: normalizeShipping(value.shipping),
    payments: normalizePayments(value.payments)
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

function updateSettingsSection(section, value) {
  if (!SETTINGS_SECTIONS.includes(section)) {
    throw badRequest('Settings section is invalid.');
  }
  const normalizers = { general: normalizeGeneral, shipping: normalizeShipping, payments: normalizePayments };
  const normalized = normalizers[section](value);

  if (usePostgresSettings()) {
    return readPostgresValue(SETTINGS_KEY).then(async (stored) => {
      const next = { ...normalizeStoreSettings(stored || {}), [section]: normalized };
      await writePostgresValue(SETTINGS_KEY, next);
      return next;
    });
  }

  const next = { ...normalizeStoreSettings(readJsonFile(settingsDataFile()) || {}), [section]: normalized };
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
  defaultStoreSettings,
  getAdminCredentials,
  getStoreSettings,
  listEnabledPaymentMethodIds,
  resetStoreSettingsForTests,
  rotateAdminToken,
  setAdminPassword,
  updateSettingsSection,
  verifyAdminPassword
};
