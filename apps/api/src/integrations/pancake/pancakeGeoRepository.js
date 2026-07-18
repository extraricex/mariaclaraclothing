const crypto = require('node:crypto');

const { hasDatabaseUrl, query } = require('../../db/postgres');

const memory = { mappings: [] };

function resetMemoryForTests() {
  memory.mappings = [];
}

function iso(value) {
  return value ? new Date(value).toISOString() : '';
}

function publicMapping(row) {
  if (!row) return null;
  return {
    id: row.id,
    websiteLocationType: row.website_location_type || row.websiteLocationType,
    websiteCode: row.website_code || row.websiteCode || '',
    websiteName: row.website_name || row.websiteName || '',
    websiteNameNormalized: row.website_name_normalized || row.websiteNameNormalized || '',
    websiteParentCode: row.website_parent_code || row.websiteParentCode || '',
    pancakeLocationType: row.pancake_location_type || row.pancakeLocationType,
    pancakeId: row.pancake_id || row.pancakeId || '',
    pancakeCode: row.pancake_code || row.pancakeCode || '',
    pancakeName: row.pancake_name || row.pancakeName || '',
    pancakeParentId: row.pancake_parent_id || row.pancakeParentId || '',
    matchMethod: row.match_method || row.matchMethod || '',
    verificationStatus: row.verification_status || row.verificationStatus || '',
    verifiedAt: iso(row.verified_at || row.verifiedAt),
    createdAt: iso(row.created_at || row.createdAt),
    updatedAt: iso(row.updated_at || row.updatedAt)
  };
}

function sameWebsiteLocation(item, input) {
  return item.websiteLocationType === input.websiteLocationType
    && item.websiteCode === input.websiteCode
    && item.websiteParentCode === input.websiteParentCode;
}

async function findVerifiedMapping(input = {}) {
  const lookup = {
    websiteLocationType: String(input.websiteLocationType || '').trim(),
    websiteCode: String(input.websiteCode || '').trim(),
    websiteParentCode: String(input.websiteParentCode || '').trim(),
    pancakeParentId: String(input.pancakeParentId || '').trim()
  };
  if (!lookup.websiteLocationType || !lookup.websiteCode) return null;
  if (!hasDatabaseUrl()) {
    const row = memory.mappings.find((item) => sameWebsiteLocation(item, lookup)
      && ['auto_matched', 'manually_verified'].includes(item.verificationStatus)
      && (!lookup.pancakeParentId || item.pancakeParentId === lookup.pancakeParentId));
    return row ? { ...row } : null;
  }
  const result = await query(
    `SELECT * FROM pancake_geo_mappings
     WHERE website_location_type=$1 AND website_code=$2 AND website_parent_code=$3
       AND verification_status IN ('auto_matched','manually_verified')
       AND ($4='' OR pancake_parent_id=$4)
     LIMIT 1`,
    [lookup.websiteLocationType, lookup.websiteCode, lookup.websiteParentCode, lookup.pancakeParentId]
  );
  return publicMapping(result.rows[0]);
}

async function saveMapping(input = {}) {
  const now = new Date().toISOString();
  const mapping = {
    id: String(input.id || crypto.randomUUID()),
    websiteLocationType: String(input.websiteLocationType || '').trim(),
    websiteCode: String(input.websiteCode || '').trim(),
    websiteName: String(input.websiteName || '').trim(),
    websiteNameNormalized: String(input.websiteNameNormalized || '').trim(),
    websiteParentCode: String(input.websiteParentCode || '').trim(),
    pancakeLocationType: String(input.pancakeLocationType || '').trim(),
    pancakeId: String(input.pancakeId || '').trim(),
    pancakeCode: String(input.pancakeCode || '').trim(),
    pancakeName: String(input.pancakeName || '').trim(),
    pancakeParentId: String(input.pancakeParentId || '').trim(),
    matchMethod: String(input.matchMethod || 'exact_name').trim(),
    verificationStatus: String(input.verificationStatus || 'auto_matched').trim(),
    verifiedAt: input.verifiedAt || (['auto_matched', 'manually_verified'].includes(input.verificationStatus) ? now : ''),
    createdAt: now,
    updatedAt: now
  };
  if (!mapping.websiteLocationType || !mapping.websiteCode || !mapping.websiteName
    || !mapping.websiteNameNormalized || !mapping.pancakeLocationType) return null;

  if (!hasDatabaseUrl()) {
    const existing = memory.mappings.find((item) => sameWebsiteLocation(item, mapping));
    if (existing) Object.assign(existing, mapping, { id: existing.id, createdAt: existing.createdAt, updatedAt: now });
    else memory.mappings.push(mapping);
    return { ...(existing || mapping) };
  }
  const result = await query(
    `INSERT INTO pancake_geo_mappings (
       id,website_location_type,website_code,website_name,website_name_normalized,
       website_parent_code,pancake_location_type,pancake_id,pancake_code,pancake_name,
       pancake_parent_id,match_method,verification_status,verified_at,created_at,updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now())
     ON CONFLICT (website_location_type,website_code,website_parent_code) DO UPDATE SET
       website_name=EXCLUDED.website_name,
       website_name_normalized=EXCLUDED.website_name_normalized,
       pancake_location_type=EXCLUDED.pancake_location_type,
       pancake_id=EXCLUDED.pancake_id,
       pancake_code=EXCLUDED.pancake_code,
       pancake_name=EXCLUDED.pancake_name,
       pancake_parent_id=EXCLUDED.pancake_parent_id,
       match_method=EXCLUDED.match_method,
       verification_status=EXCLUDED.verification_status,
       verified_at=EXCLUDED.verified_at,
       updated_at=now()
     RETURNING *`,
    [
      mapping.id, mapping.websiteLocationType, mapping.websiteCode, mapping.websiteName,
      mapping.websiteNameNormalized, mapping.websiteParentCode, mapping.pancakeLocationType,
      mapping.pancakeId, mapping.pancakeCode, mapping.pancakeName, mapping.pancakeParentId,
      mapping.matchMethod, mapping.verificationStatus, mapping.verifiedAt || null
    ]
  );
  return publicMapping(result.rows[0]);
}

async function listMappings({ status = '', limit = 200 } = {}) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  const normalizedStatus = String(status || '').trim();
  if (!hasDatabaseUrl()) {
    return memory.mappings
      .filter((item) => !normalizedStatus || item.verificationStatus === normalizedStatus)
      .slice().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, safeLimit)
      .map((item) => ({ ...item }));
  }
  const result = await query(
    `SELECT * FROM pancake_geo_mappings
     WHERE ($1='' OR verification_status=$1)
     ORDER BY updated_at DESC LIMIT $2`,
    [normalizedStatus, safeLimit]
  );
  return result.rows.map(publicMapping);
}

module.exports = {
  findVerifiedMapping,
  listMappings,
  resetMemoryForTests,
  saveMapping
};
