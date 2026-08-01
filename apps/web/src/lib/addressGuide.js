import { fetchWithRecovery } from './network.js';

const JNT_ADDRESS_DATA_URL = '/data/jnt-address-guide.json';

const FALLBACK_PROVINCES = [{ code: 'CAVITE', name: 'CAVITE', islandGroup: 'Luzon' }];
const FALLBACK_CITIES = {
  CAVITE: [{ code: 'CAVITE|IMUS', name: 'IMUS', provinceCode: 'CAVITE' }]
};
const FALLBACK_BARANGAYS = {
  'CAVITE|IMUS': [{ code: 'CAVITE|IMUS|BUCANDALA IV', name: 'BUCANDALA IV', cityCode: 'CAVITE|IMUS', doorToDoor: 'YES' }]
};

let guidePromise = null;

export function canonicalAddressName(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ');
}

export function dedupeAddressItems(items = []) {
  const unique = new Map();
  for (const item of items) {
    const key = canonicalAddressName(item.name);
    if (!key) continue;
    const current = unique.get(key);
    const itemUsesCanonicalSpacing = String(item.name || '').trim().toUpperCase() === key;
    const currentUsesCanonicalSpacing = String(current?.name || '').trim().toUpperCase() === key;
    if (!current || (itemUsesCanonicalSpacing && !currentUsesCanonicalSpacing)) unique.set(key, item);
  }
  return [...unique.values()];
}

function normalizeItems(payload) {
  const items = Array.isArray(payload) ? payload : payload?.data;
  const normalized = Array.isArray(items) ? items.map((item) => ({
    code: String(item.code || item.id || '').trim().toUpperCase(),
    name: String(item.name || '').trim().toUpperCase(),
    provinceCode: String(item.provinceCode || item.province_code || '').trim().toUpperCase(),
    islandGroup: String(item.island_group || item.islandRegion || item.island_region || ''),
    cityCode: String(item.cityCode || item.city_code || '').trim().toUpperCase(),
    doorToDoor: String(item.doorToDoor || item.door_to_door || item.canDeliverDoorToDoor || '').trim().toUpperCase()
  })).filter((item) => item.code && item.name) : [];
  return dedupeAddressItems(normalized);
}

function loadGuide() {
  if (!guidePromise) {
    guidePromise = fetchWithRecovery(JNT_ADDRESS_DATA_URL).then((response) => {
      if (!response.ok) throw new Error('Could not load J&T checkout address guide.');
      return response.json();
    });
  }
  return guidePromise;
}

export async function loadProvinces() {
  try {
    const guide = await loadGuide();
    return normalizeItems(guide.provinces).sort((a, b) => a.name.localeCompare(b.name));
  } catch (_error) {
    guidePromise = null;
    return FALLBACK_PROVINCES;
  }
}

export async function loadCities(provinceCode) {
  if (!provinceCode) return [];
  try {
    const guide = await loadGuide();
    const cities = normalizeItems(guide.cities?.[provinceCode] || []);
    return cities.length ? cities.sort((a, b) => a.name.localeCompare(b.name)) : FALLBACK_CITIES[provinceCode] || [];
  } catch (_error) {
    return FALLBACK_CITIES[provinceCode] || [];
  }
}

export async function loadBarangays(cityCode) {
  if (!cityCode) return [];
  try {
    const guide = await loadGuide();
    const barangays = normalizeItems(guide.barangays?.[cityCode] || []);
    return barangays.length ? barangays.sort((a, b) => a.name.localeCompare(b.name)) : FALLBACK_BARANGAYS[cityCode] || [];
  } catch (_error) {
    return FALLBACK_BARANGAYS[cityCode] || [];
  }
}

export function regionForProvince(province) {
  const provinceName = String(province?.name || '').toUpperCase();
  if (!province) return 'luzon';
  if (provinceName === 'CAVITE' || provinceName.includes('METRO MANILA')) return 'metro_manila_cavite';
  if (province.islandGroup === 'Visayas' || province.islandGroup === 'Mindanao') return 'visayas_mindanao';
  return 'luzon';
}

export function regionLabel(region) {
  if (region === 'metro_manila_cavite') return 'Metro Manila & Cavite Region';
  if (region === 'visayas_mindanao') return 'Visayas and Mindanao Region';
  return 'Luzon Region';
}

export function feeForRegion(region) {
  if (region === 'metro_manila_cavite') return 8000;
  if (region === 'visayas_mindanao') return 18000;
  return 12000;
}

export function deliveryEstimate(region) {
  if (region === 'metro_manila_cavite') return 'Estimated delivery: Metro Manila and Cavite 2-4 days.';
  if (region === 'visayas_mindanao') return 'Estimated delivery: Visayas and Mindanao 5-8 days.';
  if (region === 'luzon') return 'Estimated delivery: Luzon provinces 3-6 days.';
  return 'Complete your address to see estimated delivery time.';
}
