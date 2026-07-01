# Product Creation Reliability and Media Ordering Design

## Problem and verified root cause

The current add-product form starts with an empty price, zero stock, and Draft status. Submitting without a price reaches the API and returns `400 Product price is invalid`, so no product is created. A successfully saved Draft product is intentionally excluded from customer storefront APIs.

A diagnostic creation using Active status, a valid price, one collection, stock data, and two photos selected in one file-picker action returned `201`, appeared in the admin catalog, and returned `200` from the customer product API. The multipart upload path is working; the form defaults and weak validation feedback are the creation failure.

## Scope

Keep the existing add-product page layout and theme. Improve creation reliability, make batch photo selection obvious, and add photo ordering controls.

## Product defaults and validation

- New products default to `active` instead of `draft` so a valid saved product can appear on the customer website immediately.
- Require a non-empty title.
- Require a price greater than zero.
- Require at least one selected storefront collection.
- Require at least one product photo.
- Require total variant stock greater than zero before an Active product can be saved. A user can deliberately choose Draft to save a zero-stock product.
- Keep the existing size-chart completeness validation.
- Run client validation before sending the multipart request.
- Display a concise summary near the Save area and a specific message beside the invalid section.
- Preserve all entered data and queued photos after validation or API errors.

## Batch photo selection

The existing file input continues to use the native `multiple` attribute and accepts up to eight images in one selection. The Media section adds explicit guidance: **Select up to 8 photos at once**.

The same queue accepts multiple files dropped together onto a visible drop zone. File type, 5 MB per-file size, and eight-photo limits continue to use the shared media validator.

## Photo ordering

Queued photo previews become a sortable list.

- Desktop users can drag a preview and drop it before another preview.
- Touch and keyboard users can use **Move first**, **Move left**, **Move right**, and **Move last** actions.
- Moving a photo updates the queued array immediately.
- The first preview displays **Storefront cover**.
- Remaining previews display their one-based gallery position.
- The multipart request appends files in queued-array order.
- The API already converts multipart file order into zero-based `sortOrder`, so the saved storefront cover and customer gallery follow the editor order.
- Removing an image keeps the remaining order contiguous.

The implementation uses native pointer/drag events and existing React state. No drag-and-drop package is added.

## Components and data flow

- `newProductMedia.js` owns pure file validation and reorder helpers.
- A focused `QueuedProductMedia` component renders the drop zone, previews, drag targets, reorder actions, and removal actions.
- `ProductEditor` owns queued files, validation state, product fields, and the final multipart submission.
- `buildNewProductBody` appends queued files in their current order.
- The existing multipart product-create route persists ordered images and collections in one creation request.

## Error handling

- Prevent submission when required fields are missing or invalid.
- Do not clear queued files or object URLs after a failed submission.
- Ignore drag operations without a valid source and target.
- Reject unsupported, oversized, or excess files without discarding already accepted photos.
- Keep the API error visible if server validation rejects a request.

## Testing

- Add pure unit tests for moving photos first, left, right, and last while preserving file identity.
- Add validation tests for title, price, collection, photo, and Active-stock requirements, plus the allowed Draft zero-stock path.
- Add browser coverage for two photos selected in one action, drag reordering, accessible button reordering, cover-label movement, and successful Active creation.
- Verify the created product appears in the admin list, customer API, selected collection, and saved gallery order; delete the test product afterward.
- Run all API and web suites, production build, and existing cursor/accessibility/responsive browser tests.

## Non-goals

- No page redesign.
- No third-party drag-and-drop dependency.
- No collection creation from the product editor.
- No changes to existing-product image upload endpoints.
- No automatic stock value; the administrator must enter real inventory for an Active product.
