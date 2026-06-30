# Site-Wide Interactive Cursor Design

## Goal

Keep the hand pointer visible everywhere the user can activate a control, including while the pointer is over nested text, icons, images, or SVG elements inside that control.

## Scope

The rule applies across the storefront and admin interface to enabled buttons, ARIA buttons, links, button-style classes, text actions, summaries, and labels associated with form controls. Descendants of these interactive elements inherit the same pointer explicitly so component or utility styles cannot return the cursor to its default appearance within the control boundary.

Disabled buttons and `aria-disabled="true"` controls continue to use `cursor: not-allowed`. They must not show the hand pointer because they cannot be activated.

## Implementation

Add two shared cursor selector groups in `apps/web/src/index.css`:

- enabled interactive controls and their descendants use `cursor: pointer !important`;
- disabled controls and their descendants use `cursor: not-allowed !important`.

The explicit priority makes the global interaction contract resilient to Tailwind cursor utilities and component-level rules. No layout, theme, animation, typography, or hover-effect changes are included.

## Testing and Deployment

Source tests will require both selector groups. Playwright will inspect enabled controls and nested descendants across storefront pages and the admin login, and it will verify that a disabled product-size button retains the not-allowed cursor. After verification, the web Docker image will be rebuilt and restarted.
