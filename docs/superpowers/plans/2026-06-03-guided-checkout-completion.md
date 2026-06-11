# Guided Checkout Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the guided Cash on Delivery checkout by improving UI polish, client validation, submit state, and order confirmation while preserving the existing admin-ready order contract.

**Architecture:** Keep the current static checkout page and browser module structure. `public/checkout.html` owns markup and hooks, `public/js/checkout.js` owns cart/address/shipping/order behavior, `public/styles.css` owns responsive checkout presentation, and Node tests verify the frontend/API contracts.

**Tech Stack:** Static HTML, CSS, browser ES modules, Express, Node built-in test runner.

---

## File Structure

- Modify: `test/frontendBehavior.test.js`
  - Add contract assertions for the improved checkout status, pending, and confirmation hooks.

- Modify: `test/health.test.js`
  - Strengthen order API assertions for returned COD/admin status fields.

- Modify: `public/checkout.html`
  - Refine checkout copy and add hooks for inline confirmation and pending state.

- Modify: `public/js/checkout.js`
  - Add helpers for checkout status, submit lock/unlock, confirmation rendering, and field validation focus.

- Modify: `public/styles.css`
  - Polish checkout section hierarchy, validation/status messages, success state, summary behavior, and mobile spacing.

No new runtime dependencies are required.

---

### Task 1: Add Checkout Contract Tests

**Files:**
- Modify: `test/frontendBehavior.test.js`
- Modify: `test/health.test.js`

- [ ] **Step 1: Write the failing frontend contract assertions**

In `test/frontendBehavior.test.js`, inside the `checkout page recreates Shopify-style checkout and admin-ready order payload` test, replace:

```js
  assert.match(checkoutHtml, /Pay now/);
```

with:

```js
  assert.match(checkoutHtml, /Place COD order/);
```

Then add these assertions immediately after that replacement:

```js
  assert.match(checkoutHtml, /data-checkout-success/);
  assert.match(checkoutHtml, /data-checkout-success-title/);
  assert.match(checkoutHtml, /data-checkout-success-body/);
  assert.match(checkoutHtml, /data-checkout-submit/);
  assert.match(checkoutHtml, /Pay when your order arrives/);
```

In the same test, add these JavaScript assertions after `assert.match(checkoutJs, /createOrder\(payload\)/);`:

```js
  assert.match(checkoutJs, /setCheckoutStatus/);
  assert.match(checkoutJs, /setCheckoutPending/);
  assert.match(checkoutJs, /renderCheckoutSuccess/);
  assert.match(checkoutJs, /focusFirstInvalidCheckoutField/);
  assert.match(checkoutJs, /dataset\.defaultText/);
```

In the same test, add these style assertions after `assert.match(styles, /\.checkout-related-card\s*{/);`:

```js
  assert.match(styles, /\.checkout-success\s*{/);
  assert.match(styles, /\.checkout-success\[hidden\]\s*{/);
  assert.match(styles, /\.checkout-status--error\s*{/);
  assert.match(styles, /\.checkout-status--success\s*{/);
  assert.match(styles, /\.checkout-pay-button:disabled\s*{/);
```

- [ ] **Step 2: Write the failing order API status assertions**

In `test/health.test.js`, inside the `storefront APIs run from in-project catalog only` test, add these assertions after `assert.equal(orderBody.syncStatus, 'frontend_only');`:

```js
    assert.equal(orderBody.checkoutChannel, 'storefront_checkout');
    assert.equal(orderBody.paymentMethod, 'cash_on_delivery');
    assert.equal(orderBody.shippingRegion, 'metro_manila_cavite');
    assert.equal(orderBody.freeShippingUnlocked, true);
    assert.equal(orderBody.status, 'received');
    assert.equal(orderBody.fulfillmentStatus, 'unfulfilled');
    assert.equal(orderBody.paymentStatus, 'cod_pending');
```

Update that test's order payload so it includes the fields required by the assertions:

```js
        checkoutChannel: 'storefront_checkout',
        paymentMethod: 'cash_on_delivery',
        shippingRegion: 'metro_manila_cavite',
        shippingRegionLabel: 'Metro Manila & Cavite Region',
        freeShippingUnlocked: true,
```

Place those fields next to `shippingFeeCents` and `discountTotalCents` in the posted body.

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm test
```

Expected result:

- `test/frontendBehavior.test.js` fails because checkout success/pending hooks and styles are not implemented yet.
- `test/health.test.js` may still pass if the backend already returns the COD/admin fields correctly.

Do not change production files before seeing the frontend contract fail.

- [ ] **Step 4: Commit or record checkpoint**

This workspace is not a Git repository. If Git has been initialized by the time this plan is executed, run:

```bash
git add test/frontendBehavior.test.js test/health.test.js
git commit -m "test: cover guided checkout completion contract"
```

If Git is still unavailable, record in the final implementation notes that commit was skipped because the workspace has no `.git` directory.

---

### Task 2: Add Checkout Confirmation Markup

**Files:**
- Modify: `public/checkout.html`
- Test: `test/frontendBehavior.test.js`

- [ ] **Step 1: Update checkout submit copy and hooks**

In `public/checkout.html`, replace:

```html
<button class="button button-dark checkout-pay-button" type="submit">Pay now</button>
```

with:

```html
<button class="button button-dark checkout-pay-button" type="submit" data-checkout-submit data-default-text="Place COD order">Place COD order</button>
```

- [ ] **Step 2: Add COD payment explanation**

In `public/checkout.html`, inside the Payment checkout card, replace:

```html
<p class="checkout-muted">All transactions are secure and encrypted.</p>
```

with:

```html
<p class="checkout-muted">Pay when your order arrives. We will text you first to confirm your delivery details.</p>
```

- [ ] **Step 3: Add inline success region**

In `public/checkout.html`, place this block immediately after:

```html
<p data-checkout-status class="form-status checkout-status" aria-live="polite"></p>
```

New block:

```html
<section class="checkout-success" data-checkout-success hidden aria-live="polite">
  <p class="checkout-success-eyebrow">Order received</p>
  <h2 data-checkout-success-title>Thank you for your order.</h2>
  <p data-checkout-success-body>We will text you to confirm COD delivery.</p>
  <a class="button button-dark" href="/#new-arrivals">Continue shopping</a>
</section>
```

- [ ] **Step 4: Run focused test**

Run:

```bash
npm test -- test/frontendBehavior.test.js
```

Expected result:

- The HTML assertions for `data-checkout-success`, `data-checkout-submit`, `Place COD order`, and `Pay when your order arrives` pass.
- The JavaScript and style assertions still fail.

- [ ] **Step 5: Commit or record checkpoint**

If Git is available:

```bash
git add public/checkout.html test/frontendBehavior.test.js
git commit -m "feat: add checkout confirmation markup"
```

If Git is unavailable, record the skipped commit in implementation notes.

---

### Task 3: Implement Checkout Status, Pending, And Success Behavior

**Files:**
- Modify: `public/js/checkout.js`
- Test: `test/frontendBehavior.test.js`

- [ ] **Step 1: Add status and submit helpers**

In `public/js/checkout.js`, add these functions after `formatCheckoutAddress(address)`:

```js
function setCheckoutStatus(status, message, tone = 'neutral') {
  if (!status) return;
  status.textContent = message;
  status.classList.remove('checkout-status--error', 'checkout-status--success');
  if (tone === 'error') {
    status.classList.add('checkout-status--error');
  }
  if (tone === 'success') {
    status.classList.add('checkout-status--success');
  }
}

function setCheckoutPending(form, pending) {
  const submitButton = form.querySelector('[data-checkout-submit]');
  if (!submitButton) return;

  if (!submitButton.dataset.defaultText) {
    submitButton.dataset.defaultText = submitButton.textContent.trim() || 'Place COD order';
  }

  submitButton.disabled = pending;
  submitButton.textContent = pending ? 'Placing order...' : submitButton.dataset.defaultText;
}

function focusFirstInvalidCheckoutField(form) {
  const invalidField = form.querySelector(':invalid, [aria-invalid="true"]');
  invalidField?.focus();
}

function renderCheckoutSuccess(order) {
  const success = document.querySelector('[data-checkout-success]');
  const title = document.querySelector('[data-checkout-success-title]');
  const body = document.querySelector('[data-checkout-success-body]');
  if (!success || !title || !body) return;

  title.textContent = `Order ${order.orderNumber} received.`;
  body.textContent = 'We will text you to confirm COD delivery before sending your order.';
  success.hidden = false;
  success.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
```

- [ ] **Step 2: Use helper for empty cart error**

In `renderCheckoutPage()`, replace:

```js
      status.textContent = 'Your cart is empty.';
```

with:

```js
      setCheckoutStatus(status, 'Your cart is empty. Add an item before placing an order.', 'error');
```

- [ ] **Step 3: Use helper for address validation error**

In `renderCheckoutPage()`, replace:

```js
      status.textContent = addressValidation.message;
      return;
```

with:

```js
      setCheckoutStatus(status, addressValidation.message, 'error');
      focusFirstInvalidCheckoutField(form);
      return;
```

- [ ] **Step 4: Use pending helper during submission**

In `renderCheckoutPage()`, replace:

```js
    status.textContent = 'Placing your order...';
```

with:

```js
    setCheckoutStatus(status, 'Placing your order...', 'neutral');
    setCheckoutPending(form, true);
```

- [ ] **Step 5: Render success after order creation**

In `renderCheckoutPage()`, replace:

```js
      status.textContent = `Order ${result.orderNumber} received. We will text you to confirm COD delivery.`;
```

with:

```js
      setCheckoutStatus(status, `Order ${result.orderNumber} received. We will text you to confirm COD delivery.`, 'success');
      renderCheckoutSuccess(result);
```

- [ ] **Step 6: Unlock submit button after success or failure**

In the `try/catch` block inside the checkout submit handler, replace:

```js
    } catch (error) {
      status.textContent = error.message;
    }
```

with:

```js
    } catch (error) {
      setCheckoutStatus(status, error.message, 'error');
    } finally {
      setCheckoutPending(form, false);
    }
```

- [ ] **Step 7: Run syntax and focused tests**

Run:

```bash
node --check public/js/checkout.js
npm test -- test/frontendBehavior.test.js
```

Expected result:

- `node --check public/js/checkout.js` exits 0.
- Frontend behavior test still fails only on missing CSS assertions from Task 1.

- [ ] **Step 8: Commit or record checkpoint**

If Git is available:

```bash
git add public/js/checkout.js
git commit -m "feat: complete checkout submit state"
```

If Git is unavailable, record the skipped commit in implementation notes.

---

### Task 4: Polish Checkout Styles

**Files:**
- Modify: `public/styles.css`
- Test: `test/frontendBehavior.test.js`

- [ ] **Step 1: Add checkout status and success styles**

In `public/styles.css`, add this block after the existing `.checkout-pay-button { ... }` rule:

```css
.checkout-pay-button:disabled {
  cursor: wait;
  opacity: .68;
}

.checkout-status {
  min-height: 22px;
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
}

.checkout-status--error {
  color: #9d1c1c;
}

.checkout-status--success {
  color: #17613a;
}

.checkout-success {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(23, 97, 58, .24);
  border-radius: 8px;
  padding: 18px;
  background: #f2faf5;
}

.checkout-success[hidden] {
  display: none;
}

.checkout-success-eyebrow {
  margin: 0;
  color: #17613a;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.checkout-success h2,
.checkout-success p {
  margin: 0;
}

.checkout-success h2 {
  color: rgb(18, 18, 18);
  font-size: 22px;
  font-weight: 500;
  line-height: 1.25;
}

.checkout-success p {
  color: rgba(18, 18, 18, .76);
  font-size: 14px;
  line-height: 1.5;
}
```

- [ ] **Step 2: Tighten checkout cards without changing markup**

In `public/styles.css`, replace the existing `.checkout-card { ... }` rule:

```css
.checkout-card {
  display: grid;
  gap: 14px;
}
```

with:

```css
.checkout-card {
  display: grid;
  gap: 14px;
  border-bottom: 1px solid rgba(18, 18, 18, .1);
  padding-bottom: 18px;
}
```

- [ ] **Step 3: Improve desktop summary stickiness**

Inside the existing `@media (min-width: 990px) { ... }` checkout rules, add this rule:

```css
  .checkout-summary-panel {
    position: sticky;
    top: 18px;
  }
```

Place it near the existing `.checkout-summary-panel` media rule.

- [ ] **Step 4: Run focused test**

Run:

```bash
npm test -- test/frontendBehavior.test.js
```

Expected result:

- All frontend checkout contract assertions pass.
- Any unrelated frontend behavior failure should be investigated before continuing.

- [ ] **Step 5: Commit or record checkpoint**

If Git is available:

```bash
git add public/styles.css
git commit -m "style: polish guided checkout"
```

If Git is unavailable, record the skipped commit in implementation notes.

---

### Task 5: Full Verification

**Files:**
- Read: `docs/superpowers/specs/2026-06-03-guided-checkout-completion-design.md`
- Verify: `public/checkout.html`
- Verify: `public/js/checkout.js`
- Verify: `public/styles.css`
- Verify: `test/frontendBehavior.test.js`
- Verify: `test/health.test.js`

- [ ] **Step 1: Run JavaScript syntax check**

Run:

```bash
node --check public/js/checkout.js
```

Expected result:

- Exit code 0.
- No syntax errors.

- [ ] **Step 2: Run all tests**

Run:

```bash
npm test
```

Expected result:

- Exit code 0.
- All Node tests pass.

- [ ] **Step 3: Verify checkout page responds**

If the local server is running on port `3100`, run:

```bash
curl -I http://localhost:3100/checkout.html
```

Expected result:

- `HTTP/1.1 200 OK`

If no server is running, start it with:

```bash
PORT=3100 npm start
```

Then rerun the `curl -I` command.

- [ ] **Step 4: Check spec coverage**

Re-read `docs/superpowers/specs/2026-06-03-guided-checkout-completion-design.md` and verify:

- Guided one-page checkout remains in place.
- COD-only payment remains in place.
- Structured Philippine address remains in place.
- Region shipping remains in place.
- Free shipping for 2 or more items remains in place.
- Related products remain in place.
- Order payload still includes admin-ready fields.
- Success confirmation is visible after order submission.
- Real payment, login, database persistence, admin UI, promo calculation, separate thank-you page, and international shipping were not added.

- [ ] **Step 5: Final implementation notes**

Report:

- Files changed.
- Verification commands and results.
- Whether commits were skipped because the workspace has no `.git` directory.
- Local checkout URL: `http://localhost:3100/checkout.html`
