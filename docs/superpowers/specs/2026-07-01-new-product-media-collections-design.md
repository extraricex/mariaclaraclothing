# New Product Media and Collection Dropdown Design

## Scope

Keep the existing Maria Clara product editor layout and visual styling unchanged. Add only the functionality needed to upload customer-facing product photos while creating a product and replace the current collection checkboxes with a multi-select dropdown.

The previously discussed Shopify-style product editor redesign is explicitly out of scope.

## Product media

The Media section remains in its current position and style. On a new product, **Add photos** is enabled before the first save.

- The browser accepts image files only, up to eight files and 5 MB per file.
- Selected files appear immediately in the existing photo grid through local object-URL previews.
- The user can remove a queued photo before saving.
- The first queued photo is the storefront cover image.
- Every saved photo appears in the customer-facing product gallery.
- A new product must include at least one photo before it can be saved.

Object URLs are revoked when a queued image is removed, the save completes, or the editor unmounts.

## Save flow

New products use one multipart request to the existing product-create endpoint. The request contains serialized product data and the selected image files.

The API keeps existing JSON product creation compatible while also accepting multipart creation. For a multipart request it:

1. Parses and validates the serialized product payload.
2. Validates uploaded images with the existing product upload rules.
3. Builds ordered image records using the uploaded file URLs, product name as initial alt text, and zero-based sort order.
4. Saves the product and its image records together.
5. Removes newly written files if product persistence fails.

The editor stays on the filled form and keeps its queued previews when creation fails, allowing the user to correct the error and retry. On success it releases preview URLs and navigates to the saved product editor.

Existing-product image upload and deletion continue to use the current endpoints and behavior.

## Collection dropdown

The existing collection checkbox card becomes an accessible multi-select dropdown without moving or restyling the card.

- The collapsed control summarizes the selected collections.
- Opening it shows checkboxes for the storefront collections `New Arrivals` and `Freedom of Mind`.
- Both collections can be selected.
- Selections update the existing `product.collections` array and are included in the initial save request.
- Keyboard focus, Escape behavior, and disabled states remain usable.

The collections continue to determine which customer-facing storefront collection sections include the product.

## Error handling

- Reject a new product with no selected image.
- Reject non-image files, individual files above 5 MB, and more than eight images with a clear inline status message.
- Preserve entered product data and queued previews after client-side or API validation errors.
- Return existing API error responses for invalid product fields.
- Delete files written by a failed multipart creation attempt so abandoned uploads do not accumulate.

## Testing

- Add API coverage proving multipart creation saves ordered image records and exposes those images through the storefront product response.
- Add API coverage proving failed product persistence cleans up uploaded files.
- Add editor regression coverage for enabled new-product media selection, previews, removal, and multipart submission.
- Add editor regression coverage for the multi-select collection dropdown and collection payload.
- Run the complete web and API test suites, production web build, and focused browser checks.

## Non-goals

- No Shopify-style layout, sticky save bar, card reordering, or general product-editor redesign.
- No creation, renaming, or deletion of collections from the product editor.
- No image drag-and-drop reordering or alt-text editor in this change.
- No changes to storefront photo presentation beyond using the images already exposed by the saved product.
