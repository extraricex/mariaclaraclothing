const test = require('node:test');
const assert = require('node:assert/strict');

test('Pancake financial CLI accepts repeatable and comma-separated order scopes', () => {
  const { parseArguments } = require('../scripts/reconcile-pancake-order-financials');
  assert.deepEqual(parseArguments([
    '--apply', '--order=MCC-1,MCC-2', '--order=MCC-2', '--order=MCC-3'
  ]), {
    apply: true,
    help: false,
    orderNumbers: ['MCC-1', 'MCC-2', 'MCC-3']
  });
  assert.throws(
    () => parseArguments(['--all-and-apply']),
    (error) => error.code === 'pancake_financial_argument_invalid'
  );
});
