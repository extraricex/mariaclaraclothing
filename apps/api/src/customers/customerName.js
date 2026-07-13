function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function splitLegacyFullName(value) {
  const fullName = cleanName(value);
  if (!fullName) return { firstName: '', lastName: '' };
  const [firstName, ...remaining] = fullName.split(' ');
  return { firstName, lastName: remaining.join(' ') };
}

function normalizeCustomerName(customer = {}) {
  const legacy = splitLegacyFullName(customer.fullName || customer.customer_name);
  const firstName = cleanName(customer.firstName ?? customer.first_name) || legacy.firstName;
  const lastName = cleanName(customer.lastName ?? customer.last_name) || legacy.lastName;
  const combined = cleanName([firstName, lastName].filter(Boolean).join(' '));
  const fullName = combined || cleanName(customer.fullName || customer.customer_name);
  return { firstName, lastName, fullName };
}

function customerFullName(customer = {}) {
  return normalizeCustomerName(customer).fullName;
}

module.exports = { customerFullName, normalizeCustomerName, splitLegacyFullName };
