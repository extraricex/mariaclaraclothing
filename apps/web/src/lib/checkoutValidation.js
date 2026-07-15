const EMPTY_LITERALS = new Set([
  'undefined', 'null', 'none', 'n/a', 'na',
  'select province', 'select city', 'select municipality', 'select barangay'
]);

export const CHECKOUT_FIELD_MESSAGES = Object.freeze({
  firstName: 'Please enter your first name.',
  lastName: 'Please enter your last name.',
  phone: 'Please enter a valid mobile number.',
  email: 'Please enter a valid email address or leave this field blank.',
  house: 'Please enter your house number and street address.',
  barangay: 'Please select or enter your barangay.',
  city: 'Please select or enter your city or municipality.',
  province: 'Please select or enter your province.',
  postalCode: 'ZIP Code must contain 4 digits when provided.'
});

export function cleanCheckoutText(value) {
  const text = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  return EMPTY_LITERALS.has(text.toLowerCase()) ? '' : text;
}

export function normalizePhilippineMobile(value) {
  const compact = cleanCheckoutText(value).replace(/[\s()\-]/g, '');
  let normalized = '';
  if (/^09\d{9}$/.test(compact)) normalized = compact;
  if (/^\+639\d{9}$/.test(compact)) normalized = `0${compact.slice(3)}`;
  if (/^639\d{9}$/.test(compact)) normalized = `0${compact.slice(2)}`;
  if (!normalized || new Set(normalized.slice(2)).size === 1) return '';
  return normalized;
}

export function checkoutDetailsErrors(customer = {}, address = {}, options = {}) {
  const errors = {};
  const firstName = cleanCheckoutText(customer.firstName);
  const lastName = cleanCheckoutText(customer.lastName);
  const phone = normalizePhilippineMobile(customer.phone);
  const email = cleanCheckoutText(customer.email).toLowerCase();
  const house = cleanCheckoutText(address.houseAddress || address.addressLine1 || address.street);
  const barangay = cleanCheckoutText(address.barangay);
  const city = cleanCheckoutText(address.city || address.municipality);
  const province = cleanCheckoutText(address.province);
  const postalCode = cleanCheckoutText(address.postalCode || address.zipCode);

  if (!firstName) errors.firstName = CHECKOUT_FIELD_MESSAGES.firstName;
  if (!lastName) errors.lastName = CHECKOUT_FIELD_MESSAGES.lastName;
  if (!phone) errors.phone = CHECKOUT_FIELD_MESSAGES.phone;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = CHECKOUT_FIELD_MESSAGES.email;
  if (!house) errors.house = CHECKOUT_FIELD_MESSAGES.house;
  if (!province || (options.requireAddressCodes && !cleanCheckoutText(address.provinceCode))) errors.province = CHECKOUT_FIELD_MESSAGES.province;
  if (!city || (options.requireAddressCodes && !cleanCheckoutText(address.cityCode))) errors.city = CHECKOUT_FIELD_MESSAGES.city;
  if (!barangay || (options.requireAddressCodes && !cleanCheckoutText(address.barangayCode))) errors.barangay = CHECKOUT_FIELD_MESSAGES.barangay;
  if (postalCode && !/^\d{4}$/.test(postalCode)) errors.postalCode = CHECKOUT_FIELD_MESSAGES.postalCode;
  return errors;
}

export function normalizedCheckoutDetails(customer = {}, address = {}, options = {}) {
  const errors = checkoutDetailsErrors(customer, address, options);
  const firstName = cleanCheckoutText(customer.firstName);
  const lastName = cleanCheckoutText(customer.lastName);
  const houseAddress = cleanCheckoutText(address.houseAddress || address.addressLine1 || address.street);
  const city = cleanCheckoutText(address.city || address.municipality);
  const postalCode = cleanCheckoutText(address.postalCode || address.zipCode);
  const normalizedAddress = {
    ...address,
    houseAddress,
    addressLine1: houseAddress,
    barangay: cleanCheckoutText(address.barangay),
    city,
    municipality: city,
    province: cleanCheckoutText(address.province),
    postalCode,
    zipCode: postalCode,
    country: 'Philippines'
  };
  normalizedAddress.formattedFullAddress = formatCheckoutAddress(normalizedAddress);
  normalizedAddress.addressLine = normalizedAddress.formattedFullAddress;
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    customer: {
      firstName,
      lastName,
      fullName: [firstName, lastName].filter(Boolean).join(' '),
      phone: normalizePhilippineMobile(customer.phone),
      email: cleanCheckoutText(customer.email).toLowerCase()
    },
    address: normalizedAddress
  };
}

export function formatCheckoutAddress(address = {}) {
  const provinceAndZip = [
    cleanCheckoutText(address.province),
    cleanCheckoutText(address.postalCode || address.zipCode)
  ].filter(Boolean).join(' ');
  const parts = [
    cleanCheckoutText(address.houseAddress || address.addressLine1 || address.street),
    cleanCheckoutText(address.barangay),
    cleanCheckoutText(address.city || address.municipality),
    provinceAndZip
  ].filter(Boolean).join(', ');
  return parts ? `${parts}, Philippines` : '';
}
