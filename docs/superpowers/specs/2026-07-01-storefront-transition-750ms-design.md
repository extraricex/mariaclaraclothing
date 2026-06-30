# Storefront Transition 750ms Design

## Goal

Make the approved Editorial Glide page transition easier to notice by slowing its duration from 480 milliseconds to 750 milliseconds.

## Change

Only the `.page-transition` animation duration changes. The following approved behavior remains unchanged:

- 6 percent starting opacity
- 18-pixel vertical rise
- `cubic-bezier(0.22, 1, 0.36, 1)` easing
- `backwards` fill mode so transform returns to `none`
- `var(--color-paper)` background throughout the active animation
- immediate navigation with no exit animation or artificial delay
- stable header, footer, menu, and cart drawer
- instant rendering under `prefers-reduced-motion: reduce`

## Testing and Deployment

Source and browser contracts will require a 750-millisecond duration while retaining the existing background, transform-release, product-blending, responsive-width, and reduced-motion assertions. The production web image will then be rebuilt and restarted through Docker Compose, followed by live endpoint and computed-style checks.

## Out of Scope

No layout, content, typography, theme, animation distance, opacity, easing, product-image, admin, or component-level reveal changes are included.
