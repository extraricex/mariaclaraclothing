# UA Worldwide Clean Storefront Recommendation

## Goal

Use the clean ecommerce direction of UA Worldwide as a reference for the Maria Clara customer website.

Reference reviewed: https://www.uaworldwide.com/

This document is for recommendation and approval only. No customer website code should be changed until this direction is approved.

## Important Boundary

We should not copy UA Worldwide exactly. Do not copy their logo, product names, product photos, collection names, copywriting, icons, payment claims, app download content, or footer credits.

What we can adapt:

- clean black/white storefront structure
- compact announcement/trust messaging
- simple header and navigation hierarchy
- product-first homepage layout
- dense product cards with quick buying controls
- category navigation
- clear sold-out and coming-soon states
- simple payment and shipping trust area

The final Maria Clara site should still feel like Maria Clara Clothing, using Maria Clara assets, product photos, COD/J&T checkout rules, and the current admin-managed product data.

## Reference Observations

UA Worldwide has a clean shopping layout built around:

- repeated delivery/support announcement text
- minimal header links: Home, Contact Us, Size Charts, login, cart, search, country/region
- horizontal product category navigation
- large catalog-first product grid
- product cards with size options, quantity, Add to Cart, price, and sold-out/coming-soon states
- clean footer with payment methods and policy links

The overall look is direct, retail-focused, and easy to scan. It is less editorial than our current homepage and puts products in front of the customer faster.

## Current Maria Clara Customer Website

Our current customer homepage already has:

- Maria Clara logo/header
- mobile menu
- search overlay
- cart link
- announcement bar
- hero carousel
- New Arrivals collection
- Freedom of Mind collection
- About Us section
- footer links
- admin-managed products feeding customer product grids
- Meta Pixel preparation
- J&T-ready checkout address flow

The main gap is that the homepage still feels like a visual prototype. It can be made cleaner, denser, and more sales-focused without losing the Maria Clara brand.

## Recommended Direction

### 1. Announcement And Trust Bar

Replace the single announcement feel with a compact repeating trust strip.

Recommended Maria Clara messages:

- `BUY 2 ITEMS TO GET FREE SHIPPING`
- `NATIONWIDE COD AVAILABLE`
- `J&T DELIVERY READY`
- `SUPPORT HOURS MON-SUN`

Keep the bar thin and unobtrusive. This should support shopping confidence, not dominate the page.

### 2. Header

Use a cleaner, simpler header:

- left: menu or primary nav
- center: Maria Clara logo
- right: search, account/login placeholder, cart

Recommended desktop nav:

- Home
- New Arrivals
- Freedom of Mind
- Size Guide
- Shipping
- Contact

Recommended mobile nav:

- Shop
- New Arrivals
- Freedom of Mind
- Size Guide
- Shipping & Returns
- FAQ
- Cart

### 3. Category Navigation

Add a horizontal category bar under the header or announcement area.

Recommended Maria Clara categories:

- All
- New Arrivals
- Freedom of Mind
- Oversized Shirts
- Crop Box
- Sale
- Coming Soon

This should map to real product data where possible. If a category has no products, do not show it yet.

### 4. Homepage Structure

Recommended order:

1. Announcement/trust strip
2. Clean header
3. Compact hero/banner with one strong image
4. Category navigation
5. Product grid
6. Freedom of Mind collection grid
7. Trust/payment/shipping strip
8. About Maria Clara, shorter than current copy
9. Footer

The product grid should become the main experience. The hero should support the products, not delay access to them.

### 5. Product Cards

Make cards cleaner and more useful:

- product image
- sale or sold-out badge
- product name
- price and compare-at price
- available sizes
- quick Add to Cart if a size is selected
- sold-out disabled state

Do not add fake size or payment behavior. Use actual product variants from admin.

### 6. Product Grid Layout

Recommended desktop:

- 4 columns for wide screens
- 3 columns for medium screens
- 2 columns for mobile if images remain readable
- 1 column only for very small screens

Use consistent image ratios and tighter spacing. UA’s advantage is that many products are visible quickly.

### 7. Search

Keep search simple and product-focused:

- search by product name
- search by color words
- search by collection
- search by product type

Search results should show product image, title, price, and status.

### 8. Footer

Use a more complete ecommerce footer:

- Maria Clara logo/name
- short brand sentence
- Customer Care
- FAQ
- Shipping and Returns
- Terms of Use
- Contact
- Social links if available
- Payment/support note

Payment methods should only be shown if they are active. For now, safest messaging is:

- Cash on Delivery
- J&T delivery
- Free shipping for 2 items

Do not show GCash, Maya, cards, or bank logos until those payment methods are actually supported.

## What To Avoid

- Do not copy UA product photos or names.
- Do not copy UA’s exact category labels unless they match Maria Clara products.
- Do not add a country selector unless we truly support international orders.
- Do not add app download content unless Maria Clara has an app.
- Do not add payment method logos that checkout cannot process.
- Do not make the homepage too text-heavy.
- Do not hide admin-managed product details behind hardcoded frontend content.

## Recommended Implementation Phases

### Phase 1: Clean Header And Trust Strip

Scope:

- refine announcement bar
- add compact trust messages
- simplify header spacing
- keep current icons and mobile drawer behavior

Risk: low.

### Phase 2: Category Bar And Product-First Homepage

Scope:

- add category navigation
- make product grid more prominent
- reduce hero dominance
- keep New Arrivals and Freedom of Mind connected to admin collections

Risk: medium because it changes homepage layout.

### Phase 3: Cleaner Product Cards

Scope:

- tighten image, title, price, badge, size display
- add quick Add to Cart only if it can be done cleanly
- preserve cart and Meta Pixel behavior

Risk: medium because cart behavior and variant selection must remain correct.

### Phase 4: Footer And Trust Area

Scope:

- improve footer organization
- add customer care links
- add COD/J&T/free-shipping trust notes

Risk: low.

## Data And Admin Alignment

All customer website product details should come from admin-managed product data:

- product name
- product photos
- price
- compare-at price
- stock status
- variants/sizes
- collection membership
- product page content

Avoid hardcoding product-specific details in the customer homepage. The admin website should remain the source of truth.

## Testing Recommendation

Before implementation is considered complete:

- product grid renders admin products
- category filters match admin collections
- all product card images use current admin image data
- sold-out products cannot be added to cart
- active products can be added to cart
- mobile header and drawer remain usable
- search still works
- checkout path remains unchanged
- Meta Pixel events still fire for product view, add to cart, checkout, and purchase

## Recommendation

Proceed with a UA-inspired cleanup, but do it as an adaptation, not a copy.

The best first implementation is Phase 1 and Phase 2 together:

- clean trust strip
- simplified header spacing
- category bar
- product-first homepage layout

Then review the live result before changing product cards or footer.
