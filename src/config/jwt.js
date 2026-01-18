// Centralized JWT and main admin configuration.
// No business logic here, only config-level decisions.

function getRequiredEnv(name, defaultValue) {
  const value = process.env[name];
  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const jwtConfig = {
  secret: getRequiredEnv('JWT_SECRET', 'dev-secret-key-change-in-production'),
  expiry: getRequiredEnv('JWT_EXPIRY', '7d'),
  algorithm: 'HS256',
};

// MAIN ADMIN is determined deterministically via a stable identifier
// (for example, an email or username). This value should be set in
// environment configuration and never changed by application logic.
const mainAdminIdentifier = getRequiredEnv('MAIN_ADMIN_IDENTIFIER', 'admin@goviralads.com');

function isMainAdminIdentifier(identifier) {
  return identifier === mainAdminIdentifier;
}

module.exports = {
  jwtConfig,
  mainAdminIdentifier,
  isMainAdminIdentifier,
};
