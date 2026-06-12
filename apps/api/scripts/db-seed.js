const fs = require('node:fs/promises');
const path = require('node:path');
const { closePool } = require('../src/db/postgres');
const { replaceEditableProducts } = require('../src/products/catalogRepository');
const { saveOrder } = require('../src/orders/orderRepository');

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to seed PostgreSQL.');
  }

  const productsPath = path.join(__dirname, '..', 'data', 'products.json');
  const ordersPath = path.join(__dirname, '..', 'data', 'orders.json');
  const products = JSON.parse(await fs.readFile(productsPath, 'utf8'));
  await replaceEditableProducts(products);

  let orders = [];
  try {
    const orderStore = JSON.parse(await fs.readFile(ordersPath, 'utf8'));
    orders = Array.isArray(orderStore.orders) ? orderStore.orders : [];
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  for (const order of orders) {
    await saveOrder(order);
  }

  console.log(`Seeded ${products.length} products and ${orders.length} orders.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
