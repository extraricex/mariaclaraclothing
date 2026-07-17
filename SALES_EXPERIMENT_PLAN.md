# Maria Clara Clothing Sales Experiment Plan

Plan updated: 2026-07-16

## Current Status

**Do not start conversion experiments until the P0 launch gates pass.**

The site now has privacy-safe first-party funnel and Core Web Vitals collection plus an admin analytics dashboard. It does not yet have a production experiment assignment/analysis engine, so ad hoc alternate copy or layouts would produce unreliable results.

Current measurement events cover product views, Add to Cart, checkout/review progression, payment-method choice, payment/order outcomes, stock/payment errors, purchases, device category, and Web Vitals. Server orders remain the source of truth for revenue and completed purchases.

## Experiment Rules

1. Run one material funnel experiment at a time unless a real factorial design is implemented.
2. Assign a stable anonymous variant server-side or with a first-party identifier; keep it stable for the session and repeat visits within the test window.
3. Record eligibility and exposure before measuring outcomes. Do not compare date ranges with different traffic sources as if they were randomized variants.
4. Use completed backend orders and final authoritative totals for Purchase/revenue metrics.
5. Segment guardrails by mobile/desktop, COD/PayMongo, new/returning customer, and traffic source where sample size permits.
6. Stop immediately for checkout, payment, stock, accessibility, privacy, Core Web Vitals, or support regressions.
7. Do not use fake urgency, stock, discounts, reviews, activity, timers, or unsupported shipping/payment claims.
8. Keep losing variants out of production and remove stale assignment code/data after the decision.

## Baseline Required Before Testing

- P0 PayMongo and Meta Test Events acceptance complete.
- Owner-approved shipping and product facts published.
- At least 14 days of stable first-party funnel data after deployment.
- Search/paid campaign changes held stable or tagged so traffic quality can be controlled.
- A written primary metric, guardrails, eligible audience, sample target, and stop conditions.
- Enough traffic/orders for a meaningful decision; if not, record the result as inconclusive.

## Experiment 1 — Homepage Primary CTA

- **Hypothesis:** A concise “Shop the Collection” CTA will increase qualified product/collection visits versus the current approved CTA.
- **Page/component:** Homepage hero CTA controlled by Admin site content.
- **Primary metric:** Product or collection views per exposed homepage session.
- **Secondary metric:** AddToCart, Purchase, hero engagement, bounce, LCP.
- **Minimum test duration:** 21 days and at least 500 eligible homepage sessions per variant.
- **Success criteria:** At least 8% relative lift in qualified views, no Purchase decline greater than 3%, and no material LCP regression.
- **Risks:** Text may obscure campaign imagery or attract low-intent clicks; use approved brand copy only.

## Experiment 2 — Homepage Benefit Line

- **Hypothesis:** One factual line about verified fabric/fit or COD/free shipping will increase product exploration without making the hero feel crowded.
- **Page/component:** Homepage hero subtitle.
- **Primary metric:** Product/collection view per homepage session.
- **Secondary metric:** AddToCart, CTA click, bounce, LCP/CLS.
- **Minimum test duration:** 21 days and 500 sessions per variant.
- **Success criteria:** 8% relative qualified-view lift with no CLS or LCP regression and no unsupported claim.
- **Risks:** Product facts vary; only use facts confirmed across the promoted collection.

## Experiment 3 — Product Image Order

- **Hypothesis:** Showing the clearest front/on-body image first will improve size selection and AddToCart.
- **Page/component:** Product gallery and Admin image order.
- **Primary metric:** AddToCart per ViewContent.
- **Secondary metric:** Gallery interaction, size-chart opens, Purchase, product-mismatch contacts, LCP.
- **Minimum test duration:** 21 days and 200 eligible views per tested product/variant.
- **Success criteria:** 8% relative AddToCart lift without more mismatch/return contacts or slower LCP.
- **Risks:** Effects are product-specific; do not pool unrelated designs or use non-representative imagery.

## Experiment 4 — Rating and Review Placement

- **Hypothesis:** A compact real rating/photo summary immediately below price will increase AddToCart once sufficient published reviews exist.
- **Page/component:** Product rating summary/review anchor.
- **Primary metric:** AddToCart per product view.
- **Secondary metric:** Review engagement, Purchase, scroll depth, performance.
- **Minimum test duration:** 21 days after at least 20 genuine published reviews exist across eligible products.
- **Success criteria:** 7% relative AddToCart lift with no abandonment or LCP regression.
- **Risks:** Sparse or irrelevant proof can reduce trust; use only Published records and valid Verified Purchase labels.

## Experiment 5 — Size Chart Placement

- **Hypothesis:** “Size & fit guide” beside the size choices plus a verified fit note will reduce sizing uncertainty.
- **Page/component:** Product size selector/modal.
- **Primary metric:** Size selection to AddToCart conversion.
- **Secondary metric:** Guide opens, time to AddToCart, size-exchange contacts.
- **Minimum test duration:** 21 days and 300 eligible product views per variant.
- **Success criteria:** 8% relative lift with no increase in size-related contacts.
- **Risks:** Notes must be product-specific and accurate; never infer body recommendations without measurement data.

## Experiment 6 — Sticky Mobile Add to Cart

- **Hypothesis:** A purchase bar shown only after the normal controls leave view will increase mobile AddToCart on long product pages.
- **Page/component:** Mobile Product page.
- **Primary metric:** Mobile AddToCart per product view.
- **Secondary metric:** Mis-click/error rate, size omissions, CLS, INP, review engagement.
- **Minimum test duration:** 21 days and 500 mobile views per variant.
- **Success criteria:** 10% relative lift, under 1% error interactions, no content obstruction or Core Web Vitals regression.
- **Risks:** Can cover content/keyboard and cause size mistakes; require an explicitly available size and respect safe areas.

## Experiment 7 — Free-Shipping Progress Copy

- **Hypothesis:** Exact server-driven progress copy will increase two-item completed orders compared with generic shipping copy.
- **Page/component:** Cart drawer, Cart, Checkout Review.
- **Primary metric:** Share of completed orders meeting the configured eligible-item threshold.
- **Secondary metric:** AOV, overall Purchase conversion, removal rate, shipping cost/margin.
- **Minimum test duration:** 21 days and 150 eligible one-item cart sessions per variant.
- **Success criteria:** 10% relative lift in threshold-reaching completed orders with no overall conversion decline over 3%.
- **Risks:** Must always use the live backend rule and disappear when disabled/unlocked; monitor margin.

## Experiment 8 — Review-Page Upsell Wording

- **Hypothesis:** Contextual wording based on the actual free-shipping requirement will increase second-item additions without distracting from payment.
- **Page/component:** Checkout Review recommendations.
- **Primary metric:** Recommendation AddToCart rate.
- **Secondary metric:** Review-to-Purchase, order quantity/AOV, payment abandonment, stock failures.
- **Minimum test duration:** 21 days and 150 eligible review sessions per variant.
- **Success criteria:** 12% relative upsell lift with no review-to-Purchase decline.
- **Risks:** Requote totals immediately; exclude cart items/sold-out products; never imply a promotion that is disabled.

## Experiment 9 — Recommendation Placement

- **Hypothesis:** Related in-stock products after core product facts but before long reviews will increase second-item interest.
- **Page/component:** Product recommendations.
- **Primary metric:** Recommendation-driven second AddToCart.
- **Secondary metric:** Recommendation CTR, primary AddToCart, review engagement, Purchase.
- **Minimum test duration:** 21 days and 500 eligible views per variant.
- **Success criteria:** 10% relative lift in second-item additions with no primary conversion or review-engagement decline over 5%.
- **Risks:** Recommendations can distract from the primary product; keep the list small, relevant, stable, and in stock.

## Experiment 10 — Payment Option Presentation

- **Hypothesis:** Short factual explanations below COD and enabled PayMongo methods will reduce hesitation and payment abandonment.
- **Page/component:** Checkout Review payment cards.
- **Primary metric:** Successful order/payment per review session.
- **Secondary metric:** Method share, cancellation/failure, time to choose, support contacts.
- **Minimum test duration:** 28 days and at least 100 selections per option/variant.
- **Success criteria:** 8% relative completion lift without increased failure/cancellation.
- **Risks:** Wording must match live account channels and policy; do not claim unsupported security, speed, refund, or availability.

## Experiment 11 — Explicit Payment Choice

- **Hypothesis:** Requiring an explicit COD/PayMongo choice will increase intentional selection without reducing completion.
- **Page/component:** Checkout Review payment state.
- **Primary metric:** Successful completion per review session.
- **Secondary metric:** Method mix, selection time, errors, duplicate clicks.
- **Minimum test duration:** 28 days and 200 review sessions per variant.
- **Success criteria:** No overall completion decline and a measurable reduction in immediately changed/abandoned choices.
- **Risks:** Extra interaction may add friction; run only after PayMongo acceptance and clear payment copy.

## Experiment 12 — Product Shipping Summary

- **Hypothesis:** A short accurate delivery/rate summary near Add to Cart will reduce uncertainty and improve product-to-cart conversion.
- **Page/component:** Product buy panel and shipping settings.
- **Primary metric:** AddToCart per ViewContent.
- **Secondary metric:** Shipping-guide clicks, checkout completion, delivery-support contacts.
- **Minimum test duration:** 21 days and 500 product views per variant.
- **Success criteria:** 6% relative AddToCart lift without more delivery expectation complaints.
- **Risks:** Do not promise a region-specific date before address; use only owner-approved global ranges.

## Experiment 13 — Real Customer Photo Strip

- **Hypothesis:** A compact strip of consented, published customer photos will improve Purchase confidence.
- **Page/component:** Product review summary/gallery.
- **Primary metric:** Purchase per product view.
- **Secondary metric:** Photo opens, AddToCart, return/contact rate, LCP.
- **Minimum test duration:** 28 days after at least 10 approved product-relevant photos exist.
- **Success criteria:** 7% relative Purchase lift with no LCP regression over 150ms.
- **Risks:** Consent, product assignment, image quality/weight; never use private Messenger content without approval.

## Experiment 14 — Buy Again Prominence

- **Hypothesis:** A stock-requoted Buy Again card will increase repeat cart creation for signed-in customers.
- **Page/component:** Customer order history/returning-customer area.
- **Primary metric:** Repeat Purchase within 30 days of exposure.
- **Secondary metric:** Buy Again click/cart creation, unavailable-item message, completion.
- **Minimum test duration:** Six weeks and enough eligible returning customers for a meaningful comparison.
- **Success criteria:** 10% relative repeat-cart lift with no stock/price confusion.
- **Risks:** Current prices and availability may differ; always show a fresh quote before checkout.

## SEO Growth Workstream (Not an A/B Test)

SEO changes should be evaluated by query/page cohorts rather than arbitrary visual variants:

- Verify Search Console and Bing, submit the sitemap, and record the deployment date.
- Resolve indexing, canonical, structured-data, feed, and Core Web Vitals errors first.
- Build accurate collection/product copy around real search intent and product facts.
- Publish one genuinely useful guide at a time (sizing, fabric/fit, care, shipping/payment questions), link it contextually, and avoid thin pages.
- Measure non-brand impressions/clicks, product-page organic entrances, AddToCart, Purchase, indexed pages, rich-result eligibility, and revenue—not rankings alone.
- Review after at least 8–12 weeks, accounting for seasonality and campaign changes.

## Recommended Sequence

1. Pass all P0 launch gates and establish 14 days of stable funnel/RUM data.
2. Implement a stable experiment assignment/exposure mechanism.
3. Test one discovery change: CTA or benefit line.
4. Test one product-confidence change: image order, size guide, or real reviews.
5. Test one order-value change: free-shipping copy or upsell wording.
6. Test payment presentation only after live PayMongo acceptance.
7. Leave loyalty, referrals, and personalization until repeat-purchase and margin data justify them.

## Result Record Template

For each test record:

- experiment/variant IDs and hypothesis;
- owner, start/end time, production commit, audience and exclusions;
- approved copy/assets and exposure count;
- primary/secondary outcomes with confidence interval;
- mobile/desktop and COD/PayMongo guardrails;
- payment, stock, cancellation, support, privacy, accessibility, and performance regressions;
- decision: ship, reject, extend, or inconclusive;
- cleanup date for losing variants and stale assignments.

An inconclusive experiment is a valid result. Never ship a treatment solely because its raw order count is higher when exposure or traffic quality differs.
