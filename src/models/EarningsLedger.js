const mongoose = require('mongoose');

const earningsLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['COMMISSION_EARNED', 'ADMIN_BONUS', 'ADMIN_DEDUCT', 'REDEEM_TO_WALLET', 'EXTERNAL_PAYOUT', 'ADMIN_CORRECTION'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    sourceTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    sourceCommissionLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommissionLog',
      default: null,
    },
    note: {
      type: String,
      trim: true,
      default: '',
    },
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
earningsLedgerSchema.index({ userId: 1, createdAt: -1 });
earningsLedgerSchema.index({ type: 1 });
earningsLedgerSchema.index({ createdAt: -1 });
// Idempotency index: prevent duplicate COMMISSION_EARNED per user+task
earningsLedgerSchema.index({ userId: 1, sourceTaskId: 1, type: 1 });

const EarningsLedger = mongoose.model('EarningsLedger', earningsLedgerSchema);

module.exports = EarningsLedger;
