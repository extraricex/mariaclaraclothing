# Storefront Transition Refinement Design

## Goal

Make storefront page changes clearly noticeable while eliminating the temporary white product-photo backgrounds seen when returning to the homepage.

## Root Cause

The route entry animation applies opacity and transform to the page wrapper. During its active 320-millisecond interval, that wrapper creates a stacking context. Product cards have transparent ancestors and use `mix-blend-mode: multiply`, so the temporary stacking context prevents them from reaching the document's `#f1f1f1` backdrop. Their source-image white backgrounds remain visible until the transform is released.

The current 10-pixel movement also reaches approximately 95 percent completion within 120 milliseconds because of its short duration and easing, making the route transition difficult to notice.

## Approved Motion

Use the selected Editorial Glide treatment:

- Animate incoming route content for 480 milliseconds.
- Begin at 6 percent opacity and 18 pixels below the resting position.
- Use `cubic-bezier(0.22, 1, 0.36, 1)` for a soft editorial deceleration.
- Keep navigation immediate with no exit animation or artificial loading delay.
- Keep shared header, footer, mobile menu, and cart drawer outside the animated boundary.

## Stable Product Backdrop

The `.page-transition` wrapper receives `background-color: var(--color-paper)`. This gives product photos a `#f1f1f1` backdrop inside the temporary animation stacking context, so `mix-blend-mode: multiply` works from the first rendered frame through animation completion.

The animation keeps `backwards` fill mode so transform returns to `none` after 480 milliseconds. This prevents a permanent stacking-context boundary after the transition.

## Accessibility and Scope

The existing `prefers-reduced-motion: reduce` behavior remains unchanged: animation and transform are disabled and content renders immediately. No layout, typography, theme endpoint, content, admin route, carousel, or component-level reveal behavior changes are included.

## Testing

Source tests will require the approved duration, offset, starting opacity, easing, paper background, backwards fill mode, and reduced-motion override.

Browser tests will verify that:

- the route animation reports a 480-millisecond duration;
- the transition wrapper background is `rgb(241, 241, 241)` during navigation;
- transform returns to `none` after animation;
- homepage product photos retain `mix-blend-mode: multiply` while the transition is active;
- the mobile product route stays within its viewport;
- existing storefront accessibility interactions continue to pass.

After verification, the web Docker image will be rebuilt and the live storefront endpoint will be checked.
