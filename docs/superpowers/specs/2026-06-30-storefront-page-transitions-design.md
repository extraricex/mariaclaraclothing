# Storefront Page Transitions Design

## Goal

Add a restrained, luxury-style transition between customer-facing pages without changing the storefront layout, typography, colors, content, or administrative interface.

## Scope

The transition applies to all customer-facing routes, including the homepage, product, cart, checkout, confirmation, customer account, authentication, and information pages. Administrative routes under `/admin` remain unchanged.

The persistent storefront shell stays visually stable. Its header and footer do not leave and re-enter on every route change; only the routed page content animates. The standalone checkout route uses the same content transition even though it does not use the storefront shell.

## Motion Design

The approved direction is a subtle fade and rise:

- The incoming page begins at zero opacity and 10 pixels below its resting position.
- It reaches full opacity and its resting position over 320 milliseconds.
- The easing curve is `cubic-bezier(0.22, 1, 0.36, 1)` for a soft deceleration.
- Navigation completes immediately. There is no artificial loading delay and no exit animation.
- Each new pathname scrolls to the top before the incoming animation is presented.

Avoiding an exit animation prevents blank intermediate screens, delayed interactions, and coordination problems when data-backed pages render at different speeds.

## Architecture

Create a small reusable `PageTransition` component that reads the current React Router location. The component keys its content by pathname so route content receives a fresh entry animation after navigation. It also owns the pathname-based scroll reset.

The storefront shell wraps its `Outlet` with `PageTransition`, keeping the shared header, navigation, cart drawer, and footer outside the animated boundary. The standalone checkout route receives the same wrapper at the route composition level.

Motion styling lives in the shared storefront stylesheet as a dedicated class and keyframes. No animation package or additional runtime dependency is required.

## Accessibility and Failure Behavior

The animation is decorative and never controls whether content is available. Browsers that do not run the animation still render the final page normally.

When `prefers-reduced-motion: reduce` is active, the transition animation and transform are disabled so routed content appears immediately. Navigation, keyboard focus, links, forms, dialogs, and browser history behavior remain functional regardless of animation support.

The transition wrapper must not introduce an extra landmark or alter existing document semantics.

## Testing

Source-level tests will verify:

- the reusable transition component exists and is location-keyed;
- the storefront shell animates routed content while keeping shared chrome outside the boundary;
- checkout uses the same transition;
- the stylesheet contains the approved duration, distance, easing, and reduced-motion override;
- admin routes do not use the storefront transition wrapper.

Browser tests will verify:

- navigating between storefront pages applies the incoming animation;
- the header remains mounted and stable across navigation;
- a new pathname resets the document to the top;
- reduced-motion emulation removes the route animation;
- route content remains interactive after navigation.

## Out of Scope

- Layout, theme, typography, photography, and content changes
- Admin dashboard transitions
- Page exit animations, loading curtains, wipes, or progress indicators
- Component-level reveal animations within individual pages
- Third-party animation libraries
