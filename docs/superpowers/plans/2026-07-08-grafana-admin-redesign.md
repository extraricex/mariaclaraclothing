# Grafana Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Grafana-inspired admin redesign without changing admin behavior.

**Architecture:** Keep logic in existing components and add a shared admin visual layer in `apps/web/src/index.css`. Update selected admin JSX class names to use reusable panel, metric, table, and page header classes while leaving state, API calls, forms, and event handlers intact.

**Tech Stack:** React, React Router, Tailwind CSS v4, Node source tests, Vite, Docker Compose.

---

### Task 1: Source Tests

**Files:**
- Modify: `apps/web/test/adminResponsiveSource.test.js`
- Modify: `apps/web/test/adminOrdersSource.test.js`
- Modify: `apps/web/test/adminPancakeSource.test.js`

- [ ] Add assertions for Grafana admin tokens and reusable classes in `index.css`.
- [ ] Add assertions that `AdminLayout.jsx` uses `admin-topbar`, `admin-brand-mark`, and route-safe navigation.
- [ ] Add assertions that `Orders.jsx` and `PancakePos.jsx` use `admin-table-shell` and `admin-metric-card`.
- [ ] Run `node --test apps/web/test/adminResponsiveSource.test.js apps/web/test/adminOrdersSource.test.js apps/web/test/adminPancakeSource.test.js` and confirm the new assertions fail before implementation.

### Task 2: Shared Admin Visual System

**Files:**
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/admin/AdminLayout.jsx`

- [ ] Add Grafana-inspired CSS variables for admin surfaces, orange accent, blue, green, yellow, red, and muted text.
- [ ] Add reusable classes: `admin-page-header`, `admin-topbar`, `admin-panel`, `admin-metric-card`, `admin-table-shell`, `admin-status-good`, `admin-status-warn`, `admin-status-bad`, and `admin-status-info`.
- [ ] Update `AdminLayout.jsx` desktop sidebar and mobile nav classes to use the dark admin shell while preserving all route arrays, menu state, and logout behavior.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Page Styling Pass

**Files:**
- Modify: `apps/web/src/admin/Dashboard.jsx`
- Modify: `apps/web/src/admin/Orders.jsx`
- Modify: `apps/web/src/admin/PancakePos.jsx`

- [ ] Replace hand-built card/table classes with shared admin classes.
- [ ] Keep all data loading, API calls, state updates, route links, inputs, and buttons unchanged.
- [ ] Keep Pancake POS live-order status copy and advanced mapping controls unchanged.
- [ ] Run all web source tests.

### Task 4: Build, Docker, Smoke

**Files:**
- Generated: `apps/web/dist/*`

- [ ] Run `npm run build` in `apps/web`.
- [ ] Run `docker compose build web`.
- [ ] Run `docker compose up -d --force-recreate web`.
- [ ] Smoke check `/admin` and `/admin/pancake` with Playwright.
- [ ] Stop the visual companion server.
