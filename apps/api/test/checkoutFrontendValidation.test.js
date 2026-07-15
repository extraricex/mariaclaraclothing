const test = require('node:test');
const assert = require('node:assert/strict');

async function validationModule() {
  return import('../../web/src/lib/checkoutValidation.js');
}

test('customer checkout exposes exact field errors and keeps ZIP optional', async () => {
  const { checkoutDetailsErrors, CHECKOUT_FIELD_MESSAGES } = await validationModule();
  const errors = checkoutDetailsErrors({}, {}, { requireAddressCodes: true });
  assert.deepEqual(errors, {
    firstName: CHECKOUT_FIELD_MESSAGES.firstName,
    lastName: CHECKOUT_FIELD_MESSAGES.lastName,
    phone: CHECKOUT_FIELD_MESSAGES.phone,
    house: CHECKOUT_FIELD_MESSAGES.house,
    province: CHECKOUT_FIELD_MESSAGES.province,
    city: CHECKOUT_FIELD_MESSAGES.city,
    barangay: CHECKOUT_FIELD_MESSAGES.barangay
  });
  assert.equal(Object.hasOwn(errors, 'postalCode'), false);
});

test('customer checkout normalizes phone/address and validates address codes for Review access', async () => {
  const { normalizedCheckoutDetails } = await validationModule();
  const result = normalizedCheckoutDetails({
    firstName: 'Maria', lastName: 'Buyer', phone: '63 917 123 4567', email: ''
  }, {
    houseAddress: '12 Test', provinceCode: 'CAVITE', province: 'CAVITE',
    cityCode: 'CAVITE|IMUS', city: 'IMUS',
    barangayCode: 'CAVITE|IMUS|BUCANDALA IV', barangay: 'BUCANDALA IV', postalCode: ''
  }, { requireAddressCodes: true });
  assert.equal(result.valid, true);
  assert.equal(result.customer.phone, '09171234567');
  assert.equal(result.address.formattedFullAddress, '12 Test, BUCANDALA IV, IMUS, CAVITE, Philippines');

  const directReviewBypass = normalizedCheckoutDetails(result.customer, {
    ...result.address, barangayCode: ''
  }, { requireAddressCodes: true });
  assert.equal(directReviewBypass.valid, false);
  assert.equal(directReviewBypass.errors.barangay, 'Please select or enter your barangay.');
});

