const fs = require('node:fs/promises');
const path = require('node:path');
const { closePool, query, transaction } = require('../src/db/postgres');

async function applyVersionedMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  for (const filename of files) {
    const existing = await query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
    if (existing.rows.length) continue;
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
    await transaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    });
  }
}

async function main() {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  await query(schema);
  await applyVersionedMigrations();
  console.log('PostgreSQL schema migrated.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
