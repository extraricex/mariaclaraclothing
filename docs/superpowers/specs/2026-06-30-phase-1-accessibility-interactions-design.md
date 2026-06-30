# Phase 1 Accessibility and Interaction Design

## Goal

Improve storefront accessibility and input behavior without changing the approved layout, typography, product presentation, or two-tone visual direction.

## Approved Visual Direction

- Do not add a carousel pause button or pause label.
- Keep the existing carousel dots as the only visible slide controls.
- Remove automatic slide rotation; visitors change slides manually with the existing dots.
- Slightly darken secondary `text-clay` copy while retaining the same black-and-white theme.
- Keep small controls visually unchanged while increasing their effective touch area.
- Keep the cart drawer and mobile menu visually unchanged.

## Scope

### Accessible Cart Drawer

The cart drawer will:

- Expose dialog semantics with `role="dialog"`, `aria-modal="true"`, and a heading relationship.
- Move keyboard focus into the drawer when opened.
- Keep Tab and Shift+Tab focus within the open drawer.
- Close when Escape is pressed.
- Restore focus to the element that opened it.
- Lock background page scrolling while open and restore it when closed.
- Make closed drawer content unavailable to keyboard and assistive-technology navigation.
- Preserve overlay-click and Close-button behavior.

### Accessible Mobile Menu

The mobile menu will:

- Keep its current header dropdown layout and styling.
- Close when Escape is pressed.
- Restore focus to the Menu control after Escape closes it.
- Continue closing after a navigation link is selected.
- Provide an explicit accessible name describing whether the control opens or closes the menu.
- Avoid trapping focus because the menu remains an inline navigation region rather than a modal dialog.

### Carousel Motion

The homepage carousel will:

- Remove the five-second automatic timer.
- Keep the existing slide-dot buttons and opacity transition.
- Change slides only after a visitor selects a dot.
- Retain the current active-dot state and slide alternative-text behavior.
- Disable the opacity transition when reduced motion is requested.
- Add no new pause, play, or text control.

### Secondary Text Contrast

- Change the `--color-clay` mix from 58% dark to approximately 65% dark.
- Target at least 4.5:1 contrast against `#F1F1F1` for normal-size secondary text.
- Keep `#202020` and `#F1F1F1` as the only theme endpoints.
- Leave `--color-ink-soft` and layout tokens unchanged.

### Touch Targets

Increase the effective touch area to at least 44 by 44 CSS pixels for:

- Homepage slide dots.
- Cart and checkout quantity controls.
- Drawer and promo Close controls.
- Header Menu control.
- Other icon-only controls found in the same storefront interaction paths.

The visible dot, icon, text, and border sizes remain unchanged. Extra hit area must not create overlap or layout movement.

## Architecture

- Put reusable focus-management behavior in a small storefront hook or utility instead of expanding `Shell.jsx` with unrelated event logic.
- Keep dialog ownership in the cart drawer component.
- Keep mobile-menu keyboard behavior in the shell because it owns the menu state and trigger.
- Keep carousel state in `Home.jsx`; removing the interval eliminates timer cleanup complexity.
- Put shared touch-target and reduced-motion rules in `apps/web/src/index.css`.

## State and Error Handling

- Focus restoration must tolerate the opening element being removed before close.
- Body overflow must always be restored during close and component cleanup.
- An empty drawer receives focus on its Close control; a populated drawer receives focus on its Close control as the stable first target.
- Hidden drawer controls must not be tabbable.
- Repeated open/close cycles must not accumulate event listeners.

## Testing

Implementation will follow test-first development.

### Source and Unit Coverage

- Contrast token uses the approved endpoint mix and meets the calculated threshold.
- Homepage no longer installs an autoplay interval.
- Carousel dots remain semantic buttons with active state and labels.
- Drawer exposes the required dialog attributes.
- Focus and body-scroll cleanup utilities handle open, close, and unmount.

### Browser Coverage

Add Playwright tests at representative mobile and desktop widths for:

- Opening the cart drawer and confirming focus moves inside.
- Cycling with Tab and Shift+Tab without leaving the drawer.
- Closing with Escape and restoring focus.
- Confirming background scrolling is locked only while open.
- Opening and closing the mobile menu with keyboard input.
- Confirming slides remain stationary until a dot is selected.
- Confirming small controls retain their current visual dimensions and effective hit areas.

### Regression Verification

- Run the full web source test suite.
- Run the relevant Playwright tests.
- Build the production web bundle.
- Rebuild and restart Docker.
- Verify the storefront and API health endpoints.

## Files Expected to Change

- `apps/web/src/components/Shell.jsx`
- `apps/web/src/pages/Home.jsx`
- `apps/web/src/index.css`
- A focused accessibility/focus utility or hook under `apps/web/src/`
- Web source tests under `apps/web/test/`
- Playwright tests under `apps/web/e2e/`

## Non-Goals

- No carousel pause or play button.
- No new layout, navigation structure, font, product-card design, shadow, or color endpoint.
- No SEO, image optimization, route splitting, admin table, dashboard API, authentication, or security-header work in Phase 1.
- No broad component refactor beyond the smallest extraction needed for reliable focus behavior.

## Acceptance Criteria

- The cart drawer is fully operable by keyboard and correctly announced as a modal dialog.
- The mobile menu closes with Escape and returns focus correctly.
- The homepage carousel never advances automatically.
- The hero displays no new pause or play control.
- Normal secondary text meets at least 4.5:1 contrast on the paper background.
- Targeted controls provide at least a 44 by 44 pixel effective hit area without visible enlargement.
- The existing desktop, tablet, and mobile layout remains visually intact.
- All relevant automated tests and the production build pass before deployment.
