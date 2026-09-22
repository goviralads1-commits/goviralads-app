const User = require('./User');
const Wallet = require('./Wallet');
const { ROLES } = require('../config');
const { hashPassword } = require('../services/passwordService');

// Ensure a test client user exists for development
async function ensureTestClient() {
  if (!['development', 'test'].includes(process.env.NODE_ENV)) {
    console.log('[CLIENT SEED] Test client seeding skipped outside development/test');
    return null;
  }

  const testClientIdentifier = process.env.TEST_CLIENT_IDENTIFIER || 'client@test.com';
  const testClientPassword = process.env.TEST_CLIENT_PASSWORD || 'client123';
  
  const existing = await User.findOne({ identifier: testClientIdentifier }).exec();
  if (existing) {
    console.log('✓ Test client user already exists:', testClientIdentifier);
    return existing;
  }
  
  const passwordHash = await hashPassword(testClientPassword);
  let testClient;
  try {
    testClient = await User.create({
      identifier: testClientIdentifier,
      passwordHash,
      role: ROLES.CLIENT,
      status: 'ACTIVE',
      displayName: 'Test Client',
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    const concurrentClient = await User.findOne({ identifier: testClientIdentifier }).exec();
    if (!concurrentClient) throw err;
    console.log('[CLIENT SEED] Test client already created concurrently');
    return concurrentClient;
  }
  
  console.log(`✓ Test client user created: ${testClientIdentifier}`);
  return testClient;
}

async function ensureClientWallets() {
  const clients = await User.find({ role: ROLES.CLIENT }).exec();
  for (const client of clients) {
    const existingWallet = await Wallet.findOne({ clientId: client._id }).exec();
    if (!existingWallet) {
      try {
        await Wallet.create({
          clientId: client._id,
          balance: 0,
        });
      } catch (err) {
        if (err.code !== 11000 || !await Wallet.exists({ clientId: client._id })) throw err;
        console.log('[WALLET SEED] Wallet already created concurrently');
      }
    }
  }
}

module.exports = {
  ensureClientWallets,
  ensureTestClient,
};