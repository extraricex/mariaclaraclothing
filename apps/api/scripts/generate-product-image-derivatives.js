const fs = require('node:fs/promises');
const path = require('node:path');
const {
  PRODUCT_IMAGE_DERIVATIVE_WIDTHS,
  generateProductImageDerivatives,
  productImageDerivativePath
} = require('../src/images/productImageNormalizer');

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function main() {
  const uploadDir = process.env.PRODUCT_UPLOAD_DIR || path.join(__dirname, '..', 'public', 'uploads', 'products');
  let filenames;
  try {
    filenames = await fs.readdir(uploadDir);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  let generated = 0;
  for (const filename of filenames.filter((value) => /-optimized\.webp$/i.test(value))) {
    const sourcePath = path.join(uploadDir, filename);
    const derivatives = PRODUCT_IMAGE_DERIVATIVE_WIDTHS.map((width) => productImageDerivativePath(sourcePath, width));
    if ((await Promise.all(derivatives.map(exists))).every(Boolean)) continue;
    await generateProductImageDerivatives(sourcePath);
    generated += derivatives.length;
  }
  if (generated) console.log(`Generated ${generated} responsive product image derivatives.`);
}

main().catch((error) => {
  console.error(`Product image derivative generation failed: ${error.message}`);
  process.exitCode = 1;
});
