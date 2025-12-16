const mongoose = require('mongoose');

const TRANSACTION_TYPES = Object.freeze({
  RECHARGE_APPROVED: 'RECHARGE_APPROVED',
  ADMIN_ADJUSTMENT: 'ADMIN_ADJUSTMENT',
  TASK_PURCHASE: 'TASK_PURCHASE',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
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
