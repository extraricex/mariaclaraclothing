require('dotenv').config();

function optional(name, fallback = '') {
  return process.env[name] || fallback;
}

const env = {
  port: Number(optional('PORT', '3000'))
};

module.exports = { env };
