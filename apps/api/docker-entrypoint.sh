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

# Existing uploads live in a persistent volume. Create missing bounded card and
# thumbnail files idempotently so older catalog media benefits from responsive
# delivery after deployment as well as newly uploaded images.
node scripts/generate-product-image-derivatives.js

exec node src/server.js
