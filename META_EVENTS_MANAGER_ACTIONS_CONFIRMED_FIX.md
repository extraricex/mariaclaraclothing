# Meta Events Manager Actions Confirmed Fix

## Scope

- Dataset: Maria Clara Clothing (`595813035761213`)
- Business: `241717844363867`
- Verification date: 2026-07-20 (Asia/Manila)
- Production release: `24b47b6` (`Fix Meta automatic event and matching diagnostics`)
- Pre-release backup: `20260720T052013Z`

## Actions Observed Before the Fix

| Meta action | Live evidence | Confirmed cause | Resolution |
|---|---|---|---|
| Send valid currency codes for Purchase | 42% of sampled Purchase activity; affected samples had empty value/currency | Account-side button rules emitted automatic `Purchase` without a confirmed order payload | Deleted both automatic Purchase rules; authoritative server Purchase remains enabled and browser Purchase remains intentionally disabled |
| Send valid price and currency parameters for Purchase | Same affected Purchase samples | Same parameterless automatic Purchase rules | Deleted at the account level; all current saved CAPI Purchase payloads have numeric value greater than zero and exact `PHP` currency |
| Send higher-quality price data for Purchase | Same retained Purchase sample | Same automatic Purchase implementation had no persisted order total | Deleted; current Purchase value comes from persisted backend order centavos converted once to pesos |
| Improve ViewContent match quality by sending more parameters | Meta recommended email; current score was 5.7/10 | Legitimate anonymous product views cannot contain customer email, while signed-in customer data was not added to the funnel CAPI payload | Funnel CAPI now adds normalized SHA-256 email, phone, name, external ID, city, province, postal code, and country when an authenticated customer session provides them; empty values are omitted |
| Improve Meta Pixel events covered by Conversions API | ViewContent coverage was 28%; Meta showed 2,236 fewer server events over seven days | Two broad Event Setup Tool ViewContent rules created extra browser-only events on product and non-product URLs, in addition to the coded browser/CAPI pair | Deleted both automatic ViewContent rules; only the coded product ViewContent and its matching CAPI path remain |
| Monitor event metrics | Informational action | No defect by itself | Kept for monitoring |

## Confirmed Root Cause

The active account configuration contained six Event Setup Tool rules outside the repository. Meta's sampled activities proved the automatic ViewContent implementation by showing `cs_est: true` and only one parameter, while the coded product ViewContent on the same URL contained the expected nine commerce parameters. The broad URL rule also fired ViewContent on the home page, cart, shop, and collection pages.

The two automatic Purchase rules were button-text rules. They had no access to the committed backend order, numeric final total, `PHP` currency, or permanent order event ID. They therefore account for Meta's retained parameterless Purchase samples.

## Account-Side Rules Deleted

The following rules were deleted in Meta's live Event Setup Tool and the deletion was finished/saved:

| Rule ID | Event | Trigger |
|---|---|---|
| `1339632824989641` | Purchase | Button text contains `place order cash on delivery` |
| `2584456792014844` | ViewContent | URL equals `https://mariaclaraclothing.com/` |
| `2365148247640187` | ViewContent | URL contains `https://mariaclaraclothing.com/` |
| `1289887203221814` | Purchase | Button text contains `place cod order` |
| `1595341808589731` | InitiateCheckout | Button text contains `checkout` |
| `1799457721044224` | AddToCart | Button text contains `add to cart` |

After deletion, Event Setup Tool displayed: `There are no events set up for this pixel.` Its completion screen listed all six under **Events deleted**. A fresh public Pixel configuration request subsequently contained no `estRules`, `derived_event_name`, or `rule_id` entries.

Meta Events Manager's **Track events automatically without code** setting was already Off and remains Off. The coded PageView, ViewContent, AddToCart, InitiateCheckout, and AddPaymentInfo events remain enabled. No Meta webpage DOM manipulation was used.

## Production Sender Verification

The final seven-day production outbox check contained 1,253 Meta CAPI events and every row was sent:

| Event | Sent | Invalid value/currency |
|---|---:|---:|
| PageView | 857 | Not applicable |
| ViewContent | 332 | 0 |
| AddToCart | 24 | 0 |
| InitiateCheckout | 10 | 0 |
| AddPaymentInfo | 11 | 0 |
| Purchase | 19 | 0 |

- Pending or failed outbox rows: 0
- Purchase payloads: 19 of 19 have a JSON number greater than zero and exact `PHP`
- Every non-PageView commerce payload in the seven-day window has a numeric value greater than zero and exact `PHP`
- Recent event delivery continued through the verification window
- Production CAPI test-event code is empty
- Browser Purchase remains intentionally disabled; server CAPI is the one authoritative Purchase sender until a new browser/server Test Events deduplication check is deliberately completed

## Matching Improvement

`apps/api/src/routes/analytics.js`, function `authenticatedMetaCustomer`, resolves a customer only from the authenticated HttpOnly customer session and only for a browser-confirmed Meta event. `apps/api/src/marketing/metaFunnelEvent.js`, function `addHashedCustomerData`, normalizes and SHA-256 hashes supported matching values before payload creation.

Supported authenticated fields are:

- `em`, `ph`, `fn`, `ln`
- `external_id`
- `ct`, `st`, `zp`, `country`

No raw customer value is placed in the CAPI payload or durable outbox. Anonymous visitors correctly remain anonymous; the application does not invent an email address to satisfy an Events Manager recommendation.

## Event Setup Tool Access Fix

The production Content Security Policy allowed the normal Pixel host but blocked Meta's exact Event Setup Tool script at `https://www.facebook.com/signals/iwl.js`. The policy now allows only that exact additional script URL. This enabled removal and verification of the account rules without broadening the policy to all Facebook scripts.

## Files Changed

- `apps/api/src/app.js`
- `apps/api/src/marketing/metaFunnelEvent.js`
- `apps/api/src/routes/analytics.js`
- `apps/api/test/metaFunnelEvent.test.js`
- `apps/web/nginx.conf`
- `apps/web/test/securityHeadersSource.test.js`
- `META_EVENTS_MANAGER_ACTIONS_CONFIRMED_FIX.md`

The pre-existing local edits in `apps/api/data/cart-sessions.json` and `apps/api/data/discounts.json` were preserved and were not committed or deployed.

## Verification

- Full automated suite: 580 tests; 578 passed, 0 failed, 2 skipped because optional external test infrastructure was not configured
- Production web build: passed
- Public health endpoint: `{"ok":true,"service":"maria-clara-clothing"}`
- Production API container: healthy
- Production PostgreSQL container: healthy
- Production web container: running
- Public Pixel config: no active Event Setup Tool rules

## Remaining Meta Display State

The actions that quote 42% Purchase impact and the prior seven-day ViewContent coverage are based on retained historical activity. Deleting a live rule does not rewrite old events already sampled by Meta. Those cards can therefore remain visible until Meta recalculates the reporting window; they must not be hidden with **Ignore** merely to make the page look clear.

The acceptance signal is new traffic: no `cs_est` automatic commerce events, no parameterless browser Purchase, valid server Purchase money, and improving coded Pixel/CAPI coverage. Browser Purchase stays disabled until a future controlled Pixel/CAPI deduplication test passes; PageView and the other browser funnel events remain active.

## Final Status

**Fixed for all active senders and account-side automatic rules.**

The live causes of the listed Actions were removed, matching data was improved for authenticated customers, all current server commerce payloads pass strict value/currency validation, the release is healthy, and no historical Purchase was resent. Meta may continue to display the historical cards during its lookback window, but the invalid automatic senders are no longer present.
