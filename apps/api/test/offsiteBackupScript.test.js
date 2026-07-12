const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('off-site backup exports Restic and B2 credentials to child processes', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'deploy', 'mariaclara-offsite-backup'), 'utf8');
  assert.match(script, /export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE B2_ACCOUNT_ID B2_ACCOUNT_KEY/);
  assert.match(script, /restic backup/);
  assert.match(script, /restic forget/);
});
