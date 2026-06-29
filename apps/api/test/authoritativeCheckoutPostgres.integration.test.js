const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

const databaseUrl = process.env.TEST_POSTGRES_URL;

test('authoritative checkout migration defines durable quote and idempotency state', async () => {
  const migration = await fs.readFile(
    path.join(__dirname, '..', 'db', 'migrations', '20260628_authoritative_checkout.sql'),
    'utf8'
  );
  const schema = await fs.readFile(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

  for (const sql of [migration, schema]) {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS checkout_quotes/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS checkout_idempotency/);
    assert.match(sql, /confirmation_token_hash/);
    assert.match(sql, /CHECK \(status IN \('in_progress', 'completed'\)\)/);
    assert.match(sql, /consumed_order_number/);
  }
});

test('PostgreSQL serializes matching checkout retries into one complete commerce transaction', {
  skip: databaseUrl ? false : 'TEST_POSTGRES_URL is not set'
}, async () => {
  process.env.DATABASE_URL = databaseUrl;
  const { transaction, closePool } = require('../src/db/postgres');
  const { placeAuthoritativeCheckout } = require('../src/checkout/authoritativeCheckoutService');
  const { claimIdempotency, completeIdempotency, hashIdempotencyKey } = require('../src/checkout/checkoutIdempotencyRepository');
  const { findCheckoutQuoteForUpdate, consumeCheckoutQuote } = require('../src/checkout/checkoutQuoteRepository');
  const { deriveConfirmationToken, hashConfirmationToken } = require('../src/checkout/confirmationToken');
  const { sha256Object } = require('../src/checkout/requestHash');
  const { deductVariantStock } = require('../src/products/catalogRepository');
  const { saveOrder } = require('../src/orders/orderRepository');
  const { appendInventoryMovements } = require('../src/inventory/inventoryMovementRepository');
  const { markCartSessionConverted } = require('../src/cartSessions/cartSessionRepository');
  const { insertMetaPurchaseOutbox } = require('../src/marketing/marketingEventOutboxRepository');
  const { buildMetaPurchaseEvent } = require('../src/marketing/metaEvent');
  const pool = new Pool({ connectionString: databaseUrl });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const slug = `integration-shirt-${suffix}`;
  const sku = `INTEGRATION-${suffix}`;
  const cartSessionId = `cart-${suffix}`;
  const quoteId = `quote-${suffix}`;
  const orderNumber = `MCC-${suffix}`;
  const idempotencyKey = `idempotency-${suffix}`;
  const confirmationSecret = 'integration-confirmation-secret-32-chars';
  const snapshot = {
    cartSessionId,
    requestHash: 'quote-request',
    pricingFingerprint: 'stable-price',
    items: [{
      productId: `catalog-${slug}`, variantId: `catalog-${slug}-0`, slug, sku,
      productName: 'Integration Shirt', size: 'Small', quantity: 1,
      unitPriceCents: 64900, lineTotalCents: 64900
    }],
    itemCount: 1,
    address: {
      houseAddress: '12 Test', provinceCode: 'CAVITE', cityCode: 'CAVITE|IMUS',
      barangayCode: 'CAVITE|IMUS|BUCANDALA IV', province: 'CAVITE', city: 'IMUS',
      barangay: 'BUCANDALA IV', addressLine: '12 Test, BUCANDALA IV, IMUS, CAVITE, Philippines'
    },
    shippingRegion: 'metro_manila_cavite', shippingRegionLabel: 'Metro Manila & Cavite',
    shippingFeeCents: 8000, shippingStatus: 'ready', discountCode: '', discountSnapshot: {},
    subtotalCents: 64900, discountTotalCents: 0, totalCents: 72900,
    freeShippingUnlocked: false, finalizable: true
  };

  try {
    await pool.query(
      `INSERT INTO products (slug, name, description, price_cents) VALUES ($1, 'Integration Shirt', '', 64900)
       ON CONFLICT (slug) DO NOTHING`,
      [slug]
    );
    await pool.query(
      `INSERT INTO product_variants (product_slug, size, sku, stock_quantity)
       VALUES ($1, 'Small', $2, 2)`,
      [slug, sku]
    );
    await pool.query(
      `INSERT INTO cart_sessions (session_id, status, items, item_count, subtotal_cents)
       VALUES ($1, 'abandoned_checkout', $2::jsonb, 1, 64900)`,
      [cartSessionId, JSON.stringify(snapshot.items)]
    );
    await pool.query(
      `INSERT INTO checkout_quotes (id, cart_session_id, request_hash, snapshot, finalizable, expires_at)
       VALUES ($1, $2, 'quote-request', $3::jsonb, true, now() + interval '15 minutes')`,
      [quoteId, cartSessionId, JSON.stringify(snapshot)]
    );

    const dependencies = {
      now: () => new Date(), confirmationSecret, idempotencyTtlMs: 86400000,
      hashRequest: sha256Object, hashKey: hashIdempotencyKey,
      createOrderNumber: () => orderNumber, transaction, claimIdempotency,
      loadQuote: findCheckoutQuoteForUpdate, refreshQuote: async () => ({ ...snapshot }),
      deductStock: deductVariantStock, saveOrder, appendMovements: appendInventoryMovements,
      convertCart: markCartSessionConverted, claimPromo: async () => {},
      insertMeta: async (client, order, requestContext) => insertMetaPurchaseOutbox(
        client, buildMetaPurchaseEvent({ order, requestContext })
      ),
      consumeQuote: consumeCheckoutQuote, completeIdempotency,
      deriveToken: deriveConfirmationToken, hashToken: hashConfirmationToken
    };
    const request = {
      quoteId, cartSessionId, idempotencyKey,
      customer: { fullName: 'Integration Customer', phone: '09171234567', email: '' },
      paymentMethod: 'cash_on_delivery', notes: '', requestContext: {}
    };
    const [first, retry] = await Promise.all([
      placeAuthoritativeCheckout(request, dependencies),
      placeAuthoritativeCheckout(request, dependencies)
    ]);

    assert.equal(first.orderNumber, orderNumber);
    assert.equal(retry.orderNumber, orderNumber);
    assert.equal(first.confirmationToken, retry.confirmationToken);
    const result = await pool.query(
      `SELECT
        (SELECT count(*) FROM orders WHERE order_number = $1)::int AS orders,
        (SELECT stock_quantity FROM product_variants WHERE sku = $2) AS stock,
        (SELECT count(*) FROM inventory_movements WHERE order_number = $1)::int AS movements,
        (SELECT count(*) FROM marketing_event_outbox WHERE event_id = $3)::int AS meta,
        (SELECT consumed_order_number FROM checkout_quotes WHERE id = $4) AS consumed,
        (SELECT confirmation_token_hash FROM orders WHERE order_number = $1) AS token_hash`,
      [orderNumber, sku, `purchase:${orderNumber}`, quoteId]
    );
    assert.deepEqual(result.rows[0], {
      orders: 1, stock: 1, movements: 1, meta: 1,
      consumed: orderNumber, token_hash: hashConfirmationToken(first.confirmationToken)
    });
  } finally {
    await pool.query('DELETE FROM marketing_event_outbox WHERE event_id = $1', [`purchase:${orderNumber}`]);
    await pool.query('DELETE FROM inventory_movements WHERE order_number = $1', [orderNumber]);
    await pool.query('DELETE FROM checkout_idempotency WHERE key_hash = $1', [hashIdempotencyKey(idempotencyKey)]);
    await pool.query('DELETE FROM checkout_quotes WHERE id = $1', [quoteId]);
    await pool.query('DELETE FROM orders WHERE order_number = $1', [orderNumber]);
    await pool.query('DELETE FROM cart_sessions WHERE session_id = $1', [cartSessionId]);
    await pool.query('DELETE FROM product_variants WHERE sku = $1', [sku]);
    await pool.query('DELETE FROM products WHERE slug = $1', [slug]);
    await pool.end();
    await closePool();
  }
});
