// Centralized JWT and main admin configuration.
// No business logic here, only config-level decisions.

const REQUIRED_ENV_VARS = ['JWT_SECRET', 'JWT_EXPIRY', 'MAIN_ADMIN_IDENTIFIER'];

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const jwtConfig = {
  secret: getRequiredEnv('JWT_SECRET'),
  expiry: getRequiredEnv('JWT_EXPIRY'),
  algorithm: 'HS256',
};

// MAIN ADMIN is determined deterministically via a stable identifier
// (for example, an email or username). This value should be set in
// environment configuration and never changed by application logic.
const mainAdminIdentifier = getRequiredEnv('MAIN_ADMIN_IDENTIFIER');

function isMainAdminIdentifier(identifier) {
  return identifier === mainAdminIdentifier;
}

module.exports = {
  jwtConfig,
  mainAdminIdentifier,
  isMainAdminIdentifier,
};
