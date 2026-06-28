# Collection Product Countdown Design

**Design date:** 2026-06-28

**Status:** Approved visual and behavioral design; awaiting written-spec review.

**Visual direction:** Modern Tailwind component using the existing Maria Clara orange brand palette.

## Goal

Add an editable marketing countdown to customer product pages. An administrator configures one countdown per storefront collection, while each visitor receives a persistent personal countdown for the first collection assigned to the product.

The countdown is a marketing display only. It never changes catalog prices, compare-at prices, promotions, discounts, shipping, checkout totals, inventory, or Meta tracking.

## Fixed Decisions

- Countdown settings belong to collections, not individual products.
- A product uses only its first assigned collection.
- If the first collection has no enabled countdown, the product shows no countdown. The application does not fall through to another collection.
- Each collection has independent visibility, message, duration, and revision settings.
- A countdown starts once per visitor and persists across refreshes and browser restarts using `localStorage`.
- Saving a collection countdown creates a new revision and restarts that collection's timer for visitors.
- Reaching zero hides the countdown for that visitor.
- Existing products, pricing, and discount behavior remain unchanged.

## Storage Model

Store countdown configuration in the existing storefront settings record. No new collection table or database migration is required.

```json
{
  "collectionCountdowns": {
    "New Arrivals": {
      "enabled": true,
      "message": "Hurry! Limited time left",
      "durationSeconds": 7200,
      "revision": 3
    },
    "Freedom of Mind": {
      "enabled": false,
      "message": "Limited-time collection offer",
      "durationSeconds": 3600,
      "revision": 1
    }
  }
}
```

The JSON settings fallback and PostgreSQL-backed `store_settings` repository use the same shape. `collectionCountdowns` is included in the safe public storefront-settings response because it contains no secret or administrative data.

### Validation

- Collection name must be one of the storefront collections managed by the Collections page.
- `enabled` must be boolean.
- `message` is trimmed and limited to 120 characters.
- An enabled timer requires a non-empty message.
- `durationSeconds` must be an integer from `1` through `359999`, equivalent to `00:00:01` through `99:59:59`.
- A disabled timer may retain its last message and duration for later editing.
- `revision` is server-managed and must not be trusted from the browser.

## Admin Workflow

The existing **Admin > Collections** screen remains responsible for collection membership and gains a **Product page countdown** card for the selected collection.

The card contains:

- Show countdown toggle.
- Marketing message input.
- Separate hours, minutes, and seconds inputs.
- Compact live preview.
- **Save and restart countdown** button.
- Explanation that the product's first assigned collection controls its timer.

Saving validates the form, persists the selected collection configuration, and increments its revision atomically. The button wording makes the visitor reset behavior explicit. Disabling and saving hides the timer immediately. Enabling it again and saving creates another revision, giving visitors a fresh duration.

Admin controls use the existing authenticated admin API and settings repository. The API ignores any client-supplied revision and calculates `previousRevision + 1`.

## Customer Product Page

The product page reads `product.collections[0]`, then looks up the matching entry in `settings.collectionCountdowns`.

The countdown renders below the price and above size selection when:

- The first collection has a configuration.
- The configuration is enabled.
- The duration and message are valid.
- The visitor's stored deadline has remaining time.

It can appear on any product in the collection. Product sale status and compare-at pricing do not control countdown visibility.

### Visual Design

- Implemented with existing Tailwind utilities rather than a new styling dependency.
- Rounded orange-tinted card with a subtle border and shadow.
- Small clock icon and editable uppercase marketing message.
- Hours, minutes, and seconds shown in compact white digit tiles.
- Responsive layout that fits the existing mobile and desktop product columns.
- Existing product price, size selector, quantity, and add-to-cart hierarchy remain intact.

The timer uses semantic text and a stable `role="timer"` label. The changing digits are not an assertive live region, preventing screen readers from announcing every second.

## Visitor Persistence

Use one local-storage record per normalized collection name:

```text
maria-clara-collection-countdown:<collection-key>
```

Stored value:

```json
{
  "revision": 3,
  "deadlineMs": 1782639000000
}
```

Resolution algorithm:

1. If configuration is missing, disabled, or invalid, render nothing.
2. Read the collection record from `localStorage`.
3. If no record exists or its revision differs, set `deadlineMs = Date.now() + durationSeconds * 1000` and persist it.
4. If the revision matches, reuse the stored deadline.
5. Recalculate remaining time once per second using `deadlineMs - Date.now()` rather than decrementing a counter, so background-tab throttling does not extend the timer.
6. At zero, render nothing but retain the expired record. Retaining it prevents a refresh from restarting the same revision.
7. A later admin save changes the revision, which creates a fresh visitor deadline.

If storage access is unavailable or malformed, the page must not fail. It uses an in-memory deadline for the current page view and reports no customer-facing error.

## Data Flow

1. Admin selects a collection and loads its countdown settings.
2. Admin edits visibility, message, or duration and saves.
3. API validates the input, increments the revision, and saves storefront settings.
4. Customer product page loads the product and public storefront settings.
5. The page selects the product's first collection configuration.
6. A countdown helper resolves or creates the visitor deadline.
7. The React component displays remaining time until zero, then unmounts.

No countdown value is sent with cart, quote, checkout, order, or analytics requests.

## Error Handling

- Invalid admin input returns a `400` response and leaves existing settings unchanged.
- Concurrent saves use the currently stored revision as the source of truth; each successful save increments it.
- Missing settings return an empty countdown map.
- Unknown collection keys are rejected by the admin endpoint.
- Invalid or corrupted visitor storage is replaced with a valid record for the current revision.
- Product and settings fetch failures preserve existing page behavior; countdown failure never blocks product purchasing.

## Testing

### Unit tests

- Convert hours, minutes, and seconds to a validated duration.
- Reject zero, negative, non-integer, and greater-than-`99:59:59` durations.
- Select only the first product collection.
- Create a visitor deadline for a new revision.
- Reuse a deadline for the same revision.
- Restart when the revision changes.
- Keep an expired record hidden without restarting it.
- Recover from malformed or unavailable storage.
- Format remaining time as zero-padded `HH:MM:SS`.

### API and repository tests

- Public storefront settings expose normalized collection countdowns.
- Admin save requires authentication and validates collection, message, and duration.
- Server increments the revision and ignores a supplied revision.
- Disabled settings persist editable values while remaining hidden publicly at the component level.
- JSON and PostgreSQL settings modes return the same configuration shape.

### UI and build tests

- Collections admin screen contains the approved toggle, message, time fields, preview, and save action.
- Product page places the modern Tailwind countdown between price and size selection.
- Disabled, invalid, and expired countdowns do not render.
- The timer disappears at zero without changing price or cart state.
- Existing API tests, web tests, and production build pass.

## Scope Boundaries

Included:

- Collection-level settings and admin editor.
- Public settings exposure.
- Per-visitor local persistence.
- Modern responsive product-page component.
- Validation and automated tests.

Excluded:

- Price or discount expiration.
- Fixed shared campaign deadlines.
- Per-product countdown overrides.
- Server-side visitor tracking.
- Cross-device countdown synchronization.
- Countdown data in Meta Pixel or Conversions API events.

## Acceptance Criteria

- Admin can independently configure and hide a countdown for each storefront collection.
- Products use only their first assigned collection's countdown.
- A configured timer persists for a visitor across refreshes and browser restarts.
- Saving the admin configuration restarts that collection's timer through a new revision.
- The timer hides at zero and does not restart for the same revision.
- Countdown behavior never changes pricing, promotions, checkout, or tracking.
- The approved modern Tailwind layout works on mobile and desktop.
