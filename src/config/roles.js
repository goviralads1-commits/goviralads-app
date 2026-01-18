const ROLES = Object.freeze({
  CLIENT: 'CLIENT',
  ADMIN: 'ADMIN',
});

function isClientRole(role) {
  return role === ROLES.CLIENT;
}

function isAdminRole(role) {
  return role === ROLES.ADMIN;
}

module.exports = {
  ROLES,
  isClientRole,
  isAdminRole,
};





