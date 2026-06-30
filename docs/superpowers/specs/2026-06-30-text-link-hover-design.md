# Text-Link Hover Design

## Goal

Make text-only navigation and action controls visibly clickable while preserving the approved layout, typography, and `#202020` / `#F1F1F1` theme.

## Approved Direction

Use the selected **Option A: underline reveal**. Eligible controls show a pointer cursor and reveal a two-pixel underline on hover. The underline is decorative, does not affect document flow, and therefore does not move surrounding text.

## Scope

Apply one reusable text-action class to:

- Storefront desktop navigation links.
- Storefront mobile navigation links and the Menu/Close control.
- Storefront Account/Log in and other header text actions.
- Storefront footer links, contact-email links, and social links.
- Admin desktop navigation links, collapsible navigation labels, sub-navigation links, mobile navigation links, View store, and Sign out.

Existing filled, outlined, icon-only, image, and product-card controls retain their current interactions. Ordinary inline links inside page copy retain their existing underline treatment.

## Interaction States

- **Default:** no underline; current text color and spacing remain unchanged.
- **Hover:** pointer cursor and a two-pixel underline reveal using the current text color.
- **Keyboard focus:** the underline is visible together with the existing focus-visible outline so focus is not communicated by color alone.
- **Active navigation item:** retains its existing active-state color or background and keeps the underline visible where the reusable class is used.
- **Disabled:** no clickable cursor or hover animation.
- **Reduced motion:** the underline changes immediately without animation.

## Implementation Shape

Define the shared behavior in `apps/web/src/index.css` as a component-layer class. Use a background gradient or an equivalent pseudo-element so the underline can animate without changing layout or relying on the theme accent color, which is the same dark value as the normal text.

Apply that class explicitly to eligible storefront and admin controls. Explicit application avoids turning every anchor into navigation-style UI and protects product cards, logo links, and content links from unintended styling.

## Accessibility

The hover treatment supplements, rather than replaces, pointer and keyboard affordances. Interactive elements remain semantic links or buttons. Focus-visible styling remains present, and reduced-motion users do not receive the underline animation.

## Verification

- Add source-level tests first for the shared class, pointer behavior, hover underline, focus state, reduced-motion behavior, and explicit use in storefront and admin navigation.
- Run the focused test and observe the expected failure before changing production code.
- Run the complete web source test suite.
- Build the production web bundle.
- Rebuild and restart the Docker web service.
- Verify HTTP 200 and confirm the deployed CSS contains the new text-action behavior.

## Non-Goals

- No layout, font, copy, color-theme, or navigation-structure changes.
- No new shadows, filled hover backgrounds, or vertical movement.
- No API or data-model changes.
