const mongoose = require('mongoose');

/**
 * UserSubscription Model
 *
 * Tracks an active credit-based subscription for a client.
 * Created when the client purchases a CreditPlan directly from the Wallet page.
 * creditsRemaining is spent on task purchases BEFORE the wallet balance.
 * When expiresAt < now the subscription is marked inactive by the expiry cron.
 */
const userSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CreditPlan',
    required: true,
  },

  // Snapshot of plan name at purchase time
  planName: {
    type: String,
    required: true,
    trim: true,
  },

  // Credits remaining to be spent on task purchases
  creditsRemaining: {
    type: Number,
    required: true,
    min: 0,
  },

  // Datetime after which the subscription expires
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
}, {
  timestamps: true,
});

// Compound indexes for efficient lookup
userSubscriptionSchema.index({ userId: 1, isActive: 1 });
userSubscriptionSchema.index({ isActive: 1, expiresAt: 1 });

module.exports = mongoose.model('UserSubscription', userSubscriptionSchema);
