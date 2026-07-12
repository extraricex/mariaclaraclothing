const fs = require('node:fs');
const path = require('node:path');
const { hasDatabaseUrl } = require('../src/db/postgres');
const { listEditableProducts, saveEditableProduct } = require('../src/products/catalogRepository');
const { applyOversizedProductTemplate, isOversizedProduct } = require('../src/products/oversizedProductTemplate');

async function run({ apply = false } = {}) {
  if (!hasDatabaseUrl()) {
    const file = process.env.PRODUCTS_DATA_FILE || path.join(__dirname, '..', 'data', 'products.json');
    const products = JSON.parse(fs.readFileSync(file, 'utf8'));
    const affected = products.filter(isOversizedProduct);
    if (apply) {
      fs.writeFileSync(file, `${JSON.stringify(products.map(applyOversizedProductTemplate), null, 2)}\n`);
    }
    return { applied: apply, count: affected.length, products: affected.map(({ name, slug }) => ({ name, slug })) };
  }

  const products = await listEditableProducts();
  const affected = products.filter(isOversizedProduct);
  if (apply) {
    for (const product of affected) {
      await saveEditableProduct(applyOversizedProductTemplate(product), product.slug);
    }
  }
  return { applied: apply, count: affected.length, products: affected.map(({ name, slug }) => ({ name, slug })) };
}

if (require.main === module) {
  run({ apply: process.argv.includes('--apply') })
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`Oversized template failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { run };
