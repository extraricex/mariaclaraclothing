# enhancementdata.md

# Admin Dashboard Long-Term Enhancement Roadmap

## Project Goal

Build and improve the admin dashboard so it can manage the customer website without needing to manually edit programming code.

This document is a long-term roadmap, not a single implementation batch. Features should be shipped in phases, with each phase connected to real customer website data before moving to the next area.

The admin dashboard should follow Shopify admin behavior as closely as practical for the store's workflows. Where exact Shopify behavior depends on Shopify-only systems or conflicts with this project's data model, the implementation should document the closest matching behavior and the reason for the difference.

The admin system is for **one admin only**. Multi-user staff accounts, role management, and per-user permissions are out of scope unless the business later needs multiple admin users.

The admin dashboard should eventually include functional sections for:

- Orders
- Drafts
- Abandoned Checkouts
- Products
- Collections
- Inventory
- Customers
- Discounts
- Website Content
- Settings

All buttons, forms, filters, dropdowns, tables, exports, and save actions must be fully functional and connected to the customer website data.

## Roadmap Principles

- Treat this as a phased roadmap. Do not implement every item at once.
- Prioritize real data connections over visual-only UI.
- Avoid dummy/static data unless clearly marked as temporary local development scaffolding.
- Match Shopify admin behavior exactly where possible, especially for navigation, filters, tables, editor layout, and save feedback.
- Keep the current single-admin authentication model unless a future roadmap update explicitly adds multi-user support.
- Every new admin feature should define its database fields, API endpoints, UI behavior, validation rules, and customer website impact before implementation.
- Any feature that changes checkout, orders, stock, discounts, or exports must include tests because those areas affect fulfillment and revenue.

## Finished Work Log

Finished as of June 12, 2026:

- **Admin logo:** Admin login and admin layout use the uploaded website logo with text fallback.
- **Orders sidebar dropdown:** Orders menu expands and shows clickable Draft and Abandoned Checkout links.
- **Orders page operations:** Orders page has date filters, summary cards, richer order columns, selectable rows, and filtered/selected J&T export behavior.
- **Draft page:** Draft shows active cart sessions with items where checkout has not started. Unknown/unregistered customers display as `Anonymous`.
- **Abandoned Checkout page:** Abandoned Checkout shows checkout-started cart sessions that have not converted to an order.
- **Cart session conversion:** Successful orders mark their cart session converted and hide it from Draft and Abandoned Checkout.
- **Order editor contact fields:** Admin can edit customer full name, contact number, and email.
- **Order editor address fields:** Admin can edit J&T-ready separated address fields: house/street, province, city/municipality, and barangay.
- **Order editor item fields:** Admin can edit ordered item name, size, quantity, and unit price. The API recalculates subtotal and total after item edits.
- **Order editor product picker:** Adding an order item now opens a searchable product picker. Admin can type to search catalog products and select a specific variant/size to append a populated item to the order.
- **Shopify-inspired Order detail:** Order detail now uses a responsive Shopify-style layout with header status badges/actions, fulfillment item editor, payment summary/actions, timeline notes, customer/sidebar details, conversion summary, order risk, and J&T readiness.
- **J&T export foundation:** J&T export validates customer/contact/address/order fields and writes province, city, barangay, parcel name, COD, and remarks into the provided Excel template.
- **Product Admin Operations Phase 1:** Products sidebar dropdown is available with Products, Collections, and Inventory. Products list supports status, stock, collection, category, vendor, search, and sort controls. Product editor exposes category, product type, vendor, tags, theme template, per-variant price, and total inventory. Inventory page lists product stock health and links back to product editing.
- **Shopify-inspired Products index:** Products page has saved-view tabs for All, Active, Draft, Archived, Low stock, and Sold out. The page includes Import, Export, More actions, and Add product controls, selectable product rows, selected-count bulk actions, product status badges, inventory badges, product organization details, sales channel visibility, and direct links to each product editor.
- **Shopify-inspired Product editor:** Product editor now uses a responsive two-column layout with title/actions, status badge, main editing sections, and a right operations sidebar. Description editor buttons apply real text formatting. Media section supports adding photos and removing photos while enforcing the one-photo minimum required by the API.
- **Admin responsive polish:** Admin shell has a responsive mobile top navigation with horizontal scrolling, constrained main content, overflow protection, shared small-radius buttons, a defined secondary button style, and rounded form fields.
- **Rich product description editor:** Product description editor now uses a rich editable area instead of a plain textarea. Admin can apply functional font style, font size, font color, font weight, heading, paragraph, list, underline, italic, bold, and link formatting. Saved descriptions are sanitized HTML and keep only approved tags and safe inline font styles for storefront rendering.
- **Shopify-inspired Discounts index:** Discounts page now has saved views, search, selectable rows, summary cards, export/create controls, status badges, and a Shopify-style create discount panel for checkout-validated percentage and fixed discount codes.
- **Shopify-inspired Discount detail:** Discount codes now open into a responsive Shopify-style detail editor with editable value, eligibility, usage limit, end date, status actions, duplicate behavior, summary, performance, and tags placeholder.

---

# Orders Section Enhancement

## Sidebar Menu Behavior

In the admin sidebar, when the **Orders** button is clicked, it should expand and show a dropdown submenu similar to the reference image.

Dropdown items under Orders:

- **Orders**
- **Drafts**
- **Abandoned Checkouts**

Long-term data requirement:

- **Orders** should use completed customer checkout records.
- **Drafts** in this project should show active cart sessions with at least one item, no completed order, and no checkout-started marker. This is a cart-draft behavior, not Shopify's manual draft-order creation behavior.
- **Abandoned Checkouts** should show cart sessions where the customer started checkout, still has at least one item, and has not completed an order.
- Do not ship Drafts or Abandoned Checkouts as static placeholder pages. Both pages must read from real cart/session data.

Exact current behavior:

- Customer cart changes are synced to the backend as a `cart_session`.
- If the customer has items in the cart but has not opened checkout, the admin Draft page shows that session.
- If the customer opens checkout, the same session moves from Draft to Abandoned Checkout.
- If the customer has not entered a name or account details, the admin customer name must display as `Anonymous`.
- If the customer completes an order, the cart session is marked converted and hidden from Draft and Abandoned Checkout lists.
- After a successful order, the browser receives a new cart-session id for future carts.
- Draft and Abandoned Checkout pages should show customer/contact details when available, item count, subtotal, cart contents, and last activity.
- Order detail page uses a responsive Shopify-style layout with the order number, payment badge, fulfillment badge, order date, and channel context in the header.
- Order detail header includes `Print`, `More actions`, `Edit`, and `Save changes` actions. `Edit` enables editable fields, and `Save changes` persists changes through the existing admin order update API.
- Order fulfillment card shows all ordered items with image/name/variant context and editable product name, size, quantity, and unit price fields when edit mode is active.
- `Add item` opens a catalog product picker instead of adding a blank row. The picker searches `/api/admin/products` while the admin types and shows product variants with size, SKU, stock, and price.
- Selecting a product variant appends a populated editable order item with product id, variant id, SKU, slug, product name, size, image, quantity `1`, and price. `Remove item` removes an item from the order editor state. Saving recalculates subtotal and total through the API.
- `Mark as fulfilled` sets the order to shipped/out-for-delivery behavior using the project's canonical status fields instead of adding a new custom status.
- Payment card shows subtotal, shipping, total, paid amount, and balance. `Mark as paid` updates the payment status to `paid` in the editor state before save.
- Timeline and Notes both use the order notes field so admin staff can keep an internal order comment attached to the order.
- Customer sidebar shows editable contact fields, separated J&T-ready address fields, billing address summary, conversion summary, order risk, and J&T readiness.

Future recommendation:

- Add a retention policy for old Draft and Abandoned Checkout sessions, such as archiving or hiding sessions after a configurable number of days.
- Add recovery status only after an email/SMS/manual follow-up workflow exists.
- Add Shopify-style manual draft order creation separately if the business needs admin-created orders.

## Orders Page Content

The **Orders** page should display all orders placed from the customer website.

The Orders page should use the existing order data model as the source of truth. Current order state is split across:

- Main order status
- Fulfillment status
- Payment status
- COD confirmation status
- Delivery status

Each customer order should show important order details such as:

- Order number
- Customer name
- Contact number
- Complete address
- Ordered item / product name
- Size
- Quantity
- Order date
- Payment method
- Order status
- Shipping status

## Date Filter

Add a **date filter** on the Orders page so orders can be filtered based on a selected date range.

Required date filter options:

- Today
- Yesterday
- Last 7 days
- Last 30 days
- Custom date range

## Orders Summary

Add a summary section on the Orders page to quickly show important order insights.

The summary should include:

- Total number of orders
- Total orders based on the selected date filter
- Most ordered item / best-selling product
- Total quantity sold per item
- Total pending orders
- Total completed orders

For reporting, `completed orders` should be a derived summary label, not a main order status. It should map to delivered/fulfilled orders according to the canonical order status model.

## Export Button

Add an **EXPORT** button on the Orders page.

Purpose of the export button:

- Export orders into an Excel file
- The Excel file must follow the exact format required by J&T
- The exported file should be ready for J&T waybill upload
- The format should be based on the J&T Excel template provided

Export requirements:

- Export only the filtered orders if a date filter is active
- Export eligible unexported orders if no filter or manual selection is active
- Allow selected-order export when the admin manually selects rows
- Do not export cancelled, delivered, already-exported, or J&T-invalid orders unless a future re-export flow is explicitly designed
- File format must be `.xlsx`
- Column arrangement must match the J&T Excel file format
- Customer address fields must be properly mapped based on the checkout data
- Province, city, barangay, and complete address must be clean and correctly placed in the Excel file
- Export should keep the current behavior of marking exported orders with J&T export metadata
- Re-export behavior must be designed separately so the admin does not accidentally upload duplicate waybills

---

# Products Section Enhancement

## Sidebar Menu Behavior

In the admin sidebar, under the **Products** menu, there should be dropdown submenu items.

Dropdown items under Products:

- **Products**
- **Collections**
- **Inventory**

The sidebar behavior should be similar to Shopify admin, where the main Products menu can expand and show related product management sections.

## Products Page

The **Products** page should display all products listed on the customer website.

The admin should be able to:

- View all products
- Open a product to edit its details
- Add a new product
- Delete an existing product
- Filter products
- Search products by title, SKU, category, collection, or status
- View product status such as Active, Draft, or Archived
- View product inventory availability

Exact current behavior:

- Products index reads from `/api/admin/products` and keeps the existing project product model as the source of truth.
- Saved views are available for **All**, **Active**, **Draft**, **Archived**, **Low stock**, and **Sold out**. Selecting a saved view applies the matching status or stock filter.
- Manual filters are available for product status, stock status, collection, category, vendor, sort order, and search.
- Product rows can be selected individually or all visible rows can be selected from the table header.
- When at least one visible product is selected, the page shows the selected count and bulk action controls.
- Each product row shows product thumbnail, title, slug, status badge, inventory badge, product organization details, sales channel, and price.
- Product organization currently displays category, vendor, and collections. Tags, created date, and updated date filters remain long-term roadmap items unless the API exposes those fields consistently.
- Sales channel currently displays **Online Store** for listed products because this project does not yet have a multi-channel publishing model.
- Import, Export, and More actions are present as Shopify-style top-level controls. Their backend workflows should be implemented separately before they perform data changes.
- Product editor uses a responsive Shopify-inspired layout: title, description, media, pricing, and variants stay in the main column; status, publishing, sales summary, collections, product organization, and theme template stay in the sidebar on desktop and stack on mobile.
- Description toolbar buttons are functional. They apply paragraph cleanup, heading, bold, italic, underline, bullet list, numbered list, and link formatting to the current selection or current line.
- Rich description controls are functional for font style, font size, font color, and font weight. The editor stores sanitized HTML in `product.description`; the storefront product page renders approved inline styles through the existing rich description tab.
- Product photos can be uploaded from the media section after the product has been saved. Existing photos can be removed from the media grid, but the UI and API keep at least one product photo.

## Product Filters

Add product filters to make product management easier.

Required filter options:

- Product status
- Product category
- Collection
- Vendor
- Tags
- Inventory status
- Date created
- Date updated

## Product Editor Page

When a product is opened, it should show a full product editor page similar to the Shopify product editor layout.

The product editor should allow the admin to edit all product details.

## Main Product Details

The product editor page should include:

- Product title
- Product description
- Rich text editor for description
- Product media/images
- Product category
- Product variants
- Product price
- Product inventory
- Product status
- Publishing channels
- Product organization
- Theme template
- Category metafields

## Product Title

The admin should be able to edit the product title.

Example:

`KAMALAYAN BLOOM BLACK — Oversized 240 GSM Shirt`

## Product Description

The product description should support a rich text editor.

The editor should allow:

- Bold text
- Italic text
- Underline text
- Headings
- Paragraphs
- Bullet points
- Links
- Images inside description
- Tables if needed
- HTML/source code view if needed

The product description should be used for the customer-facing product page.

## Product Media

The product editor should include a **Media** section.

The admin should be able to:

- Upload product images
- Add multiple product images
- Delete product images
- Replace product images
- Reorder product images
- Set the main product image
- Preview uploaded images

Media should support product photos, size charts, and other product-related images.

## Product Category

The product editor should include a product category field.

Example category:

`T-Shirts in Clothing Tops`

This category should help with product organization, search filters, and product metafields.

## Product Variants

The product editor should support product variants.

For clothing products, the main variant option should be **Size**.

Example size variants:

- Small
- Medium
- Large
- XLarge
- 2XLarge
- 3XLarge

Each variant should have editable fields such as:

- Variant name
- SKU
- Price
- Available inventory quantity
- Publishing status
- Variant image if needed

Example SKU format:

- `BLOOMBLACK-S`
- `BLOOMBLACK-M`
- `BLOOMBLACK-L`
- `BLOOMBLACK-XL`
- `BLOOMBLACK-2XL`
- `BLOOMBLACK-3XL`

The admin should be able to add another option if needed, such as Color or Design.

## Pricing

Each product variant should have an editable price field.

The admin should be able to set the same price or different prices per variant.

Example:

`₱649.00`

## Inventory

The product editor should show available inventory per variant.

The admin should be able to edit inventory quantity for every size.

The page should also show the total inventory count.

Example:

`Total inventory: 30 available`

Inventory should be connected to the product orders so stock quantity updates when a customer successfully places an order.

Inventory deduction rules must be defined before implementation:

- Deduct stock only after a valid customer order is created.
- Prevent checkout when the selected variant does not have enough stock, unless Inventory Settings later allow overselling.
- Restore stock when an order is cancelled before fulfillment.
- Do not automatically restore stock for delivered orders, returned orders, or manual admin adjustments unless a specific restock action exists.
- Handle simultaneous checkouts for the same size/variant without allowing negative stock.

## Product Status

The product editor should include a product status dropdown.

Required status options:

- Active
- Draft
- Archived

Only products with **Active** status should appear on the customer website.

## Publishing

The product editor should include a publishing section.

Publishing should show where the product is available.

Example channels:

- Website / Online Store
- Product Catalog
- All channels

The admin should be able to control whether a product is visible or hidden from the customer website.

## Sales Summary

The product editor should include a sales summary section.

Example:

- Units sold
- Number of buyers
- Net sales
- View details button

This will help the admin quickly check product performance.

## Product Organization

The product editor should include product organization fields.

Required fields:

- Product type
- Vendor
- Collections
- Tags

Example:

- Type: `Tshirt`
- Vendor: `Maria Clara`
- Collection: `New Arrivals`

The admin should be able to add or remove collections and tags.

## Theme Template

The product editor should include a theme template field.

Example:

`Default product`

This controls which product page layout will be used on the customer-facing website.

## Category Metafields

The product editor should include category metafields to improve product details and filtering.

Required metafields:

- Color
- Size
- Fabric
- Age group
- Care instructions
- Neckline
- Sleeve length type
- Target gender

Example values:

- Color: `Black`, `Floral`
- Size: `Small`, `Medium`, `Large`, `XLarge`, `2XLarge`, `3XLarge`
- Fabric: `Cotton`
- Age group: `Adults`
- Care instructions: `Hand wash`
- Neckline: `Crew`
- Sleeve length type: `Short`
- Target gender: `Unisex`

## Collections Page

The **Collections** page should allow the admin to manage product collections.

The admin should be able to:

- Create a collection
- Edit a collection
- Delete a collection
- Add products to a collection
- Remove products from a collection
- Set collection title
- Set collection image
- Set collection description
- Control collection visibility on the website

## Inventory Page

The **Inventory** page should show all product stocks in one place.

The admin should be able to:

- View all product inventory
- View inventory per variant
- Update stock quantity
- Search by product name or SKU
- Filter by low stock, out of stock, or available stock
- See total available stocks
- Track which products need restocking

Inventory should be connected to the Orders section, so when an order is placed, the inventory count is automatically deducted.

---

# Customer Section Enhancement

## Customers Page

The **Customers** page should display all customers who purchased from the customer website.

The admin should be able to view, search, and filter customer records.

Each customer record should show important customer information such as:

- Customer name
- Contact number
- Email address if available
- Complete address
- Total number of orders
- Total amount spent on the website
- Last order date
- Customer status

## Customer Purchase History

When a customer is opened, the admin should be able to see the full purchase history of that customer.

The customer profile should include all items they purchased from the website.

Purchase history should show:

- Order number
- Order date
- Product name
- Product variant / size
- Quantity purchased
- Item price
- Total order amount
- Payment method
- Order status
- Shipping status

## Customer Lifetime Value

The customer profile should show the total amount the customer has spent on the website.

This should include:

- Total lifetime purchase amount
- Total number of completed orders
- Average order value
- Most purchased item
- Last purchased item
- Date of first purchase
- Date of latest purchase

## Customer Filters

Add filters on the Customers page to make customer management easier.

Required filter options:

- Date joined
- Last order date
- Total amount spent
- Number of orders
- Customer location
- Customer status
- Customers with completed orders
- Customers with pending orders

## Customer Search

The admin should be able to search customers by:

- Customer name
- Contact number
- Email address
- Order number
- Product purchased
- City
- Province

## Customer Order Connection

The Customers section should be connected to the Orders section.

When a customer places an order, the order should automatically appear under that customer’s purchase history.

If the same customer orders again using the same contact number or email address, the new order should be added to the existing customer profile instead of creating a duplicate customer record.

For this one-admin roadmap, customers can remain automatically generated from order history unless a future phase requires manually editable customer records.

## Customer Summary

Add a customer summary section to quickly show important customer data.

The summary should include:

- Total customers
- Total repeat customers
- Total new customers
- Top spending customer
- Customer with the most orders
- Total customer sales amount

---

# Discount Section Enhancement

## Discounts Page

The **Discounts** section should allow the admin to create, edit, delete, and manage discounts for the customer website.

The discount system should support different types of discounts such as:

- Free shipping discount
- Percentage discount
- Fixed amount discount
- Product-based discount
- Order total-based discount
- Quantity-based discount

Exact current behavior:

- Discounts page reads from `/api/admin/discounts` and keeps the existing discount code model as the source of truth.
- Saved views are available for **All**, **Active**, **Scheduled**, **Expired**, and **Disabled**. The **Scheduled** view is present as a Shopify-style view but remains empty until start-date scheduling is added to the API.
- Search filters visible discount rows by code, type, value, status, and minimum subtotal.
- Discount rows can be selected individually or all visible rows can be selected from the table header.
- The table shows method/code, type/value, status, combinations, usage, start date, end date, and row actions.
- `Create discount` opens an inline creation panel. Current creation supports **Discount code** method only, with percentage or fixed amount type, value, minimum subtotal, usage limit, and optional end date.
- `Generate code` creates a local random code prefix using `MARIA`.
- `Disable` and `Enable` update the existing discount status through the admin discount API. `Delete` removes the discount code after confirmation.
- `Export` downloads the currently visible discounts as CSV. Selected bulk action currently supports disabling selected discounts. Automatic discounts, product-specific discounts, free shipping discounts, combinations, start-date scheduling, and duplicate/edit detail pages remain roadmap items until their backend and checkout behaviors are implemented.
- Clicking a discount code opens `/admin/discounts/:code`.
- Discount detail reads from the existing discounts API and edits the current discount through the existing admin discount endpoints.
- Discount detail supports editing the code, type, value, minimum subtotal, usage limit, end date, and active/disabled status. If the code itself changes, the UI creates the replacement code and removes the previous code.
- Detail actions support Save, Duplicate, Enable/Disable, Delete discount, and View all discounts.
- The detail sidebar shows summary, usage performance, and a disabled Tags placeholder. Tags, product/collection targeting, combinations, start-date scheduling, and analytics reports remain roadmap items until the backend and checkout models support them.

## Create Discount

The admin should be able to create a new discount from the admin dashboard.

The create discount form should include:

- Discount name
- Discount code
- Discount type
- Discount value
- Discount condition
- Start date
- End date
- Discount status

Discount status options:

- Active
- Scheduled
- Expired
- Disabled

## Discount Types

### Free Shipping Discount

The admin should be able to create a free shipping discount.

Example conditions:

- Free shipping when customer buys 2 or more items
- Free shipping when order total reaches a minimum amount
- Free shipping for selected regions
- Free shipping for selected products or collections

Example:

`Buy at least 2 items and get free shipping nationwide.`

### Percentage Discount

The admin should be able to create a percentage discount.

Example conditions:

- 10% off when customer buys 2 or more items
- 15% off when order total reaches a minimum amount
- 20% off for selected products
- Percentage discount for selected collections

Example:

`Get 10% off when order total reaches ₱1,500.`

### Fixed Amount Discount

The admin should be able to create a fixed amount discount.

Example conditions:

- ₱100 off when customer buys 2 items
- ₱250 off when customer buys 3 or more items
- ₱150 off when order total reaches a specific amount

Example:

`Save ₱250 when buying 3 or more shirts.`

## Discount Conditions

Discounts should only trigger when the required condition is met.

Required condition options:

- Minimum order amount
- Minimum item quantity
- Selected products
- Selected collections
- Customer location
- Customer type
- First-time customer
- Returning customer
- Specific date range

The discount should not apply if the condition is not met.

## Automatic Discount

The admin should be able to create automatic discounts.

Automatic discounts should apply automatically at checkout when the customer meets the discount condition.

Example:

- Customer adds 2 items to cart
- The system automatically applies free shipping
- Customer does not need to enter a discount code

## Discount Code

The admin should also be able to create discount codes.

Customers should be able to enter the discount code during checkout.

Example discount code:

- `FREESHIP`
- `SAVE10`
- `BUY2SAVE`

The discount code should only work if the customer meets the required condition.

## Discount Usage Limits

The admin should be able to set usage limits for discounts.

Required usage limit options:

- No limit
- Limit total number of uses
- Limit to one use per customer
- Limit to selected customers only

## Discount Date Schedule

The admin should be able to set a start date and end date for each discount.

Discount scheduling should support:

- Start immediately
- Start on a selected date
- No end date
- End on a selected date

Once the end date is reached, the discount should automatically become expired.

## Discount Management Table

The Discounts page should display all created discounts in a table.

The table should show:

- Discount name
- Discount code
- Discount type
- Discount value
- Condition
- Usage count
- Start date
- End date
- Status
- Actions

Available actions:

- View discount
- Edit discount
- Duplicate discount
- Disable discount
- Delete discount

## Checkout Discount Behavior

The customer website checkout should automatically check if a discount condition is met.

If the condition is met:

- The discount should be applied correctly
- The customer should see the discount amount
- The customer should see free shipping if applicable
- The order total should update automatically

If the condition is not met:

- The discount should not apply
- The customer should see a clear message explaining why the discount is not available

Example message:

`This discount requires a minimum of 2 items in your cart.`

---

# Website Content Management Enhancement

## Website Content Page

The admin dashboard should include a **Website Content** section where the admin can edit website text, images, logos, banners, and videos without changing the programming code.

The goal is to allow the admin to update website content easily from the dashboard instead of editing the source code manually.

## Editable Website Text

The admin should be able to edit all customer-facing website text from the admin dashboard.

Editable text should include:

- Homepage hero title
- Homepage hero subtitle
- Homepage button text
- Announcement bar text
- Product section titles
- Collection section titles
- Promo banners
- About section text
- Footer text
- Shipping information
- Return and exchange policy
- FAQ content
- Checkout notes
- Contact page details

All text updates should automatically reflect on the customer website after saving.

## Editable Website Images

The admin should be able to replace or update website images without changing code.

Editable images should include:

- Hero banner image
- Mobile hero banner image
- Website logo
- Footer logo
- Collection banner images
- Promo banner images
- Homepage section images
- Product feature images
- Size chart images
- Payment method images
- Shipping courier logos

The admin should be able to:

- Upload new images
- Replace existing images
- Delete images
- Preview images before saving
- Set different images for desktop and mobile if needed

## Editable Website Videos

The admin should be able to upload or update website videos without changing code.

Editable videos should include:

- Homepage hero video
- Product feature video
- Promotional video
- Brand story video

The admin should be able to:

- Upload a video file
- Replace an existing video
- Delete a video
- Preview the video before saving
- Enable or disable video display on the website

## Content Sections Management

The admin should be able to manage website sections from the dashboard.

The admin should be able to:

- Edit section title
- Edit section description
- Change section image or video
- Reorder website sections
- Show or hide website sections
- Enable or disable buttons
- Edit button text and button link

## No-Code Content Editing

All website content should be manageable from the admin dashboard.

The admin should not need to edit programming files, source code, or database manually, and should not need to deploy new code just to update website content.

Content updates should be saved in the database or content management system and displayed dynamically on the customer website.

## Save and Publish Behavior

The Website Content section should include save and publish controls.

Required actions:

- Save draft
- Publish changes
- Preview changes before publishing
- Cancel changes
- Restore previous content if needed

Only published changes should appear on the customer website.

This requires a future content versioning model. Until that model exists, immediate-publish content updates should remain clearly labeled as immediate changes.

## Content Access Control

Only authorized admin users should be able to edit website content.

Website content management should be protected inside the admin dashboard.

---

# Settings Section Enhancement

## Settings Page

The **Settings** section should be fully functional and should control the important configuration of the admin dashboard and customer website.

The admin should be able to manage store settings without changing the programming code.

## General Store Settings

The admin should be able to edit the basic store information.

Required fields:

- Store name
- Store website name
- Store email
- Store contact number
- Store address
- Business location
- Default currency
- Time zone
- Store logo
- Favicon

All saved settings should automatically reflect on the customer website where applicable.

## Admin Account Settings

The admin should be able to manage admin account details.

Required features:

- Edit admin name
- Edit admin email
- Change password
- Upload profile photo
- Rotate or invalidate the current admin session/token
- Manage login credentials securely

## Single Admin Access

The Settings section should support one admin account only.

The admin should be able to:

- Edit admin display name if needed
- Edit admin email if email-based notifications are later added
- Change the admin password securely
- Upload a profile photo if the UI needs one
- Log out from the current session
- Rotate or invalidate the current admin token/session if needed

Out of scope for this roadmap version:

- Multiple admin users
- Staff accounts
- User roles
- Per-user permissions
- Invite/remove user flows

## Shipping Settings

The admin should be able to manage shipping rules from the Settings section.

Required shipping settings:

- Shipping regions
- Shipping fees
- Free shipping rules
- Courier settings
- Delivery time estimates

Example shipping regions:

- Metro Manila & Cavite
- Luzon
- Visayas
- Mindanao

Shipping settings should be connected to the checkout page and order export system.

## Payment Settings

The admin should be able to manage payment methods.

Required payment options:

- Cash on Delivery
- GCash
- Bank Transfer
- Other manual payment methods if needed

The admin should be able to enable or disable each payment method.

Payment method settings should reflect on the customer checkout page.

## Checkout Settings

The admin should be able to control checkout behavior.

Required checkout settings:

- Required customer fields
- Contact number validation
- Address validation
- Province, city, and barangay selection
- Order notes
- Terms and conditions checkbox
- Checkout success message
- Checkout error message

Checkout settings should be connected to the Orders section.

## Order Status Settings

The admin should be able to manage order statuses.

Required order statuses:

- Received
- Confirmed
- Packed
- Shipped
- Delivered
- Cancelled

Separate status groups should remain available for:

- Fulfillment: Unfulfilled, Packed, Shipped, Delivered, Cancelled
- Payment: COD Pending, Paid, Cancelled, Refunded
- COD confirmation: Pending, Confirmed, Unreachable, Cancelled
- Delivery: Pending, Ready, Out for Delivery, Delivered, Returned, Cancelled

Shopify-style labels may be used in the UI where helpful, but they must map cleanly to the project's canonical status values. Do not add `Completed`, `Returned`, or `Returning` as main order statuses unless the database/API validation is updated intentionally.

The admin should be able to update order statuses from the Orders page.

## Notification Settings

The admin should be able to manage website and admin notifications.

Required notifications:

- New order notification
- Low stock notification
- Out of stock notification
- Abandoned checkout notification
- Customer message notification

Notifications should appear inside the admin dashboard.

## Email and Message Templates

The admin should be able to edit message templates without changing code.

Editable templates should include:

- Order confirmation message
- Shipping update message
- Delivery reminder message
- Abandoned checkout message
- Return and exchange message
- Customer support reply template

## Website Settings

The admin should be able to manage website-level settings.

Required website settings:

- Website visibility
- Maintenance mode
- Homepage settings
- Footer settings
- Social media links
- SEO title
- SEO description
- Meta image
- Pixel or tracking code fields if needed

## Inventory Settings

The admin should be able to control inventory behavior.

Required inventory settings:

- Enable or disable automatic stock deduction
- Low stock threshold
- Out of stock behavior
- Allow or block checkout when product is out of stock
- Restock alert settings

Inventory settings should be connected to Products and Orders.

## Discount Settings

The admin should be able to control discount behavior.

Required discount settings:

- Allow automatic discounts
- Allow discount codes
- Allow multiple discounts or single discount only
- Free shipping discount settings
- Discount validation rules

## Export Settings

The admin should be able to manage export settings.

Required export settings:

- Default export file format
- J&T Excel template format
- Order fields mapping
- Address field mapping
- Export filtered orders only
- Export all orders

This should be connected to the Orders export button.

## Security Settings

The Settings section should include security controls.

Required security features:

- Secure password update
- Session management
- Logout from all devices
- Admin access protection
- Single-admin route protection

## Save Behavior

Every setting should be functional and saved properly.

Required behavior:

- Save changes
- Cancel changes
- Show success message after saving
- Show error message if saving fails
- Validate required fields
- Reflect saved settings immediately on the related sections

The Settings section should not contain dummy buttons or static fields. Every button, input, dropdown, and toggle must work properly.

---

# Important Development Notes

- All admin sections should be connected to real database data.
- Avoid dummy/static data unless used only as temporary placeholders during development.
- Admin changes should reflect properly on the customer website.
- The admin dashboard should be responsive and clean.
- The UI should be inspired by Shopify admin layout and behavior.
- All search, filter, create, edit, delete, export, save, publish, and upload actions must work properly.
- Protect all admin routes and features from unauthorized access.
