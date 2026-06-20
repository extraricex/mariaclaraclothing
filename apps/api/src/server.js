const { createApp } = require('./app');
const { env } = require('./config/env');
const { closePool, getPool } = require('./db/postgres');
const { createMetaConversionsWorker } = require('./marketing/metaConversionsWorker');

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function startServer({
  app = createApp(),
  config = env,
  createWorker = createMetaConversionsWorker,
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
  let shutdownPromise;

  function shutdown() {
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        worker?.stop();
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

  return { server, worker, shutdown };
}

if (require.main === module) startServer();

module.exports = { startServer };
