async function persistPostgresCheckout(input, deps) {
  const idempotencyKey = String(input.cartSessionId || '').trim();
  if (!idempotencyKey) {
    const error = new Error('Cart session id is required');
    error.status = 400;
    throw error;
  }

  return deps.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [idempotencyKey]);
    const existing = await deps.findByIdempotencyKey(idempotencyKey, { client });
    if (existing) return existing;

    const order = {
      ...input.persistedOrder,
      checkoutIdempotencyKey: idempotencyKey
    };
    await deps.deductStock(input.stockItems, { client });
    await deps.saveOrder(order, { client });
    await deps.appendMovements(input.movements, { client });
    await deps.convertCart(idempotencyKey, order.orderNumber, { client });
    if (input.discountCode) {
      await deps.incrementDiscount(input.discountCode, { client });
    }
    if (deps.metaEnabled) {
      const event = deps.buildMetaEvent({ order, requestContext: input.requestContext });
      const outbox = event ? await deps.insertOutbox(client, event) : null;
      deps.logMetaDevelopment?.({
        order,
        event,
        conversionsApiSent: false,
        reason: !event ? 'invalid_purchase_data' : outbox ? 'queued' : 'duplicate'
      });
    }
    if (deps.enqueueOrderExport) {
      await deps.enqueueOrderExport(order, { client });
    }
    if (deps.enqueueAdminEmail) {
      await deps.enqueueAdminEmail(order, { client });
    }
    return order;
  });
}

module.exports = { persistPostgresCheckout };
