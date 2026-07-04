# Free-Shipping Promo and Messenger Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not perform Git operations.

**Goal:** Replace the automatic privacy aside with a cart-aware free-shipping offer and add configurable Facebook Messenger customer support.

**Architecture:** Extend the existing general store settings with one validated public `messengerUrl`. Keep offer-state calculation in a small storefront helper, render the approved fixed-corner controls from `Shell`, and preserve Meta default-denial through a footer-opened privacy dialog.

**Tech Stack:** Node.js, Express, React 18, Tailwind CSS, Node test runner, Playwright.

---

### Task 1: Messenger store setting

**Files:**
- Modify: `apps/api/src/settings/storeSettingsRepository.js`
- Modify: `apps/api/src/routes/storeSettings.js`
- Modify: `apps/api/test/storeSettings.test.js`
- Modify: `apps/api/test/adminSettings.test.js`

- [ ] **Step 1: Add failing setting tests**

Assert that defaults contain `messengerUrl: ''`, an HTTPS `m.me`, Messenger, or Facebook URL persists and appears in `/api/storefront-settings`, and `http:`, `javascript:`, or unrelated hosts return status 400.

- [ ] **Step 2: Run the focused tests and confirm the new assertions fail**

Run: `node --test test/storeSettings.test.js test/adminSettings.test.js`

- [ ] **Step 3: Implement normalization and public exposure**

Add `messengerUrl` to the general default and normalize with:

```js
function normalizeMessengerUrl(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  let parsed;
  try { parsed = new URL(input); } catch { throw badRequest('Enter a valid Messenger URL.'); }
  const hosts = new Set(['m.me', 'messenger.com', 'www.messenger.com', 'facebook.com', 'www.facebook.com']);
  if (parsed.protocol !== 'https:' || !hosts.has(parsed.hostname.toLowerCase())) {
    throw badRequest('Messenger URL must use HTTPS and point to Messenger or Facebook.');
  }
  return parsed.toString();
}
```

Return the value in the safe public settings projection.

- [ ] **Step 4: Run the focused API tests and confirm they pass**

Run: `node --test test/storeSettings.test.js test/adminSettings.test.js`

### Task 2: Admin Messenger configuration

**Files:**
- Modify: `apps/web/src/admin/Settings.jsx`
- Modify: `apps/web/src/lib/storeSettings.js`
- Modify: `apps/web/test/adminSettingsSource.test.js`

- [ ] **Step 1: Add failing source tests**

Require a `Messenger chat link` field bound to `form.messengerUrl` and require the storefront default to expose `messengerUrl: ''`.

- [ ] **Step 2: Run the focused source test and confirm failure**

Run: `node --test test/adminSettingsSource.test.js`

- [ ] **Step 3: Add the General Settings field and client default**

```jsx
<Field label="Messenger chat link">
  <input
    className="field mt-1"
    type="url"
    placeholder="https://m.me/your-page"
    value={form.messengerUrl || ''}
    onChange={(event) => set('messengerUrl', event.target.value)}
  />
</Field>
```

- [ ] **Step 4: Run the focused source test and confirm pass**

Run: `node --test test/adminSettingsSource.test.js`

### Task 3: Offer-state helper and approved storefront controls

**Files:**
- Create: `apps/web/src/lib/storefrontSupport.js`
- Create: `apps/web/test/storefrontSupport.test.js`
- Modify: `apps/web/src/components/Shell.jsx`
- Modify: `apps/web/test/storefrontEnhancements.test.js`

- [ ] **Step 1: Add failing helper and source tests**

Cover disabled shipping, zero items, below-threshold pluralization, unlocked state, URL visibility, `target="_blank"`, `rel="noreferrer"`, fixed opposite corners, and accessible labels.

- [ ] **Step 2: Run tests and confirm the helper is missing**

Run: `node --test test/storefrontSupport.test.js test/storefrontEnhancements.test.js`

- [ ] **Step 3: Implement the pure offer model**

```js
export function freeShippingOffer(shipping, quantity) {
  if (!shipping?.freeShippingEnabled) return null;
  const threshold = Math.max(1, Number(shipping.freeShippingMinimumItems || 2));
  const remaining = Math.max(0, threshold - Number(quantity || 0));
  if (!remaining) return { state: 'unlocked', title: 'FREE SHIPPING UNLOCKED', body: 'Your order qualifies automatically.' };
  if (!quantity) return { state: 'offer', title: `GET ${threshold}+ ITEMS — FREE SHIPPING`, body: 'Your shipping fee is on us.' };
  return { state: 'progress', title: `ADD ${remaining} MORE ITEM${remaining === 1 ? '' : 'S'}`, body: 'Unlock free shipping on this order.' };
}
```

- [ ] **Step 4: Render `FreeShippingAside` and `MessengerSupportLink`**

Use session storage for dismissal with a guarded read/write, render the card at bottom-left with responsive width, and render the Messenger link at bottom-right only when `storeInfo.messengerUrl` exists. The link uses a Messenger SVG, not a third-party script.

- [ ] **Step 5: Run focused web tests**

Run: `node --test test/storefrontSupport.test.js test/storefrontEnhancements.test.js`

### Task 4: Footer-opened privacy dialog

**Files:**
- Modify: `apps/web/src/components/Shell.jsx`
- Modify: `apps/web/test/metaPixel.test.js`
- Modify: `apps/web/test/storefrontEnhancements.test.js`

- [ ] **Step 1: Add a failing source assertion**

Assert that the old automatic `trackingConsent === 'unset'` rendering is absent and the footer action explicitly opens the privacy dialog.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --test test/metaPixel.test.js test/storefrontEnhancements.test.js`

- [ ] **Step 3: Separate privacy dialog visibility from stored consent**

Use `privacyDialogOpen` state. Footer click sets it true; Allow/Decline persists consent and closes it. Do not open it automatically when consent is unset.

- [ ] **Step 4: Run focused tests and confirm pass**

Run: `node --test test/metaPixel.test.js test/storefrontEnhancements.test.js`

### Task 5: Verification and Docker deployment

**Files:**
- Modify if required by regressions: only files already listed above

- [ ] **Step 1: Run complete API and web tests**

Run API tests with the repository's Node 22-compatible command and run `node --test apps/web/test/*.test.js`. Expected: zero failures.

- [ ] **Step 2: Build the production web app**

Run: `npm run build:web`. Expected: Vite build exit 0.

- [ ] **Step 3: Run Playwright interactions**

Run: `npx playwright test -c playwright.config.js` from `apps/web`. Expected: all active journeys pass.

- [ ] **Step 4: Rebuild and restart Docker**

Run: `docker compose build` then `docker compose up -d --force-recreate`.

- [ ] **Step 5: Verify the deployed stack**

Check `docker compose ps`, `/api/health`, public settings, security headers, admin setting persistence, promo responsiveness, Messenger link safety, and footer privacy interaction. Remove any temporary verification setting afterward.
