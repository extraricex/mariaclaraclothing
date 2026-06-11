# Admin Product To Storefront Field Map

The customer product page must read from the same product fields that the future admin website edits. Do not create separate admin-only fields for visible product details.

## Source Of Truth

Product source:

- `data/products.json`

Validation and normalization:

- `src/products/catalogRepository.js`

Storefront API shaping:

- `src/products/catalogPresenter.js`

Customer product renderer:

- `public/js/storefront.js`

## Field Map

| Admin field | Storefront API field | Product page display |
| --- | --- | --- |
| `name` | `name` | Product title |
| `priceCents` | `priceCents` | Sale price |
| `compareAtPriceCents` | `compareAtPriceCents` | Compare-at regular price |
| `merchandisingStatus` | `merchandisingStatus` | Sale/sold-out badge and purchase state |
| `images[].url` | `images[].url` | Product gallery image |
| `images[].altText` | `images[].altText` | Product gallery accessibility text |
| `images[].sortOrder` | `images[].sortOrder` | Gallery and thumbnail order |
| `variants[].size` | `variants[].size` | Size selector label |
| `variants[].sku` | `variants[].sku` | SKU for future admin/order fulfillment |
| `variants[].stockQuantity` | `variants[].stockQuantity` | Availability and sold-out state |
| `productPage.heading` | `productPage.heading` | Description headline |
| `productPage.intro` | `productPage.intro` | Opening description |
| `productPage.sections` | `productPage.sections` | Editable detail sections |
| `productPage.sizeChartImageUrl` | `productPage.sizeChartImageUrl` | Size chart image |
| `productPage.mediaLimit` | `productPage.mediaLimit` | Number of media items shown on product page |
| `productPage.soldOutText` | `productPage.soldOutText` | Disabled sold-out button text |

## Future Admin Rule

When the admin website edits stock, price, images, name, variants, or product details, it should update these fields directly. The product page should continue to render from the public product API response, so customer pages and admin data stay aligned.
