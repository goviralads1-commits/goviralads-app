const User = require('./User');
const Wallet = require('./Wallet');
const { ROLES } = require('../config');

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
};
