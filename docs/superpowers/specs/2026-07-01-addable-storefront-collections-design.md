# Addable Storefront Collections Design

## Goal

Allow an administrator to create persistent storefront collections from `/admin/collections` without changing the page's overall visual structure.

## Behavior

- The Collections page keeps its existing tabs and product membership controls.
- A compact collection-name input and `Add collection` button create a collection.
- Names are trimmed, required, limited to 60 characters, and unique without regard to letter case.
- New collections immediately appear in collection tabs, product editor choices, product-list filters, and product countdown configuration.
- A new collection remains admin-only while empty.
- Once it contains at least one active product, the customer homepage renders it as another collection section.
- Existing `New Arrivals` and `Freedom of Mind` behavior and homepage copy remain unchanged.

## Architecture

The existing store-settings record becomes the canonical collection registry through a `storefrontCollections` array. The API exposes authenticated list/create endpoints and includes the registry in safe public storefront settings. Collection countdown settings are normalized against the registry so newly created collections receive a disabled default countdown.

React admin pages use a shared collection-loading hook instead of hardcoded arrays. The homepage combines the public registry with catalog products, hides empty collections, and uses stable slug-style section IDs.

## Error Handling

The API rejects blank, overlong, and duplicate names with clear 400/409 responses. The Collections page displays the returned message and disables submission while saving.

## Testing

- Repository tests cover defaults, persistence, validation, duplicate detection, and default countdown creation.
- Admin API tests cover authentication, listing, and creation.
- Source/unit tests cover dynamic consumers and homepage empty-collection behavior.
- A browser test creates a collection, assigns a product, and verifies the collection appears to customers.

## Constraints

- No collection deletion in this scope.
- No broad UI redesign.
- No Git operations.
