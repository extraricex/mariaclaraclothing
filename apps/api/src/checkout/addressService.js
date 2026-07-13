const guide = require('../../public/data/jnt-address-guide.json');
const { CommerceError } = require('./commerceError');

const VISAYAS_MINDANAO = new Set([
  'AGUSAN-DEL-NORTE',
  'AGUSAN-DEL-SUR',
  'AKLAN',
  'ANTIQUE',
  'BASILAN',
  'BILIRAN',
  'BOHOL',
  'BUKIDNON',
  'CAMIGUIN',
  'CAPIZ',
  'CEBU',
  'COTABATO',
  'DAVAO-DE-ORO',
  'DAVAO-DEL-NORTE',
  'DAVAO-DEL-SUR',
  'DAVAO-OCCIDENTAL',
  'DAVAO-ORIENTAL',
  'DINAGAT-ISLANDS',
  'EASTERN-SAMAR',
  'GUIMARAS',
  'ILOILO',
  'LANAO-DEL-NORTE',
  'LANAO-DEL-SUR',
  'LEYTE',
  'MAGUINDANAO',
  'MISAMIS-OCCIDENTAL',
  'MISAMIS-ORIENTAL',
  'NEGROS-OCCIDENTAL',
  'NEGROS-ORIENTAL',
  'NORTHERN-SAMAR',
  'SARANGANI',
  'SIQUIJOR',
  'SOUTH-COTABATO',
  'SOUTHERN-LEYTE',
  'SULTAN-KUDARAT',
  'SULU',
  'SURIGAO-DEL-NORTE',
  'SURIGAO-DEL-SUR',
  'TAWI-TAWI',
  'WESTERN-SAMAR',
  'ZAMBOANGA-DEL-NORTE',
  'ZAMBOANGA-DEL-SUR',
  'ZAMBOANGA-SIBUGAY'
]);

const provinceByCode = new Map(
  guide.provinces.map((province) => [normalizeCode(province.code), province])
);
const cityByCode = new Map(
  Object.values(guide.cities).flat().map((city) => [normalizeCode(city.code), city])
);
const barangayByCode = new Map(
  Object.values(guide.barangays).flat().map((barangay) => [normalizeCode(barangay.code), barangay])
);

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function invalidAddress(level, message) {
  throw new CommerceError(message, {
    code: 'address_invalid',
    status: 400,
    details: { level }
  });
}

function shippingRegionForProvince(code) {
  if (code === 'CAVITE' || code === 'METRO-MANILA') return 'metro_manila_cavite';
  return VISAYAS_MINDANAO.has(code) ? 'visayas_mindanao' : 'luzon';
}

function resolveCheckoutAddress(input = {}) {
  const houseAddress = String(input.houseAddress || '').trim();
  if (!houseAddress) invalidAddress('houseAddress', 'House address is required.');
  const postalCode = String(input.postalCode || '').trim();
  if (postalCode && !/^\d{4}$/.test(postalCode)) invalidAddress('postalCode', 'ZIP code must contain 4 digits.');

  const provinceCode = normalizeCode(input.provinceCode);
  const province = provinceByCode.get(provinceCode);
  if (!province) invalidAddress('province', 'Province is invalid.');

  const cityCode = normalizeCode(input.cityCode);
  const city = cityByCode.get(cityCode);
  if (!city || normalizeCode(city.provinceCode) !== provinceCode) {
    invalidAddress('city', 'City or municipality is invalid for the selected province.');
  }

  const barangayCode = normalizeCode(input.barangayCode);
  const barangay = barangayByCode.get(barangayCode);
  if (!barangay || normalizeCode(barangay.cityCode) !== cityCode) {
    invalidAddress('barangay', 'Barangay is invalid for the selected city or municipality.');
  }

  const provinceName = String(province.name || '').trim();
  const cityName = String(city.name || '').trim();
  const barangayName = String(barangay.name || '').trim();
  const doorToDoorValue = barangay.doorToDoor || guide.doorToDoor?.[barangayCode];

  return {
    houseAddress,
    provinceCode,
    province: provinceName,
    cityCode,
    city: cityName,
    barangayCode,
    barangay: barangayName,
    postalCode,
    addressLine: `${houseAddress}, ${barangayName}, ${cityName}, ${provinceName}${postalCode ? ` ${postalCode}` : ''}, Philippines`,
    doorToDoor: normalizeCode(doorToDoorValue) === 'YES',
    shippingRegion: shippingRegionForProvince(provinceCode),
    datasetVersion: String(guide.metadata?.generatedAt || '')
  };
}

module.exports = { resolveCheckoutAddress, shippingRegionForProvince };
