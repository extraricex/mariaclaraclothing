const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-password-reset-'));
process.env.CUSTOMER_ACCOUNTS_DATA_FILE = path.join(directory, 'customers.json');
process.env.PASSWORD_RESETS_DATA_FILE = path.join(directory, 'resets.json');
process.env.CUSTOMER_AUTH_SECRET = 'test-customer-auth-secret-with-more-than-32-characters';
process.env.PASSWORD_RESET_SECRET = 'test-password-reset-secret-with-more-than-32-characters';

const {
  createAccount,
  findAccountByEmail,
  verifyPassword
} = require('../src/customers/customerAccountRepository');
const {
  completeCustomerPasswordReset,
  requestCustomerPasswordReset
} = require('../src/customers/customerPasswordResetService');
const {
  consumePasswordReset,
  createPasswordReset
} = require('../src/customers/customerPasswordResetRepository');

test('password reset is email-private, expires, and can be used only once', async () => {
  const account = await createAccount({
    firstName: 'Reset', lastName: 'Customer', email: 'reset@example.com',
    phone: '09171234567', password: 'old-password'
  });
  const deliveries = [];
  const response = await requestCustomerPasswordReset('reset@example.com', {
    config: { configured: true, siteUrl: 'https://mariaclaraclothing.com' },
    send: async (event) => { deliveries.push(event); return { providerMessageId: 'reset-test' }; }
  });
  assert.deepEqual(response, { accepted: true });
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].recipient, 'reset@example.com');
  const token = new URL(deliveries[0].payload.url).searchParams.get('token');
  assert.ok(token);

  const completed = await completeCustomerPasswordReset(token, 'new-password');
  assert.equal(completed.customerAccountId, account.id);
  assert.equal(verifyPassword('new-password', await findAccountByEmail('reset@example.com')), true);
  await assert.rejects(
    completeCustomerPasswordReset(token, 'another-password'),
    (error) => error.code === 'PASSWORD_RESET_INVALID'
  );

  await requestCustomerPasswordReset('missing@example.com', {
    config: { configured: true, siteUrl: 'https://mariaclaraclothing.com' },
    send: async (event) => { deliveries.push(event); }
  });
  assert.equal(deliveries.length, 1);

  const oldNow = new Date('2026-01-01T00:00:00.000Z');
  const expired = await createPasswordReset(account.id, { now: oldNow, ttlMs: 1000 });
  assert.equal(await consumePasswordReset(expired.token, 'not-applied', { now: new Date('2026-01-01T00:00:02.000Z') }), null);
});
