import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const editor = fs.readFileSync(new URL('../src/admin/ProductEditor.jsx', import.meta.url), 'utf8');
const card = fs.readFileSync(new URL('../src/components/ProductCard.jsx', import.meta.url), 'utf8');
const content = fs.readFileSync(new URL('../src/components/ProductCardContent.jsx', import.meta.url), 'utf8');
const repository = fs.readFileSync(new URL('../../api/src/products/catalogRepository.js', import.meta.url), 'utf8');

test('product-card editing controls live in Admin while customer cards receive display output only', () => {
  for (const label of [
    'Product card content', 'Card text', 'Five-star rating', 'Source label',
    'Show text', 'Show rating', 'Show source'
  ]) {
    assert.match(editor, new RegExp(label, 'i'));
  }
  assert.match(card, /<ProductCardContent product=\{product\}/);
  assert.doesNotMatch(card, /Card text|Show text|Show rating|Show source/);
  assert.doesNotMatch(card, /ProductCommerceStats/);
  assert.match(content, />\{source\}</);
  assert.doesNotMatch(content, />Source: \{source\}</);
});

test('manual product-card ratings require a visible source and never replace review aggregates', () => {
  assert.match(repository, /A visible source is required when showing a manually entered product card rating/);
  assert.match(editor, /source: String\(previous\.productPage\?\.cardContent\?\.source \|\| ''\)\.trim\(\) \|\| 'Previous website'/);
  assert.match(editor, /showSource: product\.productPage\?\.cardContent\?\.showRating === true/);
  assert.match(editor, /Add a source label before saving a visible manually entered rating/);
  assert.match(editor, /type="number"/);
  assert.match(editor, /inputMode="decimal"/);
  assert.match(editor, /step="0\.1"/);
  assert.match(editor, /Type a rating from 1\.0 to 5\.0/);
  assert.match(content, /<Stars rating=\{rating\}/);
  assert.match(content, /Number\.isFinite\(rating\)/);
  assert.doesNotMatch(content, /Number\.isInteger\(rating\)/);
  assert.doesNotMatch(content, /reviewSummary|ratingCount|AggregateRating/);
});
