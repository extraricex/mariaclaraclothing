# Grafana Admin Redesign Design

## Goal

Redesign the Maria Clara admin website into a friendlier Grafana-inspired operations UI without changing existing admin functions, routes, API calls, or data behavior.

## Approved Direction

Use visual direction A from the companion mockup: dark operational sidebar, readable light/dark content contrast, clearer metric cards, status colors, denser tables, and action hierarchy built for daily store operations.

## Scope

- Restyle the shared admin shell, desktop sidebar, mobile nav, buttons, fields, panels, metric cards, tables, and badges.
- Update high-traffic admin pages to use the new shared classes where they currently hand-style cards and tables.
- Preserve all existing React state, API endpoints, navigation routes, form controls, export actions, and Pancake POS sync actions.
- Keep Tailwind as the styling system. Do not add a new UI framework or dependency.

## Non-Goals

- No backend changes.
- No database changes.
- No route changes.
- No changes to order, product, Pancake, customer, discount, inventory, settings, or website-content behavior.
- No secret display in the browser.

## Design

The admin becomes an operations console:

- Sidebar: dark Grafana-style navigation with active orange accent and improved grouping.
- Main area: quiet dark canvas with panel surfaces, compact page headers, global search-like affordance, and stable spacing.
- Dashboard: metric tiles, workload panels, chart panels, and recent activity lists use the same visual system.
- Orders and Pancake POS: tables use rounded panel frames, sticky-looking headers, clearer hover states, and status colors.
- Global components: `.admin-panel`, `.admin-metric-card`, `.admin-table-shell`, `.admin-status-*`, and `.admin-page-header` provide reusable styling without changing component logic.

## Verification

- Add source tests that assert the admin has the Grafana visual tokens/classes and that key pages use the new shared classes.
- Run all web source tests.
- Run the Vite production build.
- Rebuild and restart the Docker `web` service.
- Browser smoke check `/admin` and `/admin/pancake`.
