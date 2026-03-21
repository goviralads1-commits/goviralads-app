const mongoose = require('mongoose');

const TRANSACTION_TYPES = Object.freeze({
  // Original types (backward compatibility)
  RECHARGE_APPROVED: 'RECHARGE_APPROVED',
  ADMIN_ADJUSTMENT: 'ADMIN_ADJUSTMENT',
  TASK_PURCHASE: 'TASK_PURCHASE',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  PLAN_PURCHASE: 'PLAN_PURCHASE',
  SUBSCRIPTION_PURCHASE: 'SUBSCRIPTION_PURCHASE',
  SUBSCRIPTION_CREDIT: 'SUBSCRIPTION_CREDIT',  // Credits added via subscription approval
  SUBSCRIPTION_DEDUCTION: 'SUBSCRIPTION_DEDUCTION',  // Credits used from subscription pool
  // Order system
  ORDER_PAYMENT: 'ORDER_PAYMENT',
  ORDER_REFUND: 'ORDER_REFUND',
  // Admin wallet operations
  MANUAL_CREDIT: 'MANUAL_CREDIT',
  MANUAL_DEBIT: 'MANUAL_DEBIT',
  // Legacy/fallback types (for backward compatibility)
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
  REFUND: 'REFUND',
});

const walletTransactionSchema = new mongoose.Schema(
  {
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(TRANSACTION_TYPES),
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    credits: {
      type: Number,
      default: 0,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    description: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// IMMUTABLE: Prevent updates and deletes at schema level
walletTransactionSchema.pre('updateOne', function () {
  throw new Error('WalletTransaction records are immutable and cannot be updated');
});

walletTransactionSchema.pre('findOneAndUpdate', function () {
  throw new Error('WalletTransaction records are immutable and cannot be updated');
});

walletTransactionSchema.pre('deleteOne', function () {
  throw new Error('WalletTransaction records are immutable and cannot be deleted');
});

walletTransactionSchema.pre('findOneAndDelete', function () {
  throw new Error('WalletTransaction records are immutable and cannot be deleted');
});

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);

module.exports = {
  WalletTransaction,
  TRANSACTION_TYPES,
};
