const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { hasDatabaseUrl, query, transaction } = require('../db/postgres');
const { normalizeCustomerName } = require('./customerName');

const DEFAULT_ACCOUNTS_FILE = path.join(__dirname, '..', '..', 'data', 'customer-accounts.json');
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function accountsDataFile() {
  return process.env.CUSTOMER_ACCOUNTS_DATA_FILE || DEFAULT_ACCOUNTS_FILE;
}

function usePostgresAccounts() {
  return hasDatabaseUrl() && !process.env.CUSTOMER_ACCOUNTS_DATA_FILE;
}

function authSecret() {
  return process.env.CUSTOMER_AUTH_SECRET || process.env.AUTH_SECRET || 'local-customer-auth-secret';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { passwordHash: hash, passwordSalt: salt };
}

async function updateAccountPassword(id, password, options = {}) {
  const credentials = hashPassword(password);
  if (usePostgresAccounts()) {
    const executor = options.client || { query };
    const result = await executor.query(
      `UPDATE customer_accounts
          SET password_hash=$2, password_salt=$3, updated_at=now()
        WHERE id=$1 RETURNING id`,
      [id, credentials.passwordHash, credentials.passwordSalt]
    );
    return Boolean(result.rows[0]);
  }
  const accounts = readAccountsFile();
  const index = accounts.findIndex((account) => account.id === id);
  if (index < 0) return false;
  Object.assign(accounts[index], credentials, { updatedAt: new Date().toISOString() });
  writeAccountsFile(accounts);
  return true;
}

function verifyPassword(password, account) {
  if (!account?.passwordHash || !account?.passwordSalt) return false;
  const { passwordHash } = hashPassword(password, account.passwordSalt);
  const actual = Buffer.from(account.passwordHash, 'hex');
  const expected = Buffer.from(passwordHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(expected, actual);
}

function signCustomerToken(accountId, now = Date.now()) {
  const exp = now + TOKEN_TTL_MS;
  const payload = `${accountId}.${exp}`;
  const signature = crypto.createHmac('sha256', authSecret()).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function verifyCustomerToken(token, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [accountId, expRaw, signature] = parts;
  const exp = Number(expRaw);
  if (!accountId || !Number.isFinite(exp) || exp < now) return null;
  const expected = crypto.createHmac('sha256', authSecret()).update(`${accountId}.${exp}`).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(String(signature), 'hex');
  if (actualBuffer.length !== expectedBuffer.length) return null;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer) ? accountId : null;
}

function normalizeSavedAddress(address) {
  if (!address || typeof address !== 'object') return null;
  const normalized = {
    houseAddress: String(address.houseAddress || '').trim(),
    provinceCode: String(address.provinceCode || '').trim(),
    cityCode: String(address.cityCode || '').trim(),
    barangayCode: String(address.barangayCode || '').trim(),
    barangay: String(address.barangay || '').trim(),
    city: String(address.city || '').trim(),
    province: String(address.province || '').trim(),
    postalCode: String(address.postalCode || '').trim(),
    datasetVersion: String(address.datasetVersion || '').trim()
  };
  if (!normalized.houseAddress && !normalized.barangay && !normalized.city && !normalized.province) {
    return null;
  }
  return normalized;
}

function publicCustomer(account) {
  if (!account) return null;
  const name = normalizeCustomerName(account);
  return {
    id: account.id,
    email: account.email,
    ...name,
    phone: account.phone,
    savedAddress: account.savedAddress || null,
    createdAt: account.createdAt,
    loginProviders: Array.isArray(account.loginProviders) ? account.loginProviders : []
  };
}

function readAccountsFile() {
  const filePath = accountsDataFile();
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed.customerAccounts) ? parsed.customerAccounts : [];
}

function writeAccountsFile(customerAccounts) {
  fs.writeFileSync(accountsDataFile(), `${JSON.stringify({ customerAccounts }, null, 2)}\n`);
}

function fromPostgresAccount(row) {
  const name = normalizeCustomerName({
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: row.full_name
  });
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    ...name,
    phone: row.phone,
    savedAddress: row.saved_address || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

function findAccountByEmail(email) {
  const normalized = normalizeEmail(email);
  if (usePostgresAccounts()) {
    return query('SELECT * FROM customer_accounts WHERE email = $1', [normalized])
      .then(({ rows }) => rows.length ? fromPostgresAccount(rows[0]) : null);
  }
  return readAccountsFile().find((account) => account.email === normalized) || null;
}

function findAccountById(id) {
  if (!id) return usePostgresAccounts() ? Promise.resolve(null) : null;
  if (usePostgresAccounts()) {
    return query('SELECT * FROM customer_accounts WHERE id = $1', [id])
      .then(({ rows }) => rows.length ? fromPostgresAccount(rows[0]) : null);
  }
  return readAccountsFile().find((account) => account.id === id) || null;
}

async function createAccount({ firstName, lastName, fullName, email, phone, password }) {
  const now = new Date().toISOString();
  const name = normalizeCustomerName({ firstName, lastName, fullName });
  const account = {
    id: crypto.randomUUID(),
    email: normalizeEmail(email),
    ...hashPassword(password),
    ...name,
    phone: String(phone || '').trim(),
    savedAddress: null,
    createdAt: now,
    updatedAt: now
  };

  if (usePostgresAccounts()) {
    await query(
      `INSERT INTO customer_accounts
        (id, email, password_hash, password_salt, full_name, first_name, last_name, phone, saved_address, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
      [account.id, account.email, account.passwordHash, account.passwordSalt, account.fullName,
        account.firstName, account.lastName, account.phone, JSON.stringify(account.savedAddress), account.createdAt, account.updatedAt]
    );
    return account;
  }

  const accounts = readAccountsFile();
  accounts.push(account);
  writeAccountsFile(accounts);
  return account;
}

function fromOAuthAccountRow(row, providers = []) {
  return { ...fromPostgresAccount(row), loginProviders: providers };
}

async function findOrCreateOAuthAccount({ provider, providerUserId, email, fullName }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const normalizedProviderUserId = String(providerUserId || '').trim();
  const normalizedName = String(fullName || '').trim();
  const name = normalizeCustomerName({ fullName: normalizedName });
  if (!['google', 'facebook'].includes(normalizedProvider) || !normalizedProviderUserId || !normalizedEmail) {
    throw new Error('OAuth identity is incomplete');
  }

  if (usePostgresAccounts()) {
    return transaction(async (client) => {
      const existingIdentity = await client.query(
        `SELECT ca.*, cai.provider
           FROM customer_auth_identities cai
           JOIN customer_accounts ca ON ca.id = cai.customer_account_id
          WHERE cai.provider = $1 AND cai.provider_user_id = $2
          FOR UPDATE OF cai, ca`,
        [normalizedProvider, normalizedProviderUserId]
      );
      let accountRow = existingIdentity.rows[0];
      if (!accountRow) {
        const accountResult = await client.query(
          'SELECT * FROM customer_accounts WHERE email = $1 FOR UPDATE',
          [normalizedEmail]
        );
        accountRow = accountResult.rows[0];
        if (!accountRow) {
          const id = crypto.randomUUID();
          const inserted = await client.query(
            `INSERT INTO customer_accounts
              (id, email, password_hash, password_salt, full_name, first_name, last_name, phone, saved_address, created_at, updated_at)
             VALUES ($1, $2, NULL, NULL, $3, $4, $5, '', NULL, now(), now())
             RETURNING *`,
            [id, normalizedEmail, name.fullName, name.firstName, name.lastName]
          );
          accountRow = inserted.rows[0];
        }
        await client.query(
          `INSERT INTO customer_auth_identities
            (id, customer_account_id, provider, provider_user_id, provider_email, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, now(), now())
           ON CONFLICT (provider, provider_user_id) DO UPDATE
             SET provider_email = EXCLUDED.provider_email, updated_at = now()`,
          [crypto.randomUUID(), accountRow.id, normalizedProvider, normalizedProviderUserId, normalizedEmail]
        );
      } else {
        await client.query(
          `UPDATE customer_auth_identities SET provider_email = $3, updated_at = now()
            WHERE provider = $1 AND provider_user_id = $2`,
          [normalizedProvider, normalizedProviderUserId, normalizedEmail]
        );
      }
      if (!String(accountRow.full_name || '').trim() && normalizedName) {
        const updated = await client.query(
          `UPDATE customer_accounts
              SET full_name = $2, first_name = $3, last_name = $4, updated_at = now()
            WHERE id = $1 RETURNING *`,
          [accountRow.id, name.fullName, name.firstName, name.lastName]
        );
        accountRow = updated.rows[0];
      }
      const providers = await client.query(
        'SELECT provider FROM customer_auth_identities WHERE customer_account_id = $1 ORDER BY provider',
        [accountRow.id]
      );
      return fromOAuthAccountRow(accountRow, providers.rows.map((row) => row.provider));
    });
  }

  const accounts = readAccountsFile();
  let account = accounts.find((candidate) => (candidate.authIdentities || []).some(
    (identity) => identity.provider === normalizedProvider && identity.providerUserId === normalizedProviderUserId
  ));
  if (!account) account = accounts.find((candidate) => candidate.email === normalizedEmail);
  const now = new Date().toISOString();
  if (!account) {
    account = {
      id: crypto.randomUUID(), email: normalizedEmail, passwordHash: null, passwordSalt: null,
      ...name, phone: '', savedAddress: null, authIdentities: [], createdAt: now, updatedAt: now
    };
    accounts.push(account);
  }
  account.authIdentities ||= [];
  const linked = account.authIdentities.find((identity) => identity.provider === normalizedProvider);
  if (linked && linked.providerUserId !== normalizedProviderUserId) {
    const error = new Error(`This account is already linked to a different ${normalizedProvider} identity`);
    error.status = 409;
    throw error;
  }
  if (linked) {
    linked.providerEmail = normalizedEmail;
    linked.updatedAt = now;
  } else {
    account.authIdentities.push({ provider: normalizedProvider, providerUserId: normalizedProviderUserId, providerEmail: normalizedEmail, createdAt: now, updatedAt: now });
  }
  if (!account.fullName && normalizedName) Object.assign(account, name);
  account.updatedAt = now;
  writeAccountsFile(accounts);
  return { ...account, loginProviders: account.authIdentities.map((identity) => identity.provider).sort() };
}

async function withLoginProviders(account) {
  if (!account) return null;
  if (usePostgresAccounts()) {
    const { rows } = await query(
      'SELECT provider FROM customer_auth_identities WHERE customer_account_id = $1 ORDER BY provider',
      [account.id]
    );
    return { ...account, loginProviders: rows.map((row) => row.provider) };
  }
  return { ...account, loginProviders: (account.authIdentities || []).map((identity) => identity.provider).sort() };
}

async function updateAccount(id, changes) {
  const existing = await findAccountById(id);
  if (!existing) return null;

  const existingName = normalizeCustomerName(existing);
  const hasNameParts = changes.firstName !== undefined || changes.lastName !== undefined;
  const name = hasNameParts
    ? normalizeCustomerName({
      firstName: changes.firstName !== undefined ? changes.firstName : existingName.firstName,
      lastName: changes.lastName !== undefined ? changes.lastName : existingName.lastName
    })
    : changes.fullName !== undefined
      ? normalizeCustomerName({ fullName: changes.fullName })
      : existingName;
  const updated = {
    ...existing,
    ...name,
    phone: changes.phone !== undefined ? String(changes.phone || '').trim() : existing.phone,
    savedAddress: changes.savedAddress !== undefined ? normalizeSavedAddress(changes.savedAddress) : existing.savedAddress,
    updatedAt: new Date().toISOString()
  };

  if (usePostgresAccounts()) {
    await query(
      `UPDATE customer_accounts
          SET full_name = $2, first_name = $3, last_name = $4, phone = $5, saved_address = $6::jsonb, updated_at = $7
        WHERE id = $1`,
      [id, updated.fullName, updated.firstName, updated.lastName, updated.phone,
        JSON.stringify(updated.savedAddress), updated.updatedAt]
    );
    return updated;
  }

  const accounts = readAccountsFile().map((account) => account.id === id ? updated : account);
  writeAccountsFile(accounts);
  return updated;
}

module.exports = {
  createAccount,
  findAccountByEmail,
  findAccountById,
  findOrCreateOAuthAccount,
  normalizeEmail,
  normalizeSavedAddress,
  publicCustomer,
  signCustomerToken,
  updateAccount,
  updateAccountPassword,
  withLoginProviders,
  verifyCustomerToken,
  verifyPassword
};
