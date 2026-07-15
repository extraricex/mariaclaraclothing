require('dotenv').config();

const { Client } = require('pg');

const APP_TABLES = [
  'review_audit_events',
  'review_images',
  'reviews',
  'review_import_batches',
  'product_images',
  'product_variants',
  'products',
  'orders'
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }

  const appUrl = new URL(process.env.DATABASE_URL);
  const databaseName = appUrl.pathname.replace(/^\//, '');

  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name.');
  }

  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = '/postgres';

  const adminClient = new Client({ connectionString: adminUrl.toString() });
  await adminClient.connect();
  const databaseResult = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  if (!databaseResult.rowCount) {
    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    console.log(`Created database ${databaseName}.`);
  }
  await adminClient.end();

  const appClient = new Client({ connectionString: process.env.DATABASE_URL });
  await appClient.connect();
  for (const tableName of APP_TABLES) {
    await appClient.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)} CASCADE`);
  }
  await appClient.end();

  console.log(`Reset local PostgreSQL tables in ${databaseName}.`);
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
