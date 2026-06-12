# Customer Accounts — Design

**Date:** 2026-06-12 · **Status:** Approved by owner (interactive session)

## Decisions (made with the owner)

| Question | Decision |
|---|---|
| Account requirement | **Optional** — guest COD checkout stays exactly as-is; accounts are a perk, never a gate. |
| Auth method | **Email + password** (scrypt-hashed, no external services). OTP/magic-link deferred. |
| v1 perks | Saved address + prefilled checkout · order history with status/tracking · automatic linking of past guest orders by phone · buy-again button. |
| Architecture | Hand-rolled following repo patterns: dual JSON/PG repository, HMAC bearer tokens in localStorage (mirrors admin auth). Rejected: auth SaaS (external dependency), cookie sessions (codebase speaks Bearer). |

## Data

`customer_accounts` — dual persistence (`data/customer-accounts.json` ↔ PG table, idempotent
migration in `db/schema.sql`):

```
{ id (uuid), email (unique, lowercased), passwordHash, passwordSalt (scrypt),
  fullName, phone, savedAddress: { houseAddress, barangay, city, province, postalCode } | null,
  createdAt, updatedAt }
```

Orders gain optional `customerAccountId` (text, default '') — set when a logged-in customer
checks out. New env: `CUSTOMER_ACCOUNTS_DATA_FILE` (test override), `CUSTOMER_AUTH_SECRET`
(token HMAC; insecure dev default, must be overridden in production like ADMIN_TOKEN).

## API (`src/routes/customer.js`, mounted at `/api/customer`)

| Endpoint | Behavior |
|---|---|
| `POST /register` | `{ fullName, email, phone, password }` → 201 `{ token, customer }`. Email unique (`'An account with this email already exists'`), password ≥ 8 chars, phone validated like checkout. |
| `POST /login` | `{ email, password }` → `{ token, customer }` or 401 `'Email or password is incorrect'` (same message for unknown email — no enumeration). |
| `GET /me` | Bearer → `{ customer }` (never returns hash/salt). |
| `PUT /me` | Update fullName, phone, savedAddress (validated like admin address edits). |
| `GET /orders` | Orders where `customerAccountId === id` **or** normalized phone matches account phone (links past guest orders). Sorted newest-first, order-summary shape + items. |

Token: `<id>.<expEpoch>.<hmacSHA256(id.exp, secret)>`, 30-day expiry, verified by
`requireCustomer` middleware. Client stores it in `localStorage['maria-clara-customer-token']`.

Checkout change (`routes/orders.js`): if a valid customer Bearer header is present on
`POST /api/orders`, stamp `customerAccountId` on the order. Guests unaffected.

## Frontend (`apps/web`)

- `lib/customerAuth.js` — token store + `customerFetch` (mirrors `adminApi.js`), React hook for auth state.
- Pages: `/login`, `/register`, `/account` (profile + address editor, order list with status badge,
  tracking number, **Buy again** = re-add in-stock items to cart and report sold-out sizes).
- Header: "Account" link (→ `/account` when logged in, `/login` otherwise).
- Checkout: prefills contact + address selects from `savedAddress` when logged in; after a
  successful order, offers "Save this address to my account" if it differs.

## Testing

`apps/api/test/customerAccounts.test.js` (temp-file isolation + createFreshApp like the others):
register → duplicate email 400 → login wrong password 401 → me 200/401 → PUT me →
guest order with same phone appears in `GET /orders` → logged-in checkout stamps
`customerAccountId`. Target: full suite green.

## Out of scope (v1)

Password reset email, email verification, phone OTP, wishlist, login rate limiting
(enhancement proposal #3), admin UI for customer accounts (admin already has the
order-derived Customers module).
