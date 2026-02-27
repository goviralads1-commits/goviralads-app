const mongoose = require('mongoose');

const INVOICE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  FINALIZED: 'FINALIZED',
  CANCELLED: 'CANCELLED',
});

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
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
    rechargeRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RechargeRequest',
      required: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      default: null,
    },

    // Financial details
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      default: 'Online Transfer',
    },
    paymentReference: {
      type: String,
      default: '',
    },

    // Status
    status: {
      type: String,
      enum: Object.values(INVOICE_STATUS),
      default: INVOICE_STATUS.FINALIZED,
      index: true,
    },

    // Admin controls
    isDownloadableByClient: {
      type: Boolean,
      default: true,
    },

    // Metadata
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for faster queries
invoiceSchema.index({ clientId: 1, createdAt: -1 });
invoiceSchema.index({ status: 1, createdAt: -1 });

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = {
  Invoice,
  INVOICE_STATUS,
};
