const User = require('./User');
const Wallet = require('./Wallet');
const { ROLES } = require('../config');
const { hashPassword } = require('../services/passwordService');

// Ensure a test client user exists for development
async function ensureTestClient() {
  const testClientIdentifier = process.env.TEST_CLIENT_IDENTIFIER || 'client@test.com';
  const testClientPassword = process.env.TEST_CLIENT_PASSWORD || 'client123';
  
  const existing = await User.findOne({ identifier: testClientIdentifier }).exec();
  if (existing) {
    console.log('✓ Test client user already exists:', testClientIdentifier);
    
    // Fix password hash if needed
    if (!existing.passwordHash || !existing.passwordHash.startsWith('$2')) {
      console.log('⚠️ Fixing client password hash...');
      existing.passwordHash = await hashPassword(testClientPassword);
      await existing.save();
      console.log('✓ Client password hash fixed');
    }
    
    return existing;
  }
  
  const passwordHash = await hashPassword(testClientPassword);
  const testClient = await User.create({
    identifier: testClientIdentifier,
    passwordHash,
    role: ROLES.CLIENT,
    status: 'ACTIVE',
    displayName: 'Test Client',
  });
  
  console.log(`✓ Test client user created: ${testClientIdentifier}`);
  return testClient;
}

async function ensureClientWallets() {
  const clients = await User.find({ role: ROLES.CLIENT }).exec();
  for (const client of clients) {
    const existingWallet = await Wallet.findOne({ clientId: client._id }).exec();
    if (!existingWallet) {
      await Wallet.create({
        clientId: client._id,
        balance: 0,
      });
    }
  }
}

module.exports = {
  ensureClientWallets,
  ensureTestClient,
};