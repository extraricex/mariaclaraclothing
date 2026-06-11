#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "Applying database schema..."
  node scripts/db-migrate.js

  PRODUCT_COUNT=$(node -e "
    const { query, closePool } = require('./src/db/postgres');
    query('SELECT COUNT(*)::int AS count FROM products')
      .then(({ rows }) => { console.log(rows[0].count); return closePool(); })
      .catch(() => { console.log('error'); process.exit(1); });
  ")

  if [ "$PRODUCT_COUNT" = "0" ]; then
    echo "Empty catalog detected — seeding from data/products.json..."
    node scripts/db-seed.js
  else
    echo "Catalog already has $PRODUCT_COUNT products — skipping seed."
  fi
fi

exec node src/server.js
