const fs = require('node:fs/promises');
const path = require('node:path');
const { closePool, query } = require('../src/db/postgres');

async function main() {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  await query(schema);
  console.log('PostgreSQL schema migrated.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
