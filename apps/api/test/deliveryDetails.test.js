const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canonicalDeliveryAddress,
  deliveryInformationIssues,
  formatDeliveryAddress,
  normalizePhilippineMobile,
  requireCompleteDeliveryInformation
} = require('../src/checkout/deliveryDetails');

function validInput(overrides = {}) {
  return {
    customer: {
      firstName: ' Maria ', lastName: ' Buyer ', phone: '+63 917-123-4567', email: ''
    },
    address: {
      houseAddress: ' 12 Test Street ', barangay: ' Bucandala IV ', city: ' Imus ',
      province: ' Cavite ', postalCode: ''
    },
    ...overrides
  };
}

test('Philippine mobile formats normalize to one saved 09 format', () => {
  assert.equal(normalizePhilippineMobile('09171234567'), '09171234567');
  assert.equal(normalizePhilippineMobile('+63 917-123-4567'), '09171234567');
  assert.equal(normalizePhilippineMobile('639171234567'), '09171234567');
  assert.equal(normalizePhilippineMobile('0917 123 4567'), '09171234567');
  assert.equal(normalizePhilippineMobile('0917ABC4567'), '');
  assert.equal(normalizePhilippineMobile('09999999999'), '');
});

test('complete delivery data is normalized and ZIP remains optional', () => {
  const result = requireCompleteDeliveryInformation(validInput());
  assert.deepEqual(result.customer, {
    firstName: 'Maria', lastName: 'Buyer', fullName: 'Maria Buyer', phone: '09171234567', email: ''
  });
  assert.equal(result.address.houseAddress, '12 Test Street');
  assert.equal(result.address.addressLine1, '12 Test Street');
  assert.equal(result.address.postalCode, '');
  assert.equal(result.address.addressLine, '12 Test Street, Bucandala IV, Imus, Cavite, Philippines');
  assert.equal(result.address.formattedFullAddress, result.address.addressLine);
  assert.equal(result.address.barangayName, 'Bucandala IV');
  assert.equal(result.address.cityName, 'Imus');
  assert.equal(result.address.provinceName, 'Cavite');
});

test('canonical address accepts integration aliases without saving codes as readable names', () => {
  const address = canonicalDeliveryAddress({
    address_line_1: '123 Sample Street',
    commune_name: 'Bucandala IV',
    district_name: 'Imus City',
    province_name: 'Cavite',
    post_code: '4103'
  });
  assert.equal(address.houseAddress, '123 Sample Street');
  assert.equal(address.barangay, 'Bucandala IV');
  assert.equal(address.city, 'Imus City');
  assert.equal(address.province, 'Cavite');
  assert.equal(address.formattedFullAddress, '123 Sample Street, Bucandala IV, Imus City, Cavite 4103, Philippines');
});

test('whitespace, null literals, and missing structured address fields are rejected together', () => {
  assert.throws(
    () => requireCompleteDeliveryInformation({
      customer: { firstName: ' ', lastName: 'null', phone: '   ' },
      address: { houseAddress: '\t', barangay: 'undefined', city: '', province: 'select province' }
    }),
    (error) => {
      assert.equal(error.code, 'INCOMPLETE_DELIVERY_ADDRESS');
      assert.equal(error.status, 422);
      assert.deepEqual(Object.keys(error.details.fields), [
        'firstName', 'lastName', 'phone', 'street', 'barangay', 'city', 'province'
      ]);
      return true;
    }
  );
});

test('new checkout rejects a legacy fullName when explicit first and last names are missing', () => {
  const input = validInput();
  input.customer = { fullName: 'Maria Buyer', phone: '09171234567' };
  assert.throws(
    () => requireCompleteDeliveryInformation(input),
    (error) => error.code === 'INCOMPLETE_DELIVERY_ADDRESS'
      && Boolean(error.details.fields.firstName)
      && Boolean(error.details.fields.lastName)
  );
});

test('invalid optional email and ZIP are rejected without inventing address text', () => {
  const input = validInput();
  input.customer.email = 'not-an-email';
  input.address.postalCode = '41A3';
  const issues = deliveryInformationIssues(input);
  assert.equal(issues.email, 'Email address is invalid.');
  assert.equal(issues.postalCode, 'ZIP code must contain 4 digits when supplied.');
  assert.equal(formatDeliveryAddress({}), '');
  assert.equal(formatDeliveryAddress({
    houseAddress: '12 Test', barangay: 'Bucandala IV', city: 'Imus', province: 'Cavite', postalCode: '4103'
  }), '12 Test, Bucandala IV, Imus, Cavite 4103, Philippines');
});

test('legacy direct-order normalization rejects an address bypass before cart work', async () => {
  const { normalizeCheckout } = require('../src/routes/orders');
  await assert.rejects(
    normalizeCheckout({
      customer: { firstName: 'Maria', lastName: 'Buyer', phone: '09171234567' },
      address: { addressLine: 'client supplied text', houseAddress: ' ', barangay: ' ', city: ' ', province: ' ' },
      items: []
    }),
    (error) => error.code === 'INCOMPLETE_DELIVERY_ADDRESS'
      && Boolean(error.details.fields.street)
      && Boolean(error.details.fields.barangay)
      && Boolean(error.details.fields.city)
      && Boolean(error.details.fields.province)
  );
});
