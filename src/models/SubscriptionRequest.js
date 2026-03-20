const mongoose = require('mongoose');

const SUBSCRIPTION_REQUEST_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

const subscriptionRequestSchema = new mongoose.Schema(
  {
    clientId: {
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
    // Snapshot of plan details at time of request
    planName: {
      type: String,
      required: true,
    },
    planPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    planCredits: {
      type: Number,
      required: true,
      min: 0,
    },
    planBonusCredits: {
      type: Number,
      default: 0,
    },
    planValidityDays: {
      type: Number,
      default: 30,
    },
    // Coupon applied
    couponCode: {
      type: String,
      default: null,
    },
    couponDiscount: {
      type: Number,
      default: 0,
    },
    // Final amounts
    finalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    totalCredits: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_REQUEST_STATUS),
      default: SUBSCRIPTION_REQUEST_STATUS.PENDING,
      required: true,
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const SubscriptionRequest = mongoose.model('SubscriptionRequest', subscriptionRequestSchema);

module.exports = {
  SubscriptionRequest,
  SUBSCRIPTION_REQUEST_STATUS,
};
