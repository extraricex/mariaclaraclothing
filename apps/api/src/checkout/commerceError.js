class CommerceError extends Error {
  constructor(message, { code = 'commerce_error', status = 400, details } = {}) {
    super(message);
    this.name = 'CommerceError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

module.exports = { CommerceError };
