const repositoryDefault = require('./pancakeGeoRepository');
const { canonicalDeliveryAddress } = require('../../checkout/deliveryDetails');

const PANCAKE_COUNTRY_CODE = '63';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

class PancakeGeoResolutionError extends Error {
  constructor(code, field, details = {}) {
    const labels = { province: 'Province', district: 'City or municipality', commune: 'Barangay' };
    const reason = code.endsWith('_ambiguous') ? 'matched more than one Pancake location' : 'could not be matched to Pancake';
    super(`${labels[field] || 'Address'} ${reason}.`);
    this.name = 'PancakeGeoResolutionError';
    this.code = code;
    this.field = field;
    this.status = 409;
    this.details = { field, ...details };
  }
}

function normalizeLocationName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function variants(value, { type = '', parentName = '' } = {}) {
  const normalized = normalizeLocationName(value);
  const results = new Set(normalized ? [normalized] : []);
  const add = (candidate) => {
    const text = normalizeLocationName(candidate);
    if (text) results.add(text);
  };
  if (!normalized) return results;

  add(normalized.replace(/^(province|city|municipality|barangay|brgy) of /, ''));
  add(normalized.replace(/^(barangay|brgy) /, ''));
  if (type === 'commune') {
    // The PSGC dataset uses the Filipino linker form "Daang Hari", while
    // Pancake currently returns "Daan Hari" for the same Taguig barangays.
    // Keep this exact-token alias scoped to the already-resolved district so
    // similarly named barangays in another city can never be selected.
    add(normalized.replace(/\bdaang\b/g, 'daan'));
    add(normalized.replace(/\bdaan\b/g, 'daang'));
  }
  if (type === 'district') {
    add(normalized.replace(/^city of /, '').replace(/ city$/, ''));
    add(normalized.replace(/^municipality of /, '').replace(/ municipality$/, ''));
    const parent = normalizeLocationName(parentName);
    if (parent && normalized.startsWith(`${parent} `)) add(normalized.slice(parent.length + 1));
  }
  if (type === 'province') {
    if (normalized === 'metro manila') add('metropolitan manila');
    if (normalized === 'metropolitan manila') add('metro manila');
    if (normalized === 'national capital region' || normalized === 'ncr') {
      add('metro manila');
      add('metropolitan manila');
    }
  }
  return results;
}

function recordNames(record = {}) {
  return [...new Set([record.name, record.nameEn].map(normalizeLocationName).filter(Boolean))];
}

function exactNameMatches(records, websiteName) {
  const expected = normalizeLocationName(websiteName);
  return records.filter((record) => recordNames(record).includes(expected));
}

function aliasMatches(records, websiteName, options) {
  const expected = variants(websiteName, options);
  return records.filter((record) => {
    const candidateVariants = new Set([
      ...variants(record.name, options),
      ...variants(record.nameEn, options)
    ]);
    return [...expected].some((value) => candidateVariants.has(value));
  });
}

async function cached(key, loader, { forceRefresh = false } = {}) {
  const existing = cache.get(key);
  if (!forceRefresh && existing && existing.expiresAt > Date.now()) return existing.value;
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

function websiteLocation({ type, code, name, parentCode = '', parentName = '' }) {
  return {
    websiteLocationType: type,
    websiteCode: String(code || '').trim(),
    websiteName: String(name || '').trim(),
    websiteNameNormalized: normalizeLocationName(name),
    websiteParentCode: String(parentCode || '').trim(),
    parentName: String(parentName || '').trim()
  };
}

function publicResolved(record, mapping, fallbackMethod = '') {
  return {
    id: String(record.id || mapping?.pancakeId || '').trim(),
    code: String(record.code || mapping?.pancakeCode || '').trim(),
    name: String(record.name || mapping?.pancakeName || '').trim(),
    matchMethod: mapping?.matchMethod || fallbackMethod,
    verificationStatus: mapping?.verificationStatus || 'auto_matched'
  };
}

async function persistFailure(repository, location, pancakeType, parentId, status) {
  await repository.saveMapping?.({
    ...location,
    pancakeLocationType: pancakeType,
    pancakeId: '',
    pancakeCode: '',
    pancakeName: '',
    pancakeParentId: parentId,
    matchMethod: 'exact_name',
    verificationStatus: status,
    verifiedAt: ''
  });
}

async function resolveLevel({
  records, location, pancakeType, parentId = '', repository, options = {}
}) {
  if (!location.websiteCode || !location.websiteName) {
    throw new PancakeGeoResolutionError(`pancake_${pancakeType}_not_found`, pancakeType, {
      reason: 'website_location_missing'
    });
  }
  const stored = await repository.findVerifiedMapping?.({
    ...location,
    pancakeParentId: parentId
  });
  if (stored?.pancakeId) {
    const current = records.find((record) => String(record.id) === stored.pancakeId);
    if (current) return publicResolved(current, { ...stored, matchMethod: 'stored_id' });
  }

  const codeMatches = records.filter((record) => [record.id, record.code]
    .map((value) => String(value || '').trim().toLowerCase())
    .includes(location.websiteCode.toLowerCase()));
  let matches = codeMatches;
  let matchMethod = 'exact_code';
  if (!matches.length) {
    matches = exactNameMatches(records, location.websiteName);
    matchMethod = 'exact_name';
  }
  if (!matches.length) {
    matches = aliasMatches(records, location.websiteName, {
      type: pancakeType,
      parentName: location.parentName,
      ...options
    });
    matchMethod = 'approved_alias';
  }
  if (matches.length !== 1) {
    const verificationStatus = matches.length ? 'ambiguous' : 'not_found';
    await persistFailure(repository, location, pancakeType, parentId, verificationStatus);
    throw new PancakeGeoResolutionError(
      `pancake_${pancakeType}_${matches.length ? 'ambiguous' : 'not_found'}`,
      pancakeType,
      { websiteCode: location.websiteCode, websiteName: location.websiteName, candidateCount: matches.length }
    );
  }

  const selected = matches[0];
  const saved = await repository.saveMapping?.({
    ...location,
    pancakeLocationType: pancakeType,
    pancakeId: selected.id,
    pancakeCode: selected.code,
    pancakeName: selected.name,
    pancakeParentId: parentId,
    matchMethod,
    verificationStatus: 'auto_matched',
    verifiedAt: new Date().toISOString()
  });
  return publicResolved(selected, saved, matchMethod);
}

async function resolvePancakeAddressOnce(addressInput = {}, {
  client,
  repository = repositoryDefault,
  forceRefresh = false
} = {}) {
  if (!client?.listProvinces || !client?.listDistricts || !client?.listCommunes) {
    const error = new PancakeGeoResolutionError('pancake_geo_client_unavailable', 'province');
    error.status = 503;
    throw error;
  }
  const address = canonicalDeliveryAddress(addressInput);
  const provinceLocation = websiteLocation({
    type: 'province', code: address.provinceCode, name: address.province
  });
  const provinces = await cached(
    `provinces:${PANCAKE_COUNTRY_CODE}`,
    () => client.listProvinces(PANCAKE_COUNTRY_CODE),
    { forceRefresh }
  );
  const province = await resolveLevel({
    records: provinces, location: provinceLocation, pancakeType: 'province', repository
  });

  const districtLocation = websiteLocation({
    type: 'city', code: address.cityCode, name: address.city,
    parentCode: address.provinceCode, parentName: address.province
  });
  const districts = await cached(
    `districts:${province.id}`,
    () => client.listDistricts(province.id),
    { forceRefresh }
  );
  const district = await resolveLevel({
    records: districts, location: districtLocation, pancakeType: 'district',
    parentId: province.id, repository
  });

  const communeLocation = websiteLocation({
    type: 'barangay', code: address.barangayCode, name: address.barangay,
    parentCode: address.cityCode, parentName: address.city
  });
  const communes = await cached(
    `communes:${province.id}:${district.id}`,
    () => client.listCommunes(province.id, district.id),
    { forceRefresh }
  );
  const commune = await resolveLevel({
    records: communes, location: communeLocation, pancakeType: 'commune',
    parentId: district.id, repository
  });

  return {
    countryCode: PANCAKE_COUNTRY_CODE,
    province,
    district,
    commune,
    mappingStatus: 'resolved',
    resolvedAt: new Date().toISOString()
  };
}

async function resolvePancakeAddress(addressInput = {}, options = {}) {
  try {
    return await resolvePancakeAddressOnce(addressInput, options);
  } catch (error) {
    // Pancake can add or rename geo records while a worker still holds its
    // 24-hour cache. Refresh once before blocking an otherwise valid order.
    // Ambiguous matches remain blocked and are never guessed.
    if (!options.forceRefresh && error instanceof PancakeGeoResolutionError
      && String(error.code || '').endsWith('_not_found')) {
      return resolvePancakeAddressOnce(addressInput, { ...options, forceRefresh: true });
    }
    throw error;
  }
}

async function saveManualPancakeAddressMapping(addressInput = {}, selection = {}, {
  client,
  repository = repositoryDefault
} = {}) {
  const address = canonicalDeliveryAddress(addressInput);
  const provinceId = String(selection.provinceId || '').trim();
  const districtId = String(selection.districtId || '').trim();
  const communeId = String(selection.communeId || '').trim();
  if (!provinceId || !districtId || !communeId) {
    throw new PancakeGeoResolutionError('pancake_manual_mapping_incomplete', 'province');
  }
  const provinces = await cached(
    `provinces:${PANCAKE_COUNTRY_CODE}`,
    () => client.listProvinces(PANCAKE_COUNTRY_CODE)
  );
  const province = provinces.find((item) => item.id === provinceId);
  const districts = province ? await cached(`districts:${provinceId}`, () => client.listDistricts(provinceId)) : [];
  const district = districts.find((item) => item.id === districtId && (!item.provinceId || item.provinceId === provinceId));
  const communes = province && district
    ? await cached(`communes:${provinceId}:${districtId}`, () => client.listCommunes(provinceId, districtId))
    : [];
  const commune = communes.find((item) => item.id === communeId
    && (!item.provinceId || item.provinceId === provinceId)
    && (!item.districtId || item.districtId === districtId));
  if (!province || !district || !commune) {
    throw new PancakeGeoResolutionError('pancake_manual_mapping_invalid_hierarchy', 'commune');
  }

  const save = (location, pancakeLocationType, item, pancakeParentId = '') => repository.saveMapping({
    ...location,
    pancakeLocationType,
    pancakeId: item.id,
    pancakeCode: item.code,
    pancakeName: item.name,
    pancakeParentId,
    matchMethod: 'manual',
    verificationStatus: 'manually_verified',
    verifiedAt: new Date().toISOString()
  });
  await save(websiteLocation({
    type: 'province', code: address.provinceCode, name: address.province
  }), 'province', province);
  await save(websiteLocation({
    type: 'city', code: address.cityCode, name: address.city,
    parentCode: address.provinceCode, parentName: address.province
  }), 'district', district, province.id);
  await save(websiteLocation({
    type: 'barangay', code: address.barangayCode, name: address.barangay,
    parentCode: address.cityCode, parentName: address.city
  }), 'commune', commune, district.id);

  return {
    countryCode: PANCAKE_COUNTRY_CODE,
    province: publicResolved(province, { matchMethod: 'manual', verificationStatus: 'manually_verified' }),
    district: publicResolved(district, { matchMethod: 'manual', verificationStatus: 'manually_verified' }),
    commune: publicResolved(commune, { matchMethod: 'manual', verificationStatus: 'manually_verified' }),
    mappingStatus: 'resolved',
    resolvedAt: new Date().toISOString()
  };
}

async function listPancakeAddressOptions(selection = {}, { client } = {}) {
  const provinceId = String(selection.provinceId || '').trim();
  const districtId = String(selection.districtId || '').trim();
  const provinces = await cached(
    `provinces:${PANCAKE_COUNTRY_CODE}`,
    () => client.listProvinces(PANCAKE_COUNTRY_CODE)
  );
  const districts = provinceId
    ? await cached(`districts:${provinceId}`, () => client.listDistricts(provinceId))
    : [];
  const communes = provinceId && districtId
    ? await cached(`communes:${provinceId}:${districtId}`, () => client.listCommunes(provinceId, districtId))
    : [];
  return { provinces, districts, communes };
}

function clearGeoCacheForTests() {
  cache.clear();
}

module.exports = {
  PANCAKE_COUNTRY_CODE,
  PancakeGeoResolutionError,
  clearGeoCacheForTests,
  normalizeLocationName,
  listPancakeAddressOptions,
  resolvePancakeAddress,
  saveManualPancakeAddressMapping,
  variants
};
