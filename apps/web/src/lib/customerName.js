function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function customerNameParts(customer = {}) {
  const legacyFullName = cleanName(customer.fullName || customer.customer_name);
  const [legacyFirstName = '', ...legacyLastName] = legacyFullName.split(' ');
  const firstName = cleanName(customer.firstName ?? customer.first_name) || legacyFirstName;
  const lastName = cleanName(customer.lastName ?? customer.last_name) || legacyLastName.join(' ');
  return {
    firstName,
    lastName,
    fullName: cleanName([firstName, lastName].filter(Boolean).join(' ')) || legacyFullName
  };
}

export function customerFullName(customer = {}) {
  return customerNameParts(customer).fullName;
}
