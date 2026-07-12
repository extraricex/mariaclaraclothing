const { createApp } = require('./app');
const { env } = require('./config/env');
const { closePool, getPool } = require('./db/postgres');
const { createMetaConversionsWorker } = require('./marketing/metaConversionsWorker');
const { createOrderNotificationWorker } = require('./notifications/orderNotificationWorker');
const {
  createPancakeAutoSyncWorker,
  shouldRunPancakeAutoSync
} = require('./integrations/pancake/pancakeAutoSyncWorker');
const { createPayMongoWorker } = require('./payments/paymongoWorker');

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function startServer({
  app = createApp(),
  config = env,
  createWorker = createMetaConversionsWorker,
  createNotificationWorker = createOrderNotificationWorker,
  createPancakeWorker = createPancakeAutoSyncWorker,
  createPaymentWorker = createPayMongoWorker,
  pool,
  closeDatabase = closePool,
  registerSignals = true,
  logger = console
} = {}) {
  const server = app.listen(config.port, () => {
    logger.log(`Maria Clara Clothing running on http://localhost:${config.port}`);
  });
  const worker = config.meta.enabled
    ? createWorker({ client: pool || getPool(), config: config.meta, logger })
    : null;
  worker?.start();
  const notificationWorker = config.notifications?.enabled
    ? createNotificationWorker({ client: process.env.DATABASE_URL ? (pool || getPool()) : undefined, config: config.notifications, logger })
    : null;
  notificationWorker?.start();
  const pancakeWorker = shouldRunPancakeAutoSync(config.pancake)
    ? createPancakeWorker({ config: config.pancake, logger })
    : null;
  pancakeWorker?.start();
  const paymentWorker = config.paymongo?.configured ? createPaymentWorker({ config: config.paymongo, logger }) : null;
  paymentWorker?.start();
  let shutdownPromise;

  function shutdown() {
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        worker?.stop();
        notificationWorker?.stop();
        pancakeWorker?.stop();
        paymentWorker?.stop();
        await closeHttpServer(server);
        await closeDatabase();
      })();
    }
    return shutdownPromise;
  }

  if (registerSignals) {
    for (const signal of ['SIGTERM', 'SIGINT']) {
      process.once(signal, () => {
        shutdown().catch((error) => {
          logger.error('Server shutdown failed:', error);
          process.exitCode = 1;
        });
      });
    }
  }

  return { server, worker, notificationWorker, pancakeWorker, paymentWorker, shutdown };
}

if (require.main === module) startServer();

module.exports = { startServer };
