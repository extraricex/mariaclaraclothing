# Free-Shipping Promo and Messenger Support Design

## Goal

Replace the fixed privacy aside with a responsive free-shipping offer and add a customer-support entry point that opens Facebook Messenger, without changing the storefront's main layout or visual theme.

## Approved storefront layout

- A compact offer card is fixed to the bottom-left.
- A circular Messenger action is fixed to the bottom-right.
- Both use the existing `#202020` and `#f1f1f1` theme and remain outside the main page flow.
- On narrow screens the offer width leaves enough room for the Messenger action, so the two controls never overlap.
- Both controls stay clear of the cart drawer and other modal layers.

## Free-shipping offer behavior

The offer derives its state from the existing public shipping settings and current cart quantity. It never hardcodes the qualifying quantity.

- Free shipping disabled: do not render the offer.
- Empty cart: “GET 2+ ITEMS — FREE SHIPPING” using the configured threshold.
- Cart below threshold: “ADD 1 MORE ITEM FOR FREE SHIPPING,” adjusted for the actual remaining quantity.
- Qualified cart: “FREE SHIPPING UNLOCKED.”
- “Shop now” navigates to the storefront product area and closes any open mobile navigation or cart drawer.
- A close control dismisses the offer for the current browser session. A cart change that newly unlocks free shipping may reveal the success state once.

## Messenger support behavior

- Add a `messengerUrl` field to General store settings and expose it through the safe storefront-settings response.
- Admin users configure a direct `https://m.me/...`, `https://messenger.com/...`, or Facebook page URL.
- The floating Messenger action renders only when a valid HTTPS Messenger/Facebook URL is configured; no destination is fabricated.
- Activating the action opens the configured destination in a new tab with `noopener`/`noreferrer` protection.
- The control has an accessible “Chat with us on Messenger” label and visible keyboard focus treatment.

## Privacy behavior

- Remove the automatic fixed privacy aside.
- Keep the footer “Privacy choices” control.
- Activating it opens a compact privacy dialog with Allow and Decline actions.
- Meta browser tracking remains disabled unless the customer explicitly accepts. Removing the automatic prompt must not silently grant consent.

## Data flow and validation

1. Admin General Settings sends `messengerUrl` with the existing general-settings payload.
2. The API trims it and accepts blank values or HTTPS URLs from `m.me`, `messenger.com`, `www.messenger.com`, `facebook.com`, or `www.facebook.com`.
3. Invalid or non-HTTPS values return a clear 400 error and do not overwrite saved settings.
4. The public settings endpoint returns the validated URL.
5. The storefront renders the Messenger control only from that public value.

## Failure handling

- Storefront settings load failure uses existing defaults: the offer still uses the default two-item rule, while Messenger remains hidden because no valid destination is known.
- Popup blocking does not break the storefront; the Messenger control remains a normal external link rather than scripted window creation.
- Session-storage failures leave the offer visible instead of breaking rendering.

## Testing

- API tests cover default values, persistence, public exposure, URL normalization, and invalid URL rejection.
- Web tests cover cart-aware offer copy, disabled offer behavior, responsive non-overlap classes, session dismissal, Messenger visibility, safe external-link attributes, and the footer-only privacy dialog.
- Existing Meta consent tests continue proving default denial and explicit acceptance.
- Production build and Playwright storefront interaction journeys verify the rendered controls.

## Scope exclusions

- No built-in chat inbox, message database, agent presence, automated replies, or third-party chat SDK.
- No Git operations during implementation, per user instruction.
