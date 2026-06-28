const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function freshRepository() {
  delete require.cache[require.resolve('../src/settings/storeSettingsRepository')];
  return require('../src/settings/storeSettingsRepository');
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test('store settings expose defaults, save sections, and validate input', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-settings-'));
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'store-settings.json');

  try {
    const repository = freshRepository();

    const defaults = repository.getStoreSettings();
    assert.equal(defaults.general.storeName, 'Maria Clara Clothing');
    assert.equal(defaults.shipping.regions.length, 3);
    assert.equal(defaults.shipping.regions.find((region) => region.id === 'metro_manila_cavite').feeCents, 8000);
    assert.equal(defaults.shipping.freeShippingMinimumItems, 2);
    assert.equal(defaults.payments.methods.find((method) => method.id === 'cash_on_delivery').enabled, true);
    assert.equal(defaults.payments.methods.find((method) => method.id === 'gcash').enabled, false);

    const updated = repository.updateSettingsSection('shipping', {
      regions: [{ id: 'luzon', feeCents: 15000 }],
      freeShippingEnabled: false,
      freeShippingMinimumItems: 3
    });
    assert.equal(updated.shipping.regions.find((region) => region.id === 'luzon').feeCents, 15000);
    assert.equal(updated.shipping.regions.find((region) => region.id === 'metro_manila_cavite').feeCents, 8000);
    assert.equal(updated.shipping.freeShippingEnabled, false);

    const reread = repository.getStoreSettings();
    assert.equal(reread.shipping.freeShippingMinimumItems, 3);

    assert.equal(repository.updateSettingsSection('payments', {
      methods: [{ id: 'gcash', enabled: true, instructions: 'Send to 0917 000 0000.' }]
    }).payments.methods.find((method) => method.id === 'gcash').instructions, 'Send to 0917 000 0000.');
    assert.deepEqual(await repository.listEnabledPaymentMethodIds(), ['cash_on_delivery', 'gcash']);

    assert.throws(() => repository.updateSettingsSection('shipping', { regions: [{ id: 'luzon', feeCents: -1 }] }),
      /must be a non-negative integer/);
    assert.throws(() => repository.updateSettingsSection('shipping', { freeShippingMinimumItems: 0 }),
      /Free shipping minimum items must be an integer of at least 1\./);
    assert.throws(() => repository.updateSettingsSection('payments', { methods: [{ id: 'cash_on_delivery', enabled: false }] }),
      /Cash on Delivery cannot be disabled\./);
    assert.throws(() => repository.updateSettingsSection('payments', { methods: [{ id: 'paypal', enabled: true }] }),
      /Payment method is invalid\./);
    assert.throws(() => repository.updateSettingsSection('general', { contactEmail: 'not-an-email' }),
      /Contact email is invalid\./);
    assert.throws(() => repository.updateSettingsSection('nope', {}),
      /Settings section is invalid\./);
  } finally {
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('admin credentials hash passwords and rotate tokens', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-credentials-'));
  const previousCredentialsFile = process.env.ADMIN_CREDENTIALS_FILE;
  process.env.ADMIN_CREDENTIALS_FILE = path.join(tempDir, 'admin-credentials.json');

  try {
    const repository = freshRepository();

    assert.equal(repository.getAdminCredentials(), null);

    const record = repository.setAdminPassword('my-new-password');
    assert.ok(record.token);
    assert.ok(record.passwordHash);
    assert.notEqual(record.passwordHash, 'my-new-password');

    const stored = repository.getAdminCredentials();
    assert.equal(repository.verifyAdminPassword('my-new-password', stored), true);
    assert.equal(repository.verifyAdminPassword('wrong-password', stored), false);

    const rotated = repository.rotateAdminToken();
    assert.notEqual(rotated.token, record.token);
    assert.equal(repository.verifyAdminPassword('my-new-password', repository.getAdminCredentials()), true);
  } finally {
    restoreEnv('ADMIN_CREDENTIALS_FILE', previousCredentialsFile);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('website settings merge partial updates over the stored section', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-website-'));
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'store-settings.json');

  try {
    const repository = freshRepository();

    const defaults = repository.getStoreSettings();
    assert.equal(defaults.website.maintenanceMode, false);
    assert.equal(defaults.website.ticker.length, 4);
    assert.equal(defaults.website.seo.title, 'Maria Clara Clothing — Premium Philippine Streetwear');
    assert.ok(defaults.website.infoPages.faq.length >= 3);
    assert.ok(defaults.website.infoPages.shippingReturns.length >= 3);
    assert.ok(defaults.website.infoPages.terms.length >= 3);
    const privacy = defaults.website.infoPages.terms.find((section) => section.heading === 'Privacy');
    assert.match(privacy.body, /Facebook Meta Pixel/);
    assert.match(privacy.body, /hashed contact details/);
    assert.ok(defaults.website.infoPages.faq[0].heading);
    assert.ok(defaults.website.infoPages.faq[0].body);

    const afterTicker = repository.updateSettingsSection('website', { ticker: ['Big drop Friday'] });
    assert.deepEqual(afterTicker.website.ticker, ['Big drop Friday']);
    assert.equal(afterTicker.website.seo.title, defaults.website.seo.title);
    assert.deepEqual(afterTicker.website.infoPages.terms, defaults.website.infoPages.terms);

    const afterFaq = repository.updateSettingsSection('website', {
      infoPages: { faq: [{ heading: 'New question', body: 'New answer.' }] }
    });
    assert.deepEqual(afterFaq.website.infoPages.faq, [{ heading: 'New question', body: 'New answer.' }]);
    assert.deepEqual(afterFaq.website.infoPages.shippingReturns, defaults.website.infoPages.shippingReturns);
    assert.deepEqual(afterFaq.website.ticker, ['Big drop Friday']);

    const afterMaintenance = repository.updateSettingsSection('website', { maintenanceMode: true });
    assert.equal(afterMaintenance.website.maintenanceMode, true);
    assert.deepEqual(afterMaintenance.website.infoPages.faq, [{ heading: 'New question', body: 'New answer.' }]);

    assert.throws(() => repository.updateSettingsSection('website', { ticker: [] }),
      /Ticker must have 1 to 8 items\./);
    assert.throws(() => repository.updateSettingsSection('website', { ticker: ['ok', '  '] }),
      /Ticker items must be non-empty text\./);
    assert.throws(() => repository.updateSettingsSection('website', { infoPages: { blog: [] } }),
      /Info page is invalid\./);
    assert.throws(() => repository.updateSettingsSection('website', { infoPages: { faq: [{ heading: '', body: 'x' }] } }),
      /Info page sections need a heading and body\./);
    assert.throws(() => repository.updateSettingsSection('website', { infoPages: { faq: [] } }),
      /Info pages must have 1 to 30 sections\./);
  } finally {
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('inventory settings store the low stock threshold', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-inventory-'));
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'store-settings.json');

  try {
    const repository = freshRepository();

    assert.equal(repository.getStoreSettings().inventory.lowStockThreshold, 12);

    const updated = repository.updateSettingsSection('inventory', { lowStockThreshold: 30 });
    assert.equal(updated.inventory.lowStockThreshold, 30);
    assert.equal(repository.getStoreSettings().inventory.lowStockThreshold, 30);

    assert.throws(() => repository.updateSettingsSection('inventory', { lowStockThreshold: 0 }),
      /Low stock threshold must be an integer between 1 and 999\./);
    assert.throws(() => repository.updateSettingsSection('inventory', { lowStockThreshold: 1000 }),
      /Low stock threshold must be an integer between 1 and 999\./);
    assert.throws(() => repository.updateSettingsSection('inventory', { lowStockThreshold: 12.5 }),
      /Low stock threshold must be an integer between 1 and 999\./);
  } finally {
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('collection countdown settings validate and increment server revisions', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'maria-clara-countdowns-'));
  const previousSettingsFile = process.env.STORE_SETTINGS_FILE;
  process.env.STORE_SETTINGS_FILE = path.join(tempDir, 'store-settings.json');

  try {
    const repository = freshRepository();
    const defaults = repository.getStoreSettings();
    assert.deepEqual(defaults.collectionCountdowns['New Arrivals'], {
      enabled: false,
      message: 'Hurry! Limited time left',
      durationSeconds: 7200,
      revision: 0
    });
    assert.deepEqual(defaults.collectionCountdowns['Freedom of Mind'], {
      enabled: false,
      message: 'Hurry! Limited time left',
      durationSeconds: 7200,
      revision: 0
    });

    const first = repository.updateCollectionCountdown('New Arrivals', {
      enabled: true,
      message: '  Drop ends soon  ',
      durationSeconds: 3661,
      revision: 999
    });
    assert.deepEqual(first.collectionCountdowns['New Arrivals'], {
      enabled: true,
      message: 'Drop ends soon',
      durationSeconds: 3661,
      revision: 1
    });

    const second = repository.updateCollectionCountdown('New Arrivals', {
      enabled: false,
      message: 'Drop ends soon',
      durationSeconds: 3661
    });
    assert.equal(second.collectionCountdowns['New Arrivals'].revision, 2);
    assert.equal(repository.getStoreSettings().collectionCountdowns['New Arrivals'].revision, 2);

    assert.throws(() => repository.updateCollectionCountdown('Unknown', {
      enabled: true, message: 'Soon', durationSeconds: 60
    }), /Collection is invalid/);
    assert.throws(() => repository.updateCollectionCountdown('New Arrivals', {
      enabled: true, message: '', durationSeconds: 60
    }), /message is required/);
    assert.throws(() => repository.updateCollectionCountdown('New Arrivals', {
      enabled: true, message: 'Soon', durationSeconds: 0
    }), /between 1 and 359999 seconds/);
    assert.throws(() => repository.updateCollectionCountdown('New Arrivals', {
      enabled: true, message: 'Soon', durationSeconds: 360000
    }), /between 1 and 359999 seconds/);
  } finally {
    restoreEnv('STORE_SETTINGS_FILE', previousSettingsFile);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
