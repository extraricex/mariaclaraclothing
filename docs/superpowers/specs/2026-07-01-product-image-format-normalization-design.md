# Product Image Format Normalization Design

## Verified cause

JPEG and PNG are already accepted when under 5 MB. Live browser verification accepted a 123 KB JPEG and an 877 KB PNG together. A 13 MB JPEG was rejected with `Each product photo must be 5 MB or smaller.` Several real product assets are 13–32 MB, while WebP succeeds because it is compressed below the limit.

## Design

- Accept JPEG/JPG, PNG, WebP, AVIF, GIF, and TIFF inputs up to 40 MB each, eight files per selection.
- Keep multipart uploads on disk so eight large files do not occupy hundreds of MB of Node heap.
- Validate declared MIME/extension at upload and validate actual image bytes through Sharp.
- Auto-orient from metadata, resize inside 2400×2400 without enlargement, and convert every input to WebP quality 86.
- Preserve alpha transparency through WebP.
- Save only optimized `.webp` paths in product image records; queued ordering still determines cover and gallery order.
- Delete originals after successful conversion and delete originals/converted outputs after conversion or persistence failure.
- Update client limits, accepted extensions, and messages to match the API.
- Keep the current editor layout, batch selection, drag ordering, and collection behavior unchanged.

## Errors and tests

- Unsupported or corrupt images return a clear 400 response.
- Files above 40 MB are rejected before upload.
- Unit tests normalize real JPEG and PNG fixtures and verify WebP metadata and maximum dimensions.
- Browser tests create a product from a real JPEG larger than 5 MB plus PNG, then verify optimized WebP images are visible through admin and customer APIs.
- Full API/web suites, build, Docker health, and existing browser regressions must pass.

## Git constraint

No Git commands or commits will be performed.
