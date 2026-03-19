const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    // Legacy field - kept for backward compatibility, will be migrated
    balance: {
      type: Number,
      default: 0,
      required: true,
      min: 0,
    },
    // Non-expiring wallet credits (from recharge/upgrade)
    walletCredits: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Expiring subscription credits
    subscriptionCredits: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Subscription expiry date
    subscriptionExpiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;
