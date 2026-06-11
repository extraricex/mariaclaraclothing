const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.join(__dirname, '..');

async function auditProductImages(options = {}) {
  const productsPath = options.productsPath || path.join(root, 'data', 'products.json');
  const publicDir = options.publicDir || path.join(root, 'public');
  const uploadDir = options.uploadDir || path.join(publicDir, 'uploads', 'products');
  const products = JSON.parse(await fs.readFile(productsPath, 'utf8'));
  const imageReferences = collectImageReferences(products);
  const referencedLocalUploadFiles = imageReferences
    .filter((reference) => reference.type === 'local-upload')
    .map((reference) => ({
      ...reference,
      filePath: publicUrlToFilePath(reference.url, publicDir),
      publicUrl: reference.url
    }));
  const missingLocalFiles = [];

  for (const reference of imageReferences.filter((item) => item.type !== 'remote')) {
    const filePath = publicUrlToFilePath(reference.url, publicDir);
    if (!(await fileExists(filePath))) {
      missingLocalFiles.push({ ...reference, filePath });
    }
  }

  const uploadFiles = await listFiles(uploadDir);
  const referencedUploadPaths = new Set(referencedLocalUploadFiles.map((reference) => path.resolve(reference.filePath)));
  const unusedLocalUploadFiles = uploadFiles
    .filter((filePath) => !referencedUploadPaths.has(path.resolve(filePath)))
    .map((filePath) => ({
      filePath,
      publicUrl: filePathToPublicUploadUrl(filePath, uploadDir)
    }));

  const summary = {
    products: products.length,
    images: imageReferences.length,
    remote: imageReferences.filter((reference) => reference.type === 'remote').length,
    localPublic: imageReferences.filter((reference) => reference.type === 'local-public').length,
    localUpload: imageReferences.filter((reference) => reference.type === 'local-upload').length,
    missingLocalFiles: missingLocalFiles.length,
    unusedLocalUploadFiles: unusedLocalUploadFiles.length
  };

  return {
    summary,
    imageReferences,
    referencedLocalUploadFiles,
    missingLocalFiles,
    unusedLocalUploadFiles
  };
}

function collectImageReferences(products) {
  return products.flatMap((product) => {
    const images = Array.isArray(product.images) ? product.images : [];
    return images.map((image, index) => {
      const url = String(image.url || image || '').trim();
      return {
        productSlug: String(product.slug || '').trim(),
        productName: String(product.name || '').trim(),
        url,
        altText: String(image.altText || product.name || '').trim(),
        sortOrder: Number.isInteger(Number(image.sortOrder)) ? Number(image.sortOrder) : index,
        type: classifyImageUrl(url)
      };
    }).filter((image) => image.url);
  });
}

function classifyImageUrl(url) {
  if (/^https?:\/\//i.test(url) || /^\/\//.test(url)) return 'remote';
  if (url.startsWith('/uploads/products/')) return 'local-upload';
  if (url.startsWith('/')) return 'local-public';
  return 'local-public';
}

function publicUrlToFilePath(url, publicDir) {
  const cleanUrl = String(url || '').split('?')[0].replace(/^\/+/, '');
  return path.join(publicDir, cleanUrl);
}

function filePathToPublicUploadUrl(filePath, uploadDir) {
  const relativePath = path.relative(uploadDir, filePath).split(path.sep).join('/');
  return `/uploads/products/${relativePath}`;
}

async function listFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listFiles(entryPath);
      if (entry.isFile()) return [entryPath];
      return [];
    }));
    return files.flat();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function printAudit(audit) {
  console.log('Product image audit');
  console.log(JSON.stringify(audit.summary, null, 2));

  if (audit.referencedLocalUploadFiles.length) {
    console.log('\nReferenced local upload files:');
    audit.referencedLocalUploadFiles.forEach((file) => {
      console.log(`- ${file.publicUrl} (${file.productName})`);
    });
  }

  if (audit.missingLocalFiles.length) {
    console.log('\nMissing local files:');
    audit.missingLocalFiles.forEach((file) => {
      console.log(`- ${file.url} (${file.productName})`);
    });
  }

  if (audit.unusedLocalUploadFiles.length) {
    console.log('\nUnused local upload files:');
    audit.unusedLocalUploadFiles.forEach((file) => {
      console.log(`- ${file.publicUrl}`);
    });
  }
}

if (require.main === module) {
  auditProductImages()
    .then(printAudit)
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  auditProductImages,
  classifyImageUrl,
  collectImageReferences
};
