const { CommerceError } = require('./commerceError');
const { normalizeCustomerName } = require('../customers/customerName');

const EMPTY_LITERALS = new Set([
  'undefined',
  'null',
  'none',
  'n/a',
  'na',
  'select province',
  'select city',
  'select municipality',
  'select barangay'
]);

const FIELD_MESSAGES = Object.freeze({
  firstName: 'First name is required.',
  lastName: 'Last name is required.',
  phone: 'A valid Philippine mobile number is required.',
  email: 'Email address is invalid.',
  street: 'House number and street are required.',
  barangay: 'Barangay is required.',
  city: 'City or municipality is required.',
  province: 'Province is required.',
  postalCode: 'ZIP code must contain 4 digits when supplied.'
});

function cleanText(value) {
  const text = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  return EMPTY_LITERALS.has(text.toLowerCase()) ? '' : text;
}

function normalizePhilippineMobile(value) {
  const compact = cleanText(value).replace(/[\s()\-]/g, '');
  let normalized = '';
  if (/^09\d{9}$/.test(compact)) normalized = compact;
  if (/^\+639\d{9}$/.test(compact)) normalized = `0${compact.slice(3)}`;
  if (/^639\d{9}$/.test(compact)) normalized = `0${compact.slice(2)}`;
  if (!normalized) return '';

  // Obvious placeholders such as 09000000000 and 09999999999 are not
  // usable contact numbers. Real subscribers have more than one digit in
  // the nine-digit subscriber portion.
  if (new Set(normalized.slice(2)).size === 1) return '';
  return normalized;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function customerFields(customer = {}, options = {}) {
  const name = normalizeCustomerName(customer);
  const requireExplicitNameParts = Boolean(options.requireExplicitNameParts);
  const firstName = cleanText(requireExplicitNameParts
    ? (customer.firstName ?? customer.first_name)
    : name.firstName);
  const lastName = cleanText(requireExplicitNameParts
    ? (customer.lastName ?? customer.last_name)
    : name.lastName);
  const phone = normalizePhilippineMobile(customer.phone);
  const email = cleanText(customer.email).toLowerCase();
  const fields = {};
  if (!firstName) fields.firstName = FIELD_MESSAGES.firstName;
  if (!lastName) fields.lastName = FIELD_MESSAGES.lastName;
  if (!phone) fields.phone = FIELD_MESSAGES.phone;
  if (email && !validEmail(email)) fields.email = FIELD_MESSAGES.email;
  return {
    fields,
    customer: {
      firstName,
      lastName,
      fullName: [firstName, lastName].filter(Boolean).join(' '),
      phone,
      email
    }
  };
}

function addressFields(address = {}) {
  const houseAddress = cleanText(
    address.houseAddress || address.addressLine1 || address.address_line_1 || address.street
  );
  const barangay = cleanText(
    address.barangay || address.barangayName || address.barangay_name
      || address.commune_name || address.commnue_name || address.ward
  );
  const city = cleanText(
    address.city || address.cityName || address.city_name || address.municipality
      || address.district_name || address.district
  );
  const province = cleanText(
    address.province || address.provinceName || address.province_name || address.region
  );
  const postalCode = cleanText(
    address.postalCode || address.postal_code || address.zipCode || address.zip_code || address.post_code
  );
  const barangayCode = cleanText(address.barangayCode || address.barangay_code);
  const cityCode = cleanText(address.cityCode || address.city_code);
  const provinceCode = cleanText(address.provinceCode || address.province_code);
  const fields = {};
  if (!houseAddress) fields.street = FIELD_MESSAGES.street;
  if (!barangay) fields.barangay = FIELD_MESSAGES.barangay;
  if (!city) fields.city = FIELD_MESSAGES.city;
  if (!province) fields.province = FIELD_MESSAGES.province;
  if (postalCode && !/^\d{4}$/.test(postalCode)) fields.postalCode = FIELD_MESSAGES.postalCode;
  return {
    fields,
    address: {
      ...address,
      houseAddress,
      addressLine1: houseAddress,
      provinceCode,
      provinceName: province,
      barangay,
      barangayCode,
      barangayName: barangay,
      city,
      cityCode,
      cityName: city,
      municipality: city,
      province,
      postalCode,
      zipCode: postalCode,
      country: 'Philippines'
    }
  };
}

function canonicalDeliveryAddress(address = {}) {
  const normalized = addressFields(address).address;
  const generated = formatDeliveryAddress(normalized);
  const suppliedFullAddress = cleanText(
    address.formattedFullAddress || address.fullAddress || address.full_address || address.addressLine
  );
  const hasAllStructuredFields = Boolean(
    normalized.houseAddress && normalized.barangay && normalized.city && normalized.province
  );
  const formattedFullAddress = hasAllStructuredFields
    ? generated
    : suppliedFullAddress || generated;
  return {
    ...normalized,
    addressLine: formattedFullAddress,
    formattedFullAddress
  };
}

function formatDeliveryAddress(address = {}) {
  const normalized = addressFields(address).address;
  const provinceAndZip = [normalized.province, normalized.postalCode].filter(Boolean).join(' ');
  const parts = [
    normalized.houseAddress,
    normalized.barangay,
    normalized.city,
    provinceAndZip
  ].filter(Boolean).join(', ');
  return parts ? `${parts}, Philippines` : '';
}

function deliveryValidationResult(input = {}, options = {}) {
  const customerResult = customerFields(input.customer || {}, options);
  const addressResult = addressFields(input.address || {});
  const address = canonicalDeliveryAddress(addressResult.address);
  return {
    valid: Object.keys(customerResult.fields).length === 0 && Object.keys(addressResult.fields).length === 0,
    fields: { ...customerResult.fields, ...addressResult.fields },
    customer: customerResult.customer,
    address
  };
}

function normalizeCheckoutCustomer(customer = {}, options = {}) {
  const result = customerFields(customer, { requireExplicitNameParts: true });
  if (Object.keys(result.fields).length === 0) return result.customer;
  throw new CommerceError('Please complete your customer information.', {
    code: 'CHECKOUT_CUSTOMER_INVALID',
    status: options.status || 422,
    details: { fields: result.fields }
  });
}

function normalizeDeliveryAddress(address = {}, options = {}) {
  const result = addressFields(address);
  if (Object.keys(result.fields).length) {
    throw new CommerceError('Please complete your delivery information.', {
      code: 'INCOMPLETE_DELIVERY_ADDRESS',
      status: options.status || 422,
      details: { fields: result.fields }
    });
  }
  return canonicalDeliveryAddress(result.address);
}

function requireCompleteDeliveryInformation(input = {}, options = {}) {
  const result = deliveryValidationResult(input, {
    ...options,
    requireExplicitNameParts: options.requireExplicitNameParts !== false
  });
  if (result.valid) return { customer: result.customer, address: result.address };
  throw new CommerceError('Please complete your delivery information.', {
    code: 'INCOMPLETE_DELIVERY_ADDRESS',
    status: options.status || 422,
    details: { fields: result.fields }
  });
}

function deliveryInformationIssues(order = {}) {
  // Historical orders may predate separate first/last fields, so their saved
  // full name remains readable for admin auditing. Every new checkout uses the
  // strict path above and must send both explicit fields.
  return deliveryValidationResult(
    { customer: order.customer, address: order.address },
    { requireExplicitNameParts: false }
  ).fields;
}

function hasCompleteDeliveryInformation(order = {}) {
  return Object.keys(deliveryInformationIssues(order)).length === 0;
}

module.exports = {
  FIELD_MESSAGES,
  canonicalDeliveryAddress,
  cleanText,
  deliveryInformationIssues,
  deliveryValidationResult,
  formatDeliveryAddress,
  hasCompleteDeliveryInformation,
  normalizeCheckoutCustomer,
  normalizeDeliveryAddress,
  normalizePhilippineMobile,
  requireCompleteDeliveryInformation
};
