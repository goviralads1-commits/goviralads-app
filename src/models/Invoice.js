const mongoose = require('mongoose');

const INVOICE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  FINALIZED: 'FINALIZED',
  CANCELLED: 'CANCELLED',
});

const INVOICE_TYPE = Object.freeze({
  RECHARGE: 'RECHARGE',
  ORDER: 'ORDER',
  REFUND: 'REFUND',
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
    
    // Invoice type
    invoiceType: {
      type: String,
      enum: Object.values(INVOICE_TYPE),
      default: INVOICE_TYPE.RECHARGE,
      index: true,
    },
    
    // For RECHARGE invoices
    rechargeRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RechargeRequest',
      default: null,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      default: null,
    },
    
    // For ORDER invoices
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    items: [{
      planTitle: String,
      planIcon: String,
      quantity: Number,
      unitPrice: Number,
      totalPrice: Number,
    }],

    // Financial details
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      default: function() { return this.amount + (this.taxAmount || 0); },
    },
    paymentMethod: {
      type: String,
      default: 'Wallet',
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

    // Billing snapshot (company details at time of invoice)
    billingSnapshot: {
      companyName: String,
      companyAddress: String,
      companyGST: String,
      companyPAN: String,
      companyEmail: String,
      companyPhone: String,
      companyState: String,
    },
    
    // Client billing snapshot (frozen at invoice creation)
    clientBillingSnapshot: {
      name: String,
      companyName: String,
      email: String,
      phone: String,
      address: String,
      city: String,
      state: String,
      pincode: String,
      country: String,
      gstNumber: String,
    },
    
    // Tax details (frozen at invoice creation)
    taxDetails: {
      gstEnabled: { type: Boolean, default: false },
      taxPercentage: { type: Number, default: 0 },
      isGstInvoice: { type: Boolean, default: false }, // true if client has GST and GST is enabled
      cgst: { type: Number, default: 0 }, // Central GST (intra-state)
      sgst: { type: Number, default: 0 }, // State GST (intra-state)
      igst: { type: Number, default: 0 }, // Integrated GST (inter-state)
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
invoiceSchema.index({ orderId: 1 });

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = {
  Invoice,
  INVOICE_STATUS,
  INVOICE_TYPE,
};
