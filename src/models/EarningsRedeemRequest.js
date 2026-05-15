const mongoose = require('mongoose');

const earningsRedeemRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestedAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED_WALLET', 'APPROVED_EXTERNAL', 'REJECTED'],
      default: 'PENDING',
    },
    payoutMethod: {
      type: String,
      enum: ['WALLET', 'EXTERNAL'],
      default: null,
    },
    transactionReference: {
      type: String,
      trim: true,
      default: null,
    },
    adminNote: {
      type: String,
      trim: true,
      default: '',
    },
    approvedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    relatedLedgerEntryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EarningsLedger',
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
earningsRedeemRequestSchema.index({ userId: 1, createdAt: -1 });
earningsRedeemRequestSchema.index({ status: 1, createdAt: -1 });

// Immutability guards - no deletes allowed
earningsRedeemRequestSchema.pre('findOneAndDelete', function () {
  throw new Error('EarningsRedeemRequest records cannot be deleted');
});
earningsRedeemRequestSchema.pre('deleteOne', function () {
  throw new Error('EarningsRedeemRequest records cannot be deleted');
});
earningsRedeemRequestSchema.pre('deleteMany', function () {
  throw new Error('EarningsRedeemRequest records cannot be deleted');
});

const EarningsRedeemRequest = mongoose.model('EarningsRedeemRequest', earningsRedeemRequestSchema);

module.exports = EarningsRedeemRequest;
