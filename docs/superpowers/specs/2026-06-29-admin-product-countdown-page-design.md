# Admin Product Countdown Page Design

**Design date:** 2026-06-29

**Status:** Approved design; awaiting written-spec review.

## Goal

Move the collection-controlled product countdown editor out of the Collections page and into a dedicated page under the admin Products dropdown.

## Navigation

Add `Product page countdown` to the Products submenu in this order:

1. All products
2. Collections
3. Product page countdown
4. Inventory

The dedicated route is `/admin/products/countdown`. Because this is a static route, it must be declared alongside the Products routes and remain distinct from `/admin/products/:slug`.

The Products navigation group remains expanded and active on the countdown page.

## Dedicated Page

Create `apps/web/src/admin/ProductCountdown.jsx` as the sole owner of the countdown editor UI.

The page includes:

- `Products` eyebrow and `Product page countdown` heading.
- Explanatory text that the first collection assigned to a product controls its countdown.
- Collection tabs for `New Arrivals` and `Freedom of Mind`.
- Show-countdown toggle.
- Editable marketing message.
- Hours, minutes, and seconds fields.
- Live preview.
- `Save and restart countdown` action.
- Existing success and validation messages.

The page loads `/api/admin/settings`, reads `collectionCountdowns`, and saves through the existing endpoint:

```text
PUT /api/admin/settings/collection-countdowns/:collectionName
```

No API, repository, database, customer countdown, pricing, discount, cart, checkout, or Meta behavior changes.

## Collections Page

Remove all countdown responsibilities from `Collections.jsx`:

- Countdown imports.
- Countdown settings state.
- Countdown form state.
- Admin settings request.
- Countdown synchronization effect.
- Countdown save handler.
- Countdown editor markup.

The Collections page returns to one responsibility: assigning products to storefront collections. Its initial load requests only the product list, which makes the page simpler and faster.

## Shared Behavior

The new page reuses:

- `durationPartsToSeconds` for validation.
- `formatRemainingTime` for editable fields.
- Existing authenticated `adminJson` and `adminSend` helpers.
- Existing Tailwind visual design and accessible toggle behavior.

Saving a countdown continues to increment the server-owned revision and restart that collection's visitor timers. Disabled timers remain hidden on customer product pages.

## Error Handling

- Settings-load failures render the existing admin status message.
- Invalid duration or message errors remain visible without navigation or reload.
- Failed saves preserve the form contents.
- Successful saves update local countdown state from the server response.
- No page refresh is required when switching collections or saving.

## Testing

Automated tests verify:

- Products submenu includes the new link in the correct group.
- App routes `/admin/products/countdown` to `ProductCountdown` rather than `ProductEditor`.
- Dedicated page contains the approved editor controls and existing API path.
- Collections no longer imports countdown helpers, requests admin settings, or renders the countdown editor.
- Existing countdown utility and customer product-page tests remain green.
- Full web tests and production build pass.

## Acceptance Criteria

- Clicking `Product page countdown` in the Products dropdown opens the editor immediately.
- The editor is no longer displayed on the Collections page.
- Both collection countdowns remain independently editable.
- Saving and restarting works without a page refresh.
- Customer countdown behavior is unchanged.
- No backend changes are introduced.
