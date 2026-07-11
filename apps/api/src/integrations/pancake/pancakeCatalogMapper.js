const crypto = require('node:crypto');

function normalizeSku(value) {
  return String(value || '').normalize('NFKC').trim().toUpperCase();
}

function groupBySku(records, getSku) {
  const groups = new Map();
  records.forEach((record) => {
    const sku = normalizeSku(getSku(record));
    groups.set(sku, [...(groups.get(sku) || []), record]);
  });
  return groups;
}

function conflict(code, entityType, entityId, context = {}) {
  return {
    code,
    entityType,
    entityId: String(entityId || ''),
    conflictKey: `${code}:${entityType}:${String(entityId || '')}`,
    severity: 'blocking',
    context
  };
}

function evaluatePriceUnit(verifiedMappings) {
  let centavoMatches = 0;
  let pesoMatches = 0;
  let mismatchCount = 0;
  (verifiedMappings || []).forEach((mapping) => {
    const local = Number(mapping.localPriceCents);
    const remote = Number(mapping.retailPriceRaw);
    if (!Number.isFinite(local) || !Number.isFinite(remote)) return;
    if (remote === local) centavoMatches += 1;
    else if (remote * 100 === local) pesoMatches += 1;
    else mismatchCount += 1;
  });
  const comparedCount = centavoMatches + pesoMatches + mismatchCount;
  let status = 'ambiguous';
  if (comparedCount >= 3 && mismatchCount === 0 && centavoMatches === comparedCount) status = 'confirmed_centavos';
  if (comparedCount >= 3 && mismatchCount === 0 && pesoMatches === comparedCount) status = 'confirmed_pesos';
  return { status, comparedCount, centavoMatches, pesoMatches, mismatchCount };
}

function mapCatalog({ localVariants = [], pancakeVariations = [], importId = '', now = new Date().toISOString() }) {
  const locals = localVariants.map((item) => ({ ...item }));
  const remotes = pancakeVariations.map((item) => ({ ...item, product: item.product ? { ...item.product } : {} }));
  const active = locals.filter((item) => !['draft', 'archived', 'inactive'].includes(String(item.status || '').toLowerCase()));
  const localGroups = groupBySku(active, (item) => item.sku);
  const remoteGroups = groupBySku(remotes, (item) => item.display_id || item.sku);
  const conflicts = [];
  const mappings = [];

  for (const item of remotes) {
    const sku = normalizeSku(item.display_id || item.sku);
    if (!sku) conflicts.push(conflict('pancake_sku_blank', 'pancake_variation', item.id));
  }
  for (const [sku, items] of remoteGroups) {
    if (sku && items.length > 1) conflicts.push(conflict('pancake_sku_duplicate', 'pancake_sku', sku, { count: items.length }));
  }

  for (const item of locals) {
    const normalizedSku = normalizeSku(item.sku);
    const inactive = ['draft', 'archived', 'inactive'].includes(String(item.status || '').toLowerCase());
    const base = {
      localVariantId: item.id,
      productSlug: String(item.productSlug || ''),
      localSku: String(item.sku || ''),
      normalizedSku,
      pancakeProductId: '',
      pancakeVariationId: '',
      status: inactive ? 'inactive' : 'missing',
      importId,
      verifiedAt: now,
      payloadDigest: ''
    };
    if (inactive) {
      mappings.push(base);
      continue;
    }
    if (!normalizedSku) {
      conflicts.push(conflict('local_sku_blank', 'local_variant', item.id));
      mappings.push(base);
      continue;
    }
    const localMatches = localGroups.get(normalizedSku) || [];
    if (localMatches.length > 1) {
      conflicts.push(conflict('local_sku_duplicate', 'local_sku', normalizedSku, { count: localMatches.length }));
      mappings.push({ ...base, status: 'duplicate_local' });
      continue;
    }
    const remoteMatches = remoteGroups.get(normalizedSku) || [];
    if (remoteMatches.length > 1) {
      mappings.push({ ...base, status: 'duplicate_pancake' });
      continue;
    }
    if (remoteMatches.length === 0) {
      conflicts.push(conflict('pancake_match_missing', 'local_variant', item.id, { sku: normalizedSku }));
      mappings.push(base);
      continue;
    }
    const remote = remoteMatches[0];
    const payloadDigest = crypto.createHash('sha256').update(JSON.stringify({
      id: remote.id, productId: remote.product_id, sku: normalizedSku,
      retailPrice: remote.retail_price, updatedAt: remote.updated_at
    })).digest('hex');
    const verified = {
      ...base,
      pancakeProductId: String(remote.product_id || ''),
      pancakeVariationId: String(remote.id || ''),
      status: 'verified',
      payloadDigest,
      localPriceCents: Number(item.priceCents ?? item.productPriceCents),
      retailPriceRaw: Number(remote.retail_price)
    };
    if (item.externalPosVariantId && String(item.externalPosVariantId) !== verified.pancakeVariationId) {
      conflicts.push(conflict('external_id_mismatch', 'local_variant', item.id, {
        storedId: String(item.externalPosVariantId), matchedId: verified.pancakeVariationId
      }));
    }
    mappings.push(verified);
  }

  const priceEvidence = evaluatePriceUnit(mappings.filter((item) => item.status === 'verified'));
  if (priceEvidence.mismatchCount > 0) {
    conflicts.push(conflict('price_mismatch', 'catalog_import', importId, { mismatchCount: priceEvidence.mismatchCount }));
  }
  const uniqueConflicts = [...new Map(conflicts.map((item) => [item.conflictKey, item])).values()];
  return {
    mappings,
    conflicts: uniqueConflicts,
    priceEvidence,
    summary: {
      localVariantCount: locals.length,
      pancakeVariationCount: remotes.length,
      verifiedCount: mappings.filter((item) => item.status === 'verified').length,
      conflictCount: uniqueConflicts.length
    }
  };
}

module.exports = { evaluatePriceUnit, mapCatalog, normalizeSku };
