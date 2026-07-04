# Responsive Upsell and Chat Support Design

## Goal

Add a compact random New Arrivals recommendation above the free-shipping prompt and label the Messenger control “Chat Support” without obscuring storefront content on narrow devices.

## Approved layout

- Desktop and tablet: a dismissible recommendation card is stacked directly above the existing free-shipping card in the bottom-left corner. Messenger remains in the bottom-right as a pill with “Chat Support” to the left of its icon.
- Phone and narrow screens: the two bottom-left offers start collapsed behind a small `Offers · 2` button. Tapping it expands the cards; Escape, an outside click, navigation, or the toggle collapses them. The Messenger control uses the shorter visible label `Chat` while retaining the accessible name “Chat Support — open Messenger”.
- Widths use viewport-safe maximums and safe-area offsets. Only the controls accept pointer events, so their containing layers do not block surrounding page interaction.

## Recommendation behavior

- Fetch the existing public product catalog once from `/api/products`.
- Eligible products must be active catalog results, belong to the `New Arrivals` collection, have a slug, and have at least one image.
- Pick one eligible item using a random index after the catalog loads. Keep that item stable for the lifetime of the mounted storefront shell, including client-side page navigation.
- Render the first product image, product name, formatted price, and a link to its product page.
- If loading fails or no eligible product exists, omit the recommendation and show only the applicable free-shipping offer.
- Dismissing the recommendation lasts for the current browser session, independently of the free-shipping dismissal.

## Accessibility and interaction

- Recommendation image has product-derived alternative text.
- Offer toggle exposes `aria-expanded` and `aria-controls`.
- Expanded mobile offers can be dismissed with Escape and outside click.
- Messenger remains an external link with `noopener noreferrer`, an accessible label, and visible keyboard focus.
- Motion and hover treatments remain restrained and follow existing reduced-motion behavior.

## Verification

- Unit-test eligible product filtering and deterministic selection through an injected random value.
- Source-test responsive classes, labels, disclosure attributes, and product loading wiring.
- Run the complete web and API test suites, production build, Playwright suite, and deployed browser checks after rebuilding Docker.

## Constraints

- Preserve the established black/white theme and typography.
- No Git operations.
