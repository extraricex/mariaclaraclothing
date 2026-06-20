# Store Settings Phase 2 Design — Website Section

Phase 2 of the Settings roadmap (`docs/enhancementdata.md`), building on the phase-1
settings module (`docs/superpowers/specs/2026-06-12-store-settings-phase1-design.md`).
Makes the announcement ticker, the info pages (FAQ / Shipping & Returns / Terms), SEO
defaults, and maintenance mode admin-editable. Work branches off `main` in a worktree
and avoids every file the unmerged `codex-edits` branch touches except `App.jsx`
(light, additive) and `orders.js` (one guard block).

## Motivation

Phase 1 made shipping fees and the free-shipping rule editable, but the storefront
still hard-codes that copy in three places: the announcement ticker in `Shell.jsx`,
and the FAQ/Shipping & Returns content in `InfoPage.jsx` (e.g. "Metro Manila & Cavite
₱80 … any 2 items free shipping"). An admin fee change now makes the site contradict
itself. Phase 2 makes that copy editable and adds the two smallest remaining
website-level settings: SEO defaults and maintenance mode.

## Goals

- Admin edits the announcement ticker and the three info pages from the
  **Website content** page (`/admin/banners`).
- Admin edits SEO defaults (title, meta description, share-image URL) and toggles
  **maintenance mode** from new collapsible cards on `/admin/settings`.
- Storefront renders all of it from `/api/storefront-settings`; current hard-coded
  copy becomes the defaults, so behavior is unchanged until something is saved.
- Maintenance mode shows a branded "We'll be right back" screen on the storefront
  (including `/checkout`) and blocks order creation server-side; `/admin/*` and the
  admin API keep working so it can be turned off.

## Out of scope

- Notifications, message templates (need order/cart-session data; overlap with the
  other developer's Orders work on `codex-edits`).
- Checkout/inventory/discount/export settings (later phases).
- Editing the legacy static site (`apps/api/public/`) — it stays the pinned fallback.
- Draft/publish workflow — saves are immediate, like every other settings section.

## Data model

One new `website` section in the existing `store_settings` document:

```js
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
    imageUrl: ''
  },
  maintenanceMode: false,
  infoPages: {
    faq:             [{ heading, body }, ...],
    shippingReturns: [{ heading, body }, ...],
    terms:           [{ heading, body }, ...]
  }
}
```

Defaults for `infoPages` are today's `FAQ_SECTIONS` / `SHIPPING_SECTIONS` /
`TERMS_SECTIONS` from `apps/web/src/pages/InfoPage.jsx`; the API repository keeps its
own copy of those defaults (the web app keeps a matching copy as its fetch-failure
fallback).

Validation (`error.status = 400`, exact messages):

- `ticker`: 1–8 items, each a non-empty trimmed string —
  `'Ticker items must be non-empty text.'` / `'Ticker must have 1 to 8 items.'`
- `seo.title`, `seo.description`: non-empty after trim (missing → fall back to
  current stored value); `seo.imageUrl`: trimmed string, may be empty.
- `infoPages.<page>`: 1–30 rows, each with non-empty `heading` and `body` —
  `'Info page sections need a heading and body.'`; page keys are the fixed set
  `faq | shippingReturns | terms` — unknown key → `'Info page is invalid.'`
- `maintenanceMode`: coerced with `Boolean(...)`.

## Partial-update semantics (differs from phase-1 sections)

The `website` section is edited from two different admin pages, so
`normalizeWebsite(value, current)` merges incoming values over the **stored** section
(normalized, defaults-backed), not over code defaults: a PUT carrying only
`{ ticker }` preserves saved `seo`, `maintenanceMode`, and `infoPages`. Subfields are
replaced whole when present (e.g. sending `infoPages.faq` replaces the FAQ list but
leaves the other two pages). `updateSettingsSection` passes the current stored
section to the normalizer; phase-1 sections keep their existing behavior.

## API

No new endpoints. Changes to existing ones:

- `SETTINGS_SECTIONS` gains `'website'`; `GET /api/admin/settings` and
  `PUT /api/admin/settings/website` work through the existing generic routes.
- `GET /api/storefront-settings` payload gains `ticker`, `seo`, `maintenanceMode`,
  and `infoPages` (all storefront-safe).
- `POST /api/orders` (in `apps/api/src/routes/orders.js`): before checkout
  normalization, when `website.maintenanceMode` is true, respond
  **503 `{ error: 'Store is under maintenance.' }`**. All other public routes stay
  open; admin routes are unaffected.

## Storefront (React app)

- **`Shell.jsx`** — ticker items come from `loadStorefrontSettings()` (current
  `TICKER_ITEMS` as the fallback). A small effect applies `document.title`, the
  `meta[name="description"]`, and `meta[property="og:image"]` (creating the tags if
  absent) from `seo`. The static `index.html` head values remain the no-JS fallback.
- **`MaintenanceGate.jsx`** (new, `apps/web/src/components/`) — loads storefront
  settings; while loading renders children (no flash); when `maintenanceMode` is
  true renders a branded full-screen "We'll be right back." message (logo wordmark +
  short copy) instead of children. In `App.jsx` it wraps the `Shell` route group and
  the `/checkout` route; `/admin/*` routes stay outside it.
- **`InfoPage.jsx`** — becomes settings-driven: takes `title` and `pageKey`
  (`faq | shippingReturns | terms`), loads its sections from settings with the
  current exported arrays as fallback. `App.jsx` route elements pass `pageKey`
  instead of the section arrays.

## Admin UI

- **Website content page** (`apps/web/src/admin/Banners.jsx`) gains two editors,
  each in its own file and PUTting only its subfield of `website`:
  - `apps/web/src/admin/TickerEditor.jsx` — list of text inputs with add / remove /
    move up / move down and a save button.
  - `apps/web/src/admin/InfoPagesEditor.jsx` — sub-tabs for FAQ / Shipping & Returns
    / Terms; each row is a heading input + body textarea with add / remove / move;
    save per page sends `{ infoPages: { <pageKey>: rows } }`.
- **Settings page** (`apps/web/src/admin/Settings.jsx`) gains two collapsible
  `SectionCard`s:
  - **SEO** — title input, description textarea, share-image URL input.
  - **Maintenance** — toggle with explicit warning copy ("Customers see a 'be right
    back' screen and checkout is disabled; the admin stays available."); saving with
    the toggle on requires no extra confirmation (it is instantly reversible).

Both pages reuse the existing `adminSend` helper and `Status` feedback pattern.

## Testing

- `apps/api/test/adminSettings.test.js`: website round-trip; **partial PUT
  preserves the other subfields**; ticker/info-page validation errors; public
  payload contains `ticker`/`seo`/`maintenanceMode`/`infoPages`.
- New `apps/api/test/maintenanceMode.test.js`: orders POST returns 503 with
  maintenance on, 201 after turning it off (temp-file + `createFreshApp` pattern).
- Web source tests: extend `adminSettingsSource.test.js` (SEO + maintenance cards);
  extend `storefrontSettingsSource.test.js` (Shell ticker/SEO effect,
  `MaintenanceGate` wrapping in `App.jsx`, settings-driven `InfoPage`); new
  `adminWebsiteContentSource.test.js` (TickerEditor / InfoPagesEditor hooks).
- Update `apps/api/data/admin-contracts/settings.json` `managedFields` (add
  `announcementTicker`, `maintenanceMode`, `infoPages`; `seoDefaults` already
  listed) and remove the SEO/policy items from `futureAdminActions`; refresh
  `apps/api/src/settings/README.md`.

## Conflict safety vs. codex-edits

New files: `MaintenanceGate.jsx`, `TickerEditor.jsx`, `InfoPagesEditor.jsx`,
`maintenanceMode.test.js`, `adminWebsiteContentSource.test.js`. Modified files not
touched by `codex-edits`: settings repository + tests, `storeSettings.js` (web lib
defaults), `Shell.jsx`, `InfoPage.jsx`, `Banners.jsx`, `Settings.jsx`, contract,
README. Shared-file edits kept additive: `App.jsx` (wrap route groups in
`MaintenanceGate`, pass `pageKey` to info routes) and `orders.js` (one maintenance
guard near the phase-1 payment validation). No `Checkout.jsx`, `AdminLayout.jsx`, or
`adminOrders.test.js` changes. `apps/web/dist` is rebuilt and committed when the work
lands on `main`, per repo convention.
