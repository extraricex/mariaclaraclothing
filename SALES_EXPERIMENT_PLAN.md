# Maria Clara Clothing Sales Experiment Plan

Plan updated: 2026-07-16

Production baseline: commit `a1556df`

## Current Status

**Hold experiments until the launch gates are complete.**

The storefront does not yet have a first-party experiment-assignment and reporting mechanism, so changing copy or layout ad hoc would not produce trustworthy evidence. The current verified baseline is:

- 18 live products, including 2 sold-out products;
- zero published reviews and global review display disabled;
- real two-item free shipping configured on the server;
- COD enabled;
- PayMongo enabled but lacking one successful post-fix production acceptance;
- Meta funnel events implemented, but Meta consent governance and Test Events confirmation remain owner tasks;
- responsive public-route matrix passed at 320–1440px;
- main production JS bundle about 88.63 kB gzip and CSS about 17.47 kB gzip.

Before Experiment 1, complete these gates:

1. Pass the controlled production PayMongo flow and physical Android/iPhone handoff.
2. Align product shipping promises with the approved global ranges.
3. Correct the owner-confirmed MARIACLARA ROCKSTAR color.
4. Decide and document Meta/privacy consent behavior.
5. Add privacy-safe first-party funnel storage, persistent assignment, test-traffic exclusion, and an admin kill switch.

Do not use Meta Ads Purchase counts alone to declare an experiment winner. Meta remains an ad-delivery signal; experiment analysis needs its own aggregate exposure and outcome records.

## Experiment Rules

Do not run competing variants until a stable experiment assignment and reporting mechanism exists. Assignment should be persistent per anonymous cart/customer, mutually exclusive per experiment, privacy-aware, and recorded with the same funnel events used for analysis.

Use real product, price, inventory, shipping, review, and payment data. Never introduce fake urgency, fake review proof, fake discounts, hidden fees, preselected paid options, or unsupported payment promises.

For low traffic, duration alone is not enough. Unless stated otherwise:

- Run at least **14 full days** to cover weekday/weekend behavior.
- Continue until each variant has at least **100 relevant conversion opportunities** and preferably **30 completed orders**. If volume is lower, treat the result as directional rather than conclusive.
- Stop early only for a clear technical defect, customer harm, or a predeclared severe guardrail breach.
- Segment mobile/desktop, new/returning visitor, COD/PayMongo, and major product groups without declaring winners from tiny segments.
- Primary guardrails: payment failure, stock rejection, cancellation, refund/return contact, page speed, and Report Issue rate.

## Required Measurement Foundation

Before Experiment 1:

1. Add stable anonymous experiment assignment tied to the cart session; never use a new random variant on each render.
2. Record impression only when the tested element is actually visible.
3. Record ViewContent, AddToCart, checkout information started, review reached, payment method selected, payment attempted, Purchase, payment failure category, and stock failure.
4. Keep Meta events unchanged for ad optimization; store privacy-safe first-party aggregate experiment events separately.
5. Exclude staff/test traffic and document test orders.
6. Add an admin kill switch for every live experiment.

## Experiment 1 — Homepage Primary CTA

- **Hypothesis:** A benefit-led CTA (“Shop 240 GSM Tees”) will produce more qualified product views than the current “Shop new arrivals” without reducing collection exploration.
- **Page/component:** Homepage hero in `Home.jsx`; admin-managed hero CTA.
- **Control:** Current approved CTA.
- **Variant:** Owner-approved product-benefit CTA pointing to the same real collection.
- **Primary metric:** Hero CTA click → product ViewContent rate.
- **Secondary metric:** Add-to-cart per homepage session, Purchase per homepage session, bounce/exit rate.
- **Minimum test duration:** 14 days and at least 200 hero CTA impressions per variant.
- **Success criteria:** At least 10% relative lift in qualified product views with no more than 3% relative decline in Purchase per homepage session.
- **Risks:** Novel wording may attract clicks without purchase intent; mobile text can wrap; cannot imply a promotion.

## Experiment 2 — Mobile Hero Benefit Line

- **Hypothesis:** Showing one concise mobile line explaining oversized/crop-box 240 GSM cotton will reduce first-screen ambiguity and increase collection clicks.
- **Page/component:** Mobile homepage hero copy.
- **Primary metric:** Product/collection view per new mobile session.
- **Secondary metric:** Time to first product view, AddToCart, LCP, text overlap.
- **Minimum test duration:** 14 days; 300 new mobile sessions per variant.
- **Success criteria:** 8% relative lift in product/collection views and no LCP regression greater than 100 ms.
- **Risks:** Text may reduce visual premium feel or cover campaign subjects.

## Experiment 3 — Product Image Order

- **Hypothesis:** Showing the clearest front/on-body product image first will increase size selection and AddToCart compared with the current admin order.
- **Page/component:** Product gallery and Admin Product image order.
- **Primary metric:** AddToCart per ViewContent.
- **Secondary metric:** Gallery interactions, size-chart opens, returns/wrong-item contacts, LCP.
- **Minimum test duration:** 21 days and at least 150 ViewContent events per tested product/variant.
- **Success criteria:** 8% relative AddToCart lift with no increase in product-mismatch contacts.
- **Risks:** Product-specific effects; do not pool materially different designs; image reordering must use real assets.

## Experiment 4 — Review Placement

- **Hypothesis:** A compact real rating/review-photo summary immediately below price will improve AddToCart confidence once enough published reviews exist.
- **Page/component:** Product rating summary and reviews anchor.
- **Primary metric:** AddToCart per product view.
- **Secondary metric:** Review-section engagement, size selection, Purchase, page scroll depth.
- **Minimum test duration:** 21 days after at least 20 real published reviews exist across eligible products.
- **Success criteria:** 7% relative AddToCart lift with no increase in page abandonment.
- **Risks:** Sparse/low-quality proof can reduce trust; never include pending/hidden/import-unreviewed records.

## Experiment 5 — Size Chart Placement

- **Hypothesis:** A clearer “Size & fit guide” action beside size choices plus a short fit note will reduce sizing uncertainty and improve AddToCart.
- **Page/component:** Product size selector/size-chart modal.
- **Primary metric:** Size selection → AddToCart completion.
- **Secondary metric:** Size-chart opens, time to AddToCart, size-exchange requests.
- **Minimum test duration:** 21 days and 200 product views per variant.
- **Success criteria:** 8% relative lift in size-selection-to-cart conversion and no increase in exchange contacts.
- **Risks:** Fit notes must be product-specific and accurate; do not infer body recommendations without data.

## Experiment 6 — Sticky Mobile Add to Cart

- **Hypothesis:** A non-obstructive sticky mobile purchase bar shown only after the normal Add to Cart leaves view will increase AddToCart on long product pages.
- **Page/component:** Product mobile purchase controls.
- **Primary metric:** AddToCart per mobile product view.
- **Secondary metric:** Mis-clicks, Report Issue rate, size errors, CLS/interaction latency.
- **Minimum test duration:** 14 days and 300 mobile product views per variant.
- **Success criteria:** 10% relative AddToCart lift, fewer than 1% accidental/error interactions, no content obstruction.
- **Risks:** Can cover reviews/content or keyboard; must require an explicit available size and honor safe areas.

## Experiment 7 — Free-Shipping Progress Copy

- **Hypothesis:** Exact progress copy (“Add 1 more item to unlock FREE shipping”) will increase two-item orders more than generic shipping/promos copy.
- **Page/component:** Cart drawer, Cart, Checkout review.
- **Primary metric:** Share of completed orders with at least two eligible items.
- **Secondary metric:** Average order value, cart abandonment, item removal, margin/shipping cost.
- **Minimum test duration:** 21 days and 100 one-item cart sessions per variant.
- **Success criteria:** 10% relative increase in two-item completed orders without reducing overall Purchase conversion by more than 3%.
- **Risks:** Must use the live server rule; do not show when disabled or already unlocked; monitor margin.

## Experiment 8 — Review-Page Upsell Wording

- **Hypothesis:** “Add another piece for free shipping” when exactly one eligible item remains will outperform generic recommendation wording.
- **Page/component:** `CheckoutReview.jsx` recommendation section.
- **Primary metric:** Upsell add rate.
- **Secondary metric:** Review-to-Purchase conversion, final order quantity, payment abandonment, stock failures.
- **Minimum test duration:** 21 days and 100 eligible one-item review sessions per variant.
- **Success criteria:** 12% relative upsell-add lift without reducing review-to-Purchase conversion.
- **Risks:** Total recalculation must remain immediate and authoritative; copy must disappear when free shipping is disabled/unlocked.

## Experiment 9 — Recommendation Placement

- **Hypothesis:** Related in-stock products after product details but before full reviews will create more second-item interest than recommendations after the full review section.
- **Page/component:** Product page recommendation section.
- **Primary metric:** Recommendation click-through and second AddToCart.
- **Secondary metric:** Review engagement, Purchase conversion, scroll depth.
- **Minimum test duration:** 21 days and 300 eligible product views per variant.
- **Success criteria:** 10% relative increase in recommendation-driven second items with no decrease in review engagement greater than 5%.
- **Risks:** Moving recommendations too early can distract from the primary item or hide trust proof.

## Experiment 10 — Payment Option Presentation

- **Hypothesis:** Brief approved explanations under COD and PayMongo will reduce payment hesitation and increase review-to-Purchase conversion.
- **Page/component:** Review/payment method cards.
- **Primary metric:** Review page → successful order/payment.
- **Secondary metric:** Method selection, PayMongo cancel/failure, time on payment section, support contacts.
- **Minimum test duration:** 21 days and at least 50 payment selections per option/variant.
- **Success criteria:** 8% relative review-to-completion lift with no higher payment failure/cancellation rate.
- **Risks:** Wording must match enabled live channels and approved policy; no unsupported “secure/instant/refundable” claims.

## Experiment 11 — COD vs PayMongo Default State

- **Hypothesis:** Requiring an explicit payment choice rather than preselecting COD will increase intentional PayMongo selection without harming completion.
- **Page/component:** `CheckoutReview.jsx` payment method state.
- **Primary metric:** Successful completion per review session.
- **Secondary metric:** Method share, time to choose, payment errors, duplicate clicks.
- **Minimum test duration:** 28 days and 100 completed orders total.
- **Success criteria:** No reduction in total completion and a meaningful increase in successful PayMongo use.
- **Risks:** Extra choice can add friction; do not run until payment copy and live PayMongo verification are complete.

## Experiment 12 — Product-Page Shipping Summary

- **Hypothesis:** Showing a short real delivery/rate summary near Add to Cart will reduce uncertainty and improve cart additions.
- **Page/component:** Product buy panel; admin shipping settings.
- **Primary metric:** AddToCart per ViewContent.
- **Secondary metric:** Shipping page clicks, checkout address completion, support questions.
- **Minimum test duration:** 21 days and 300 product views per variant.
- **Success criteria:** 6% relative AddToCart lift with no increase in delivery-expectation complaints.
- **Risks:** Region-specific timing cannot be promised before address; use ranges from approved settings only.

## Experiment 13 — Real Customer Photo Strip

- **Hypothesis:** A compact strip of real published customer photos will increase product confidence and Purchase conversion.
- **Page/component:** Product review summary/photo gallery.
- **Primary metric:** Purchase per product view.
- **Secondary metric:** Photo opens, AddToCart, return/contact rate.
- **Minimum test duration:** 28 days after at least 10 approved product-relevant customer photos exist.
- **Success criteria:** 7% relative Purchase lift without page-speed regression greater than 150 ms LCP.
- **Risks:** Privacy rights, image quality, incorrect product assignment, extra image weight; use only consented published media.

## Experiment 14 — Account/Buy Again Prompt

- **Hypothesis:** Showing a stock-validated Buy Again card to returning logged-in customers will increase repeat orders.
- **Page/component:** Account order history/home returning-customer slot.
- **Primary metric:** Repeat Purchase within 30 days of prompt exposure.
- **Secondary metric:** Buy Again click, unavailable-item message, cart completion.
- **Minimum test duration:** 6 weeks due to repeat-purchase cycle.
- **Success criteria:** 10% relative repeat-cart creation and no rise in stock-related failures.
- **Risks:** Prices and availability may change; always re-quote and show current data.

## Experiment 15 — Search Entry Visibility

- **Hypothesis:** A visible mobile/desktop search entry will improve product discovery once the catalog exceeds the current small range.
- **Page/component:** Customer header/mobile menu.
- **Primary metric:** Search users reaching a product page.
- **Secondary metric:** Search-to-cart, zero-result rate, overall header interaction.
- **Minimum test duration:** 21 days after search ships; 100 search sessions per treatment if traffic allows.
- **Success criteria:** At least 60% search-to-product rate and under 15% zero-result rate without reducing collection navigation.
- **Risks:** Weak indexing/synonyms can create dead ends; log only privacy-safe search terms and exclude sensitive data.

## Experiment Sequence Recommendation

1. First pass every launch gate, deploy measurement, enable approved real reviews, and establish image/performance baselines.
2. Run only one major funnel experiment at a time: homepage CTA or mobile benefit line first.
3. Next test product confidence: image order, size-chart placement, or review placement.
4. Then test order-value mechanics: free-shipping progress and review-page upsell wording.
5. Test payment presentation only after a controlled live PayMongo flow passes.
6. Leave loyalty, referral, and advanced personalization until baseline conversion and repeat-purchase data are reliable.

## Experiment Result Record

For every launched test, record:

- experiment and variant IDs;
- start/end timestamp and owner;
- exact production commit and approved copy/assets;
- eligible audience and exclusions;
- impressions and primary/secondary outcomes by variant;
- mobile/desktop and COD/PayMongo guardrails;
- payment, stock, cancellation, support, and performance regressions;
- decision: ship, reject, extend, or inconclusive;
- cleanup date for losing variants and stale assignment data.

An inconclusive test is a valid result. Do not keep a variant merely because its raw order count is higher when exposure, traffic quality, or sample size differs.
