const test = require('node:test');
const assert = require('node:assert/strict');

const local = (id, sku, extra = {}) => ({
  id, productSlug: `product-${id}`, sku, status: 'active', priceCents: 64900,
  externalPosVariantId: '', ...extra
});
const remote = (id, sku, price = 64900) => ({
  id, product_id: `remote-product-${id}`, display_id: sku, retail_price: price,
  product: { name: `Remote ${id}` }, updated_at: '2026-07-04T00:00:00Z'
});

test('normalizes Unicode case and edge whitespace without removing punctuation', () => {
  const { normalizeSku } = require('../src/integrations/pancake/pancakeCatalogMapper');
  assert.equal(normalizeSku('  abＣ-1  '), 'ABC-1');
  assert.notEqual(normalizeSku('ABC-1'), normalizeSku('ABC1'));
});

test('maps only unique exact active SKU matches without mutating inputs', () => {
  const { mapCatalog } = require('../src/integrations/pancake/pancakeCatalogMapper');
  const localVariants = [local(1, ' shirt-s '), local(2, 'DRAFT', { status: 'draft' })];
  const pancakeVariations = [remote('r1', 'SHIRT-S')];
  const before = JSON.stringify({ localVariants, pancakeVariations });
  const result = mapCatalog({ localVariants, pancakeVariations, importId: 'import-1', now: '2026-07-04T00:00:00Z' });
  assert.equal(result.mappings[0].status, 'verified');
  assert.equal(result.mappings[0].pancakeVariationId, 'r1');
  assert.equal(result.mappings[1].status, 'inactive');
  assert.deepEqual(result.summary, { localVariantCount: 2, pancakeVariationCount: 1, verifiedCount: 1, conflictCount: 0 });
  assert.equal(JSON.stringify({ localVariants, pancakeVariations }), before);
});

test('reports blank duplicate missing and stale external ID conflicts', () => {
  const { mapCatalog } = require('../src/integrations/pancake/pancakeCatalogMapper');
  const result = mapCatalog({
    importId: 'i', now: '2026-07-04T00:00:00Z',
    localVariants: [
      local(1, ''), local(2, 'DUP'), local(3, 'dup'), local(4, 'MISSING'),
      local(5, 'MATCH', { externalPosVariantId: 'old-id' })
    ],
    pancakeVariations: [remote('r1', ''), remote('r2', 'DUP'), remote('r3', 'DUP'), remote('new-id', 'MATCH')]
  });
  const codes = result.conflicts.map((item) => item.code);
  for (const code of ['local_sku_blank', 'local_sku_duplicate', 'pancake_sku_blank', 'pancake_sku_duplicate', 'pancake_match_missing', 'external_id_mismatch']) {
    assert.ok(codes.includes(code), code);
  }
  assert.equal(result.summary.conflictCount, result.conflicts.length);
});

test('price unit requires three unanimous comparisons', () => {
  const { evaluatePriceUnit } = require('../src/integrations/pancake/pancakeCatalogMapper');
  const cents = [1, 2, 3].map((id) => ({ localPriceCents: 64900, retailPriceRaw: 64900, id }));
  const pesos = [1, 2, 3].map((id) => ({ localPriceCents: 64900, retailPriceRaw: 649, id }));
  assert.deepEqual(evaluatePriceUnit(cents), { status: 'confirmed_centavos', comparedCount: 3, centavoMatches: 3, pesoMatches: 0, mismatchCount: 0 });
  assert.equal(evaluatePriceUnit(pesos).status, 'confirmed_pesos');
  assert.equal(evaluatePriceUnit(cents.slice(0, 2)).status, 'ambiguous');
  assert.equal(evaluatePriceUnit([cents[0], pesos[1], { localPriceCents: 65000, retailPriceRaw: 1 }]).status, 'ambiguous');
});
