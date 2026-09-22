const mongoose = require('mongoose');
const UserSubscription = require('../models/UserSubscription');
const Wallet = require('../models/Wallet');
const { WalletTransaction, TRANSACTION_TYPES } = require('../models/WalletTransaction');
const Notification = require('../models/Notification');

async function expireSubscriptions(now = new Date()) {
  const subscriptionFilter = { isActive: true, expiresAt: { $lt: now } };
  const walletFilter = {
    subscriptionExpiresAt: { $lt: now, $ne: null },
    subscriptionCredits: { $gt: 0 },
  };
  const subscriptions = await UserSubscription.find(subscriptionFilter).select('userId').exec();
  const wallets = await Wallet.find(walletFilter).select('clientId').exec();
  const clients = new Map();
  for (const subscription of subscriptions) clients.set(String(subscription.userId), subscription.userId);
  for (const wallet of wallets) clients.set(String(wallet.clientId), wallet.clientId);
  const totals = { subscriptions: 0, wallets: 0 };

  for (const clientId of clients.values()) {
    const session = await mongoose.startSession();
    try {
      const result = await session.withTransaction(async () => {
        // Both original expiry predicates are evaluated again within the transaction.
        const expired = await UserSubscription.updateMany(
          { ...subscriptionFilter, userId: clientId },
          { $set: { isActive: false, creditsRemaining: 0 } },
          { session }
        );
        const candidates = await Wallet.find({ ...walletFilter, clientId }).session(session).exec();
        let walletCount = 0;
        for (const wallet of candidates) {
          const expiredCredits = wallet.subscriptionCredits;
          const claimed = await Wallet.findOneAndUpdate(
            {
              _id: wallet._id,
              subscriptionExpiresAt: wallet.subscriptionExpiresAt,
              subscriptionCredits: expiredCredits,
            },
            { $set: { subscriptionCredits: 0 } },
            { new: false, session }
          ).exec();
          if (!claimed) continue;
          await WalletTransaction.create([{
            walletId: wallet._id,
            type: TRANSACTION_TYPES.SUBSCRIPTION_EXPIRED,
            amount: 0,
            credits: -expiredCredits,
            description: `Subscription credits expired (${expiredCredits} credits)`,
            referenceId: null,
          }], { session });
          await Notification.create([{
            recipientId: wallet.clientId,
            title: 'Subscription Credits Expired',
            message: `Your ${expiredCredits} subscription credits have expired. Please recharge to continue.`,
            relatedEntity: { entityType: 'WALLET', entityId: wallet._id },
          }], { session });
          walletCount++;
        }
        return { subscriptions: expired.modifiedCount || 0, wallets: walletCount };
      });
      totals.subscriptions += result.subscriptions;
      totals.wallets += result.wallets;
    } finally {
      await session.endSession();
    }
  }
  return totals;
}

module.exports = { expireSubscriptions };
