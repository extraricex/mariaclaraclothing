import fs from 'node:fs';
import path from 'node:path';

const sourceDir = process.argv[2] || '/private/tmp/psgc-dumps';
const outputPath = process.argv[3] || path.join('public', 'data', 'philippines-addresses.json');
const METRO_MANILA_CODE = '1300000000';
const SPECIAL_AREA_PREFIX = 'area:';

function readDump(name) {
  const filePath = path.join(sourceDir, `${name}.json`);
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(payload) ? payload : payload.data;
}

function cleanItem(item) {
  return Object.fromEntries(
    Object.entries(item).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function sortByName(items) {
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

function islandGroupForRegion(regionCode) {
  const prefix = String(regionCode || '').slice(0, 2);
  if (['06', '07', '08', '18'].includes(prefix)) return 'Visayas';
  if (['09', '10', '11', '12', '16', '19'].includes(prefix)) return 'Mindanao';
  return 'Luzon';
}

function areaCodeForCity(city) {
  if (city.province_code) return city.province_code;
  if (city.region_code === METRO_MANILA_CODE) return METRO_MANILA_CODE;
  return `${SPECIAL_AREA_PREFIX}${city.code}`;
}

const provinces = readDump('provinces').map((province) => cleanItem({
  code: String(province.code),
  name: String(province.name),
  regionCode: String(province.region_code),
  islandGroup: islandGroupForRegion(province.region_code),
  type: 'province'
}));

const cities = readDump('cities').map((city) => cleanItem({
  code: String(city.code),
  name: String(city.name),
  provinceCode: city.province_code ? String(city.province_code) : '',
  regionCode: String(city.region_code),
  areaCode: areaCodeForCity(city),
  type: 'city_municipality'
}));

const barangays = readDump('barangays').map((barangay) => cleanItem({
  code: String(barangay.code),
  name: String(barangay.name),
  cityCode: String(barangay.city_code),
  provinceCode: barangay.province_code ? String(barangay.province_code) : '',
  regionCode: String(barangay.region_code)
}));

const deliveryAreas = [
  {
    code: METRO_MANILA_CODE,
    name: 'Metro Manila',
    regionCode: METRO_MANILA_CODE,
    islandGroup: 'NCR',
    type: 'region'
  },
  ...provinces
];

cities
  .filter((city) => !city.provinceCode && city.regionCode !== METRO_MANILA_CODE)
  .forEach((city) => {
    deliveryAreas.push({
      code: city.areaCode,
      name: city.name,
      regionCode: city.regionCode,
      islandGroup: islandGroupForRegion(city.regionCode),
      type: 'independent_city_area'
    });
  });

const citiesByArea = {};
cities.forEach((city) => {
  if (!citiesByArea[city.areaCode]) citiesByArea[city.areaCode] = [];
  citiesByArea[city.areaCode].push(city);
});
Object.keys(citiesByArea).forEach((areaCode) => {
  citiesByArea[areaCode] = sortByName(citiesByArea[areaCode]);
});

const barangaysByCity = {};
barangays.forEach((barangay) => {
  if (!barangaysByCity[barangay.cityCode]) barangaysByCity[barangay.cityCode] = [];
  barangaysByCity[barangay.cityCode].push(barangay);
});
Object.keys(barangaysByCity).forEach((cityCode) => {
  barangaysByCity[cityCode] = sortByName(barangaysByCity[cityCode]);
});

const output = {
  metadata: {
    source: 'PSGC-derived dumps from https://barangays.sanchez.ph/downloads',
    sourceBasis: 'Philippine Standard Geographic Code',
    generatedAt: new Date().toISOString().slice(0, 10),
    provinceCount: provinces.length,
    deliveryAreaCount: deliveryAreas.length,
    cityMunicipalityCount: cities.length,
    barangayCount: barangays.length
  },
  provinces: sortByName(deliveryAreas),
  cities: citiesByArea,
  barangays: barangaysByCity
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${outputPath}`);
console.log(output.metadata);
