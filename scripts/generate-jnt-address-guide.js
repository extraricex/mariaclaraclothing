const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'data', 'jnt', 'jntexportfile.xlsx');
const outputPath = path.join(root, 'public', 'data', 'jnt-address-guide.json');

function clean(value) {
  return String(value || '').trim().toUpperCase();
}

function key(parts) {
  return parts.map(clean).join('|');
}

function main() {
  const workbook = XLSX.readFile(sourcePath, { cellDates: false });
  const sheet = workbook.Sheets['Addressing guide'];
  if (!sheet) throw new Error('Addressing guide sheet is missing from J&T template.');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }).slice(1);
  const provinceMap = new Map();
  const cityMap = new Map();
  const barangayMap = new Map();
  const doorToDoor = {};

  rows.forEach((row) => {
    const province = clean(row[0]);
    const city = clean(row[1]);
    const barangay = clean(row[2]);
    const canDeliverDoorToDoor = clean(row[3]);
    if (!province || !city || !barangay) return;

    const provinceCode = province;
    const cityCode = key([province, city]);
    const barangayCode = key([province, city, barangay]);

    if (!provinceMap.has(provinceCode)) {
      provinceMap.set(provinceCode, { code: provinceCode, name: province });
    }
    if (!cityMap.has(provinceCode)) {
      cityMap.set(provinceCode, new Map());
    }
    cityMap.get(provinceCode).set(cityCode, {
      code: cityCode,
      name: city,
      provinceCode,
      areaCode: provinceCode
    });
    if (!barangayMap.has(cityCode)) {
      barangayMap.set(cityCode, new Map());
    }
    barangayMap.get(cityCode).set(barangayCode, {
      code: barangayCode,
      name: barangay,
      cityCode,
      provinceCode,
      doorToDoor: canDeliverDoorToDoor
    });
    doorToDoor[barangayCode] = canDeliverDoorToDoor;
  });

  const cities = Object.fromEntries(Array.from(cityMap.entries()).map(([provinceCode, citiesForProvince]) => [
    provinceCode,
    Array.from(citiesForProvince.values()).sort((a, b) => a.name.localeCompare(b.name))
  ]));
  const barangays = Object.fromEntries(Array.from(barangayMap.entries()).map(([cityCode, barangaysForCity]) => [
    cityCode,
    Array.from(barangaysForCity.values()).sort((a, b) => a.name.localeCompare(b.name))
  ]));

  const payload = {
    metadata: {
      source: 'data/jnt/jntexportfile.xlsx',
      sheet: 'Addressing guide',
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      provinceCount: provinceMap.size,
      cityMunicipalityCount: Array.from(cityMap.values()).reduce((sum, map) => sum + map.size, 0),
      barangayCount: Array.from(barangayMap.values()).reduce((sum, map) => sum + map.size, 0)
    },
    provinces: Array.from(provinceMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    cities,
    barangays,
    doorToDoor
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

main();
