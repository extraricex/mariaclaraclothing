# Orders

Order persistence module for checkout orders, confirmation lookup, and the future admin order workflow.

Current behavior:

- `src/routes/orders.js` validates checkout payloads and creates COD orders.
- `src/orders/orderRepository.js` stores orders in PostgreSQL when `DATABASE_URL` is set.
- Without `DATABASE_URL`, it falls back to JSON at `data/orders.json`.
- Tests can override the order data file with `ORDERS_DATA_FILE`.

Future admin work should build on the persisted order records for status changes, fulfillment notes, cancellation reasons, and COD confirmation.
