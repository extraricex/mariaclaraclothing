#!/usr/bin/env node
const { env } = require('../src/config/env');
const { closePool } = require('../src/db/postgres');
const { createPancakeClient } = require('../src/integrations/pancake/pancakeClient');
const {
  reconcilePancakeOrderFinancials,
  uniqueOrderNumbers
} = require('../src/integrations/pancake/pancakeFinancialReconciliationService');

const USAGE = [
  'Audit all linked orders (read-only):',
  '  npm run pancake:financial-reconcile',
  '',
  'Audit selected orders (read-only):',
  '  npm run pancake:financial-reconcile -- --order=MCC-1001,MCC-1002',
  '',
  'Repair selected orders (requires Pancake live mode):',
  '  npm run pancake:financial-reconcile -- --apply --order=MCC-1001 --order=MCC-1002'
].join('\n');

function parseArguments(argv = []) {
  let apply = false;
  let help = false;
  const orders = [];
  for (const argument of argv) {
    if (argument === '--apply') apply = true;
    else if (argument === '--help' || argument === '-h') help = true;
    else if (argument.startsWith('--order=')) orders.push(argument.slice('--order='.length));
    else {
      const error = new Error(`Unknown argument: ${argument}`);
      error.code = 'pancake_financial_argument_invalid';
      throw error;
    }
  }
  return { apply, help, orderNumbers: uniqueOrderNumbers(orders) };
}

async function run(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArguments(argv);
  if (options.help) return { help: USAGE };
  return reconcilePancakeOrderFinancials({
    apply: options.apply,
    orderNumbers: options.orderNumbers,
    config: dependencies.config || env.pancake,
    client: dependencies.client || createPancakeClient(env.pancake),
    orderRepository: dependencies.orderRepository,
    syncRepository: dependencies.syncRepository,
    now: dependencies.now
  });
}

if (require.main === module) {
  run()
    .then((result) => process.stdout.write(`${result.help || JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({
        ok: false,
        code: error.code || 'pancake_financial_reconciliation_failed',
        message: String(error.message || 'Pancake financial reconciliation failed.')
      })}\n`);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}

module.exports = { parseArguments, run, USAGE };
