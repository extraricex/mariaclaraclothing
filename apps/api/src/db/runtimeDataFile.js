const os = require('node:os');
const path = require('node:path');

function resolveRuntimeDataFile(envName, defaultFile, options = {}) {
  const environment = options.environment || process.env;
  if (environment[envName]) return environment[envName];
  if (!environment.NODE_TEST_CONTEXT) return defaultFile;
  const tmpdir = options.tmpdir || os.tmpdir();
  const pid = options.pid || process.pid;
  return path.join(tmpdir, 'maria-clara-test-runtime', String(pid), path.basename(defaultFile));
}

module.exports = { resolveRuntimeDataFile };
