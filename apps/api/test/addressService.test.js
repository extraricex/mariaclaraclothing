const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCheckoutAddress } = require('../src/checkout/addressService');

test('server resolves a valid J&T address and Cavite shipping region', () => {
  const result = resolveCheckoutAddress({
    houseAddress: ' 12 Test St ',
    provinceCode: 'CAVITE',
    cityCode: 'CAVITE|IMUS',
    barangayCode: 'CAVITE|IMUS|BUCANDALA IV',
    postalCode: '4103'
  });

  assert.equal(result.houseAddress, '12 Test St');
  assert.equal(result.province, 'CAVITE');
  assert.equal(result.provinceName, 'CAVITE');
  assert.equal(result.city, 'IMUS');
  assert.equal(result.cityName, 'IMUS');
  assert.equal(result.barangay, 'BUCANDALA IV');
  assert.equal(result.barangayName, 'BUCANDALA IV');
  assert.equal(result.provinceCode, 'CAVITE');
  assert.equal(result.cityCode, 'CAVITE|IMUS');
  assert.equal(result.barangayCode, 'CAVITE|IMUS|BUCANDALA IV');
  assert.equal(result.postalCode, '4103');
  assert.equal(result.addressLine, '12 Test St, BUCANDALA IV, IMUS, CAVITE, 4103, Philippines');
  assert.equal(result.shippingRegion, 'metro_manila_cavite');
  assert.equal(result.doorToDoor, true);
  assert.match(result.datasetVersion, /^2026-06-05/);
});

test('server assigns Cebu and Davao to Visayas and Mindanao', () => {
  assert.equal(resolveCheckoutAddress({
    houseAddress: '1 Test',
    provinceCode: 'CEBU',
    cityCode: 'CEBU|ALCOY',
    barangayCode: 'CEBU|ALCOY|ATABAY'
  }).shippingRegion, 'visayas_mindanao');

  assert.equal(resolveCheckoutAddress({
    houseAddress: '1 Test',
    provinceCode: 'DAVAO-DEL-SUR',
    cityCode: 'DAVAO-DEL-SUR|BANSALAN',
    barangayCode: 'DAVAO-DEL-SUR|BANSALAN|ALEGRE'
  }).shippingRegion, 'visayas_mindanao');
});

test('server assigns Abra to Luzon and Metro Manila to the Cavite region', () => {
  assert.equal(resolveCheckoutAddress({
    houseAddress: '1 Test',
    provinceCode: 'ABRA',
    cityCode: 'ABRA|ABRA-DOLORES',
    barangayCode: 'ABRA|ABRA-DOLORES|BAYAAN'
  }).shippingRegion, 'luzon');

  assert.equal(resolveCheckoutAddress({
    houseAddress: '1 Test',
    provinceCode: 'METRO-MANILA',
    cityCode: 'METRO-MANILA|BINONDO',
    barangayCode: 'METRO-MANILA|BINONDO|BARANGAY 287'
  }).shippingRegion, 'metro_manila_cavite');
});

test('server maps a non-door-to-door barangay', () => {
  const result = resolveCheckoutAddress({
    houseAddress: '1 Test',
    provinceCode: 'ANTIQUE',
    cityCode: 'ANTIQUE|CALUYA',
    barangayCode: 'ANTIQUE|CALUYA|ALEGRIA'
  });

  assert.equal(result.doorToDoor, false);
  assert.equal(result.postalCode, '');
  assert.equal(result.addressLine.includes('  '), false);
});

test('server rejects missing and mismatched address hierarchy levels', () => {
  const valid = {
    houseAddress: '12 Test St',
    provinceCode: 'CAVITE',
    cityCode: 'CAVITE|IMUS',
    barangayCode: 'CAVITE|IMUS|BUCANDALA IV'
  };

  assert.throws(
    () => resolveCheckoutAddress({ ...valid, houseAddress: ' ' }),
    (error) => error.code === 'address_invalid' && error.details.level === 'houseAddress'
  );
  assert.throws(
    () => resolveCheckoutAddress({ ...valid, provinceCode: 'UNKNOWN' }),
    (error) => error.code === 'address_invalid' && error.details.level === 'province'
  );
  assert.throws(
    () => resolveCheckoutAddress({
      ...valid,
      cityCode: 'CEBU|ALCOY',
      barangayCode: 'CEBU|ALCOY|ATABAY'
    }),
    (error) => error.code === 'address_invalid' && error.details.level === 'city'
  );
  assert.throws(
    () => resolveCheckoutAddress({ ...valid, barangayCode: 'CEBU|ALCOY|ATABAY' }),
    (error) => error.code === 'address_invalid' && error.details.level === 'barangay'
  );
  assert.throws(
    () => resolveCheckoutAddress({ ...valid, postalCode: '41A3' }),
    (error) => error.code === 'address_invalid' && error.details.level === 'postalCode'
  );
});
