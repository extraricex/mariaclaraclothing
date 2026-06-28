const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('API integration tests run serially because JSON fallback fixtures are shared', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.match(packageJson.scripts.test, /--test-concurrency=1/);
});
