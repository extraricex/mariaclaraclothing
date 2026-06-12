const { Pool } = require('pg');
require('dotenv').config();

let pool;

function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!hasDatabaseUrl()) {
    throw new Error('DATABASE_URL is required for PostgreSQL persistence.');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }

  return pool;
}

async function query(sql, values = []) {
  return getPool().query(sql, values);
}

async function transaction(callback) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = {
  closePool,
  getPool,
  hasDatabaseUrl,
  query,
  transaction
};
