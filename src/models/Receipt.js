const mongoose = require('mongoose');

const RECEIPT_STATUS = Object.freeze({
  GENERATED: 'GENERATED',
  CANCELLED: 'CANCELLED',
});

const receiptSchema = new mongoose.Schema(
  {
    receiptNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      default: null,
    },

    // Reference to original payment invoices (credits came from these)
    rechargeInvoiceIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
    }],

    // Financial details
    creditsUsed: {
      type: Number,
      required: true,
      min: 0,
    },
    taskTitle: {
      type: String,
      default: '',
    },

    // Status
    status: {
      type: String,
      enum: Object.values(RECEIPT_STATUS),
      default: RECEIPT_STATUS.GENERATED,
      index: true,
    },

    // Admin controls
    isDownloadableByClient: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for faster queries
receiptSchema.index({ clientId: 1, createdAt: -1 });
receiptSchema.index({ taskId: 1 });

const Receipt = mongoose.model('Receipt', receiptSchema);

module.exports = {
  Receipt,
  RECEIPT_STATUS,
};
