# Settings

Store settings module backing `/admin/settings` and the public storefront settings API.

- `storeSettingsRepository.js` — dual JSON/Postgres persistence for the settings document
  (`general`, `shipping`, `payments`, `website` sections — website covers the announcement
  ticker, info pages, SEO defaults, and maintenance mode with partial-update merge
  semantics) and the admin credentials record (scrypt password hash + bearer token).
  JSON files: `data/store-settings.json` and the gitignored `data/admin-credentials.json`
  (test overrides `STORE_SETTINGS_FILE` / `ADMIN_CREDENTIALS_FILE`). Postgres:
  `store_settings` key/value JSONB table.
- Admin endpoints live in `src/routes/admin.js` (`GET/PUT /api/admin/settings*`,
  `POST /api/admin/settings/security/*`); the storefront-safe subset is served by
  `src/routes/storeSettings.js` at `GET /api/storefront-settings`.
- Admin auth resolves stored credentials first and falls back to `ADMIN_PASSWORD` /
  `ADMIN_TOKEN` env defaults when no credentials record exists.
- `POST /api/orders` returns 503 while `website.maintenanceMode` is on.

Future phases: notifications, message templates, checkout/inventory/export settings
(see `docs/enhancementdata.md`).
