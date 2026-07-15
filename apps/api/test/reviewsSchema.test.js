const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '20260715_reviews_system.sql'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const productionCompose = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'deploy', 'docker-compose.production.yml'), 'utf8');

test('review schema supports moderation, photos, imports, audit, visibility, and indexed published queries', () => {
  for (const sql of [schema, migration]) {
    assert.match(sql, /reviews_enabled boolean NOT NULL DEFAULT true/);
    assert.match(sql, /show_rating_summary boolean NOT NULL DEFAULT true/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS reviews/);
    assert.match(sql, /status IN \('pending', 'published', 'hidden', 'archived', 'spam', 'rejected'\)/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS review_images/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS review_import_batches/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS review_audit_events/);
    assert.match(sql, /reviews_product_idx/);
    assert.match(sql, /reviews_status_idx/);
    assert.match(sql, /reviews_rating_idx/);
    assert.match(sql, /reviews_order_idx/);
    assert.match(sql, /reviews_import_batch_idx/);
    assert.doesNotMatch(sql, /order_number text REFERENCES orders/);
    assert.doesNotMatch(sql, /product_slug text REFERENCES products/);
  }
});

test('XLSX imports use the patched official SheetJS distribution', () => {
  assert.equal(packageJson.dependencies.xlsx, 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz');
  assert.equal(require('xlsx').version, '0.20.3');
});

test('production passes review signing and submission rate-limit configuration to the API', () => {
  assert.match(productionCompose, /REVIEW_IMPORT_SECRET: \$\{REVIEW_IMPORT_SECRET:-\}/);
  assert.match(productionCompose, /REVIEW_SUBMISSION_RATE_LIMIT_MAX: \$\{REVIEW_SUBMISSION_RATE_LIMIT_MAX:-8\}/);
  assert.match(productionCompose, /REVIEW_SUBMISSION_RATE_LIMIT_WINDOW_MS: \$\{REVIEW_SUBMISSION_RATE_LIMIT_WINDOW_MS:-3600000\}/);
});
