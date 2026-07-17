const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const MAX_PRODUCT_IMAGE_BYTES = 40 * 1024 * 1024;
const PRODUCT_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/tiff'
]);
const PRODUCT_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.avif',
  '.tif',
  '.tiff'
]);
const PRODUCT_IMAGE_DERIVATIVE_WIDTHS = [320, 800];

function productImageDerivativePath(sourcePath, width) {
  const extension = path.extname(sourcePath);
  const basename = path.basename(sourcePath, extension).replace(/-optimized$/i, '');
  return path.join(path.dirname(sourcePath), `${basename}-${width}.webp`);
}

async function generateProductImageDerivatives(sourcePath) {
  const generated = [];
  try {
    for (const width of PRODUCT_IMAGE_DERIVATIVE_WIDTHS) {
      const outputPath = productImageDerivativePath(sourcePath, width);
      await sharp(sourcePath, { animated: false })
        .rotate()
        .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: width <= 320 ? 78 : 82, alphaQuality: 92 })
        .toFile(outputPath);
      generated.push(outputPath);
    }
    return generated;
  } catch (error) {
    await Promise.all(generated.map((outputPath) => fs.rm(outputPath, { force: true })));
    throw error;
  }
}

function productImageFileAllowed(file) {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  const extension = path.extname(String(file?.originalname || '')).toLowerCase();
  return PRODUCT_IMAGE_MIME_TYPES.has(mimeType) || PRODUCT_IMAGE_EXTENSIONS.has(extension);
}

async function normalizeProductUploads(files) {
  for (const file of Array.isArray(files) ? files : []) {
    const originalPath = file.path;
    const basename = path.basename(originalPath, path.extname(originalPath));
    const outputPath = path.join(path.dirname(originalPath), `${basename}-optimized.webp`);

    try {
      await sharp(originalPath, { animated: false })
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 86, alphaQuality: 100 })
        .toFile(outputPath);
      await generateProductImageDerivatives(outputPath);
      await fs.unlink(originalPath);
      const stats = await fs.stat(outputPath);
      file.path = outputPath;
      file.filename = path.basename(outputPath);
      file.mimetype = 'image/webp';
      file.size = stats.size;
    } catch (cause) {
      await fs.rm(outputPath, { force: true });
      const error = new Error(`Unsupported or corrupt product image: ${file.originalname || file.filename}`);
      error.status = 400;
      error.cause = cause;
      throw error;
    }
  }
}

module.exports = {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_DERIVATIVE_WIDTHS,
  generateProductImageDerivatives,
  normalizeProductUploads,
  productImageDerivativePath,
  productImageFileAllowed
};
