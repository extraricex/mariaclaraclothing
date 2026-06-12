# Store Settings Phase 1 Design

Settings-section phase 1 of the admin enhancement roadmap (`docs/enhancementdata.md`):
General store info, Shipping settings, Payment method settings, and single-admin
account security. Work branches off `main` and stays additive so it merges cleanly
with the in-progress Orders work on `codex-edits`.

## Goals

- The admin edits store info, shipping fees/rules, and payment methods from
  `/admin/settings` with no code changes; saved values drive the React storefront.
- The admin can change the admin password and rotate the admin token from the
  dashboard. Env-based credentials remain the bootstrap/default.
- Everything persists durably in both JSON mode and the Docker/Postgres stack
  (the api container does not volume `data/`, so JSON-only storage is not durable
  there — settings must follow the dual JSON/Postgres pattern).

## Out of scope (later phases)

- Checkout settings, order-status settings, notifications, message templates,
  website settings (maintenance mode, SEO), inventory settings, discount settings,
  export settings.
- Multi-admin, staff roles, permissions.
- The legacy static storefront (`apps/api/public/`) keeps its hard-coded fees and
  COD-only checkout; it is the pinned fallback UI and its tests stay untouched.

## Data model

One settings document with three editable sections. Missing sections/fields
deep-merge over code defaults equal to today's hard-coded values, so behavior is
unchanged until the admin saves something.

```js
{
  general: {
    storeName: 'Maria Clara Clothing',
    contactEmail: '', contactNumber: '', storeAddress: '',
    socialLinks: { facebook: '', instagram: '', tiktok: '' }
  },
  shipping: {
    regions: [ // ids are a fixed set matching apps/web/src/lib/addressGuide.js
      { id: 'metro_manila_cavite', label: 'Metro Manila & Cavite', feeCents: 8000,  deliveryEstimate: 'Estimated delivery: Metro Manila and Cavite 2-4 days.' },
      { id: 'luzon',               label: 'Luzon',                 feeCents: 12000, deliveryEstimate: 'Estimated delivery: Luzon 3-7 days.' },
      { id: 'visayas_mindanao',    label: 'Visayas & Mindanao',    feeCents: 18000, deliveryEstimate: 'Estimated delivery: Visayas and Mindanao 5-9 days.' }
    ],
    freeShippingEnabled: true,
    freeShippingMinimumItems: 2
  },
  payments: {
    methods: [ // ids are a fixed set; cash_on_delivery cannot be disabled
      { id: 'cash_on_delivery', label: 'Cash on Delivery', enabled: true,  instructions: '' },
      { id: 'gcash',            label: 'GCash',            enabled: false, instructions: '' },
      { id: 'bank_transfer',    label: 'Bank Transfer',    enabled: false, instructions: '' }
    ]
  }
}
```

Admin credentials are a separate record and are never included in any settings
API response:

```js
{ passwordHash, passwordSalt, token, updatedAt } // scrypt, same scheme as customerAccountRepository
```

## Persistence

New `apps/api/src/settings/storeSettingsRepository.js` following the dual
JSON/Postgres pattern (`usePostgresSettings()` = `hasDatabaseUrl()` and no file
override; sync values in JSON mode, promises in PG mode; routes `await` either):

- Postgres: new idempotent table
  `store_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`
  added to `apps/api/db/schema.sql`. Settings live under key `storeSettings`,
  credentials under key `adminCredentials`.
- JSON mode: `data/store-settings.json` (override `STORE_SETTINGS_FILE`) and
  `data/admin-credentials.json` (override `ADMIN_CREDENTIALS_FILE`). The
  credentials file is gitignored and absent by default. Writes are
  pretty-printed with a trailing newline per repo convention.

Repository exports (alphabetical, named): `getAdminCredentials`,
`getStoreSettings`, `resetStoreSettingsForTests`, `rotateAdminToken`,
`setAdminPassword`, `updateSettingsSection`, plus normalize/validate helpers.

## Auth changes

`adminPassword()`-style resolution in `apps/api/src/routes/admin.js` becomes:

- Login: if a credentials record exists, verify the scrypt hash; otherwise
  compare against `process.env.ADMIN_PASSWORD || 'admin'` (current behavior).
- `requireAdmin`: if a credentials record exists, compare against its `token`;
  otherwise `process.env.ADMIN_TOKEN || 'local-admin-token'` (current behavior).
  Lookup may be async; the middleware awaits it. JSON mode reads the file per
  call; PG mode caches in memory and invalidates on credential writes.
- Changing the password requires the current password, stores a new hash, and
  rotates the token (old sessions become invalid). The response returns the new
  token so the active browser session continues.
- Rotate-token does the same without changing the password.

No credentials record exists by default, so every existing test and dev flow
keeps its current behavior.

## API

Admin (inside `admin.js`, declared near the site-content routes to stay clear of
the orders-area edits on `codex-edits`):

| Endpoint | Behavior |
|---|---|
| `GET /api/admin/settings` | `{ settings: { general, shipping, payments } }` — never credentials |
| `PUT /api/admin/settings/general` | Validate + save section, return `{ settings }` |
| `PUT /api/admin/settings/shipping` | Same |
| `PUT /api/admin/settings/payments` | Same |
| `POST /api/admin/settings/security/password` | `{ currentPassword, newPassword }` → `{ token }`; 401 on wrong current password |
| `POST /api/admin/settings/security/rotate-token` | → `{ token }` |

Public (new `apps/api/src/routes/storeSettings.js`, mounted in `app.js`):

| Endpoint | Behavior |
|---|---|
| `GET /api/storefront-settings` | `Cache-Control: no-store`. `{ settings: { storeName, contactEmail, contactNumber, storeAddress, socialLinks, shipping: { regions, freeShippingEnabled, freeShippingMinimumItems }, paymentMethods: [enabled methods only, with instructions] } }` |

Validation (thrown `error.status = 400`, exact messages asserted by tests):

- Shipping fees: non-negative integer cents; free-shipping minimum: integer >= 1;
  region ids must equal the fixed set.
- Payment method ids must equal the fixed set; `cash_on_delivery` cannot be
  disabled (`'Cash on Delivery cannot be disabled.'`); labels/instructions are
  trimmed strings.
- General: trimmed strings; `contactEmail` must contain `@` when non-empty.
- New password: minimum 8 characters (`'Password must be at least 8 characters.'`).

## Storefront wiring (React app only)

- New `apps/web/src/lib/storeSettings.js`: fetch `/api/storefront-settings` once
  per page load (cached promise), falling back to the current hard-coded
  defaults when the fetch fails.
- `Checkout.jsx`: shipping fee, free-shipping rule, and delivery estimate come
  from settings (region id resolution stays in `addressGuide.js`); new payment
  method radio selector listing enabled methods, defaulting to COD, showing the
  method's instructions when selected; the order payload sends the chosen
  `paymentMethod` id.
- `apps/api/src/routes/orders.js`: reject checkout when `paymentMethod` is not
  an enabled method — 400 `'Payment method is not available.'`. Non-COD orders
  keep `paymentStatus: 'cod_pending'` (no enum change); admin UI may label it
  "Pending payment".
- `apps/api/src/jnt/jntExport.js`: the COD-amount column is `0` for orders whose
  `paymentMethod` is not `cash_on_delivery`; all other columns unchanged.
- Storefront footer (`apps/web`): show contact email/number and social links
  when set.

## Admin UI

Rewrite `apps/web/src/admin/Settings.jsx` into four cards in the existing admin
visual language (border-line/bg-paper cards, eyebrow/display headings), each
with its own Save button and inline success/error status:

1. **General** — store name, email, contact number, address, social links.
2. **Shipping** — per-region peso fee inputs (peso at the UI edge only — no raw
   cents in form fields), delivery estimate text, free-shipping toggle +
   minimum-items input.
3. **Payments** — per-method enable toggle (COD's toggle disabled) and
   instructions textarea.
4. **Security** — change-password form (current/new/confirm) and a rotate-token
   button; both update `localStorage['maria-clara-admin-token']` on success.

## Testing

- `apps/api/test/adminSettings.test.js` (integration, temp-file + restoreEnv +
  createFreshApp patterns): GET defaults; section round-trips; validation
  errors; 401 without token; public endpoint excludes disabled methods and never
  contains `passwordHash`/`token`; password change → login works with the new
  password, old token 401s, returned token works; rotate-token flow.
- Orders: checkout with `gcash` succeeds when enabled and 400s when disabled;
  J&T export writes COD amount 0 for a prepaid order.
- `apps/web/test/adminSettingsSource.test.js` + checkout source assertions
  (payment selector, settings-driven shipping), per the repo's source-regex
  style.
- Update `apps/api/data/admin-contracts/settings.json`: `managedFields` becomes
  `["storeName", "contactEmail", "contactNumber", "storeAddress", "socialLinks",
  "shippingRules", "freeShippingRule", "paymentMethods", "adminPassword",
  "adminToken", "policyLinks", "seoDefaults"]` and `futureAdminActions` keeps the
  not-yet-implemented items. Replace the `apps/api/src/settings/README.md`
  placeholder text (the file must keep existing — `adminReadiness.test.js`).

## Conflict safety vs. codex-edits

New files everywhere except these shared touchpoints, all kept additive:
`admin.js` (new routes near site-content, far from the orders hunks), `app.js`
(one mount line), `db/schema.sql` (new table block), `orders.js` (validation
inside `normalizeCheckout`), `Checkout.jsx` (new payment-selector JSX; fee
constants replaced by settings lookup), `.gitignore` (credentials file). No
`AdminLayout.jsx` changes — the Settings nav link already exists.
