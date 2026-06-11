# Local PSGC Checkout Addresses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make checkout use complete local Philippine PSGC address data for province, city/municipality, and barangay selection.

**Architecture:** Generate a static browser-readable address dataset under `public/data`. Update `public/js/checkout.js` to load the local dataset first, with remote PSGC and tiny built-in fallbacks only for resilience. Extend frontend/data tests to guard national coverage and shipping contract behavior.

**Tech Stack:** Static JSON, browser ES modules, Node built-in test runner, Express static assets.

---

### Task 1: Add Local PSGC Dataset

**Files:**
- Create: `public/data/philippines-addresses.json`
- Create: `scripts/build-psgc-addresses.mjs`
- Test: `test/frontendBehavior.test.js`

- [ ] Create a script that reads PSGC dump JSON files, normalizes provinces, cities/municipalities, and barangays, and writes `public/data/philippines-addresses.json`.
- [ ] Fetch PSGC dump JSON files from a PSGC-derived public dump source.
- [ ] Run the script and inspect the generated counts.
- [ ] Add tests that assert broad province and barangay coverage.

### Task 2: Load Local Dataset In Checkout

**Files:**
- Modify: `public/js/checkout.js`
- Test: `test/frontendBehavior.test.js`

- [ ] Add `LOCAL_ADDRESS_DATA_URL = '/data/philippines-addresses.json'`.
- [ ] Add a local dataset loader that normalizes generated data into the existing `addressState` shape.
- [ ] Update `loadProvinces`, `loadAllCities`, and `loadBarangaysForCity` so local data is used first.
- [ ] Keep the remote PSGC loader and tiny fallback as secondary fallback paths.
- [ ] Ensure region shipping still derives from selected province code/name/island group.

### Task 3: Verify Checkout Address Coverage

**Files:**
- Verify: `public/data/philippines-addresses.json`
- Verify: `public/js/checkout.js`
- Verify: `test/frontendBehavior.test.js`

- [ ] Run `node --check public/js/checkout.js`.
- [ ] Run `npm test -- test/frontendBehavior.test.js`.
- [ ] Run `npm test`.
- [ ] Start the local server if needed and verify `http://localhost:3100/checkout.html` returns `HTTP/1.1 200 OK`.
