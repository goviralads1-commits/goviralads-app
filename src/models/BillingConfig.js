const mongoose = require('mongoose');

const billingConfigSchema = new mongoose.Schema(
  {
    // Singleton identifier
    configType: {
      type: String,
      default: 'BILLING_CONFIG',
      unique: true,
    },

    // Company details (for Invoice header)
    companyName: {
      type: String,
      default: '',
    },
    companyAddress: {
      type: String,
      default: '',
    },
    companyGST: {
      type: String,
      default: '',
    },
    companyPAN: {
      type: String,
      default: '',
    },
    companyEmail: {
      type: String,
      default: '',
    },
    companyPhone: {
      type: String,
      default: '',
    },
    companyLogo: {
      type: String,
      default: '',
    },

    // Invoice settings
    invoicePrefix: {
      type: String,
      default: 'INV',
    },
    receiptPrefix: {
      type: String,
      default: 'RCP',
    },
    currentInvoiceSeq: {
      type: Number,
      default: 1000,
    },
    currentReceiptSeq: {
      type: Number,
      default: 1000,
    },

    // Default permissions
    defaultClientInvoiceDownload: {
      type: Boolean,
      default: true,
    },
    defaultClientReceiptDownload: {
      type: Boolean,
      default: true,
    },

    // Currency settings
    currencySymbol: {
      type: String,
      default: '₹',
    },
    currencyCode: {
      type: String,
      default: 'INR',
    },

    // GST/Tax settings
    gstEnabled: {
      type: Boolean,
      default: true,
    },
    taxPercentage: {
      type: Number,
      default: 18,
      min: 0,
      max: 100,
    },
    // State for determining intra/inter-state GST
    companyState: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Static method to get or create config (singleton pattern)
billingConfigSchema.statics.getConfig = async function () {
  let config = await this.findOne({ configType: 'BILLING_CONFIG' });
  if (!config) {
    config = await this.create({
      configType: 'BILLING_CONFIG',
      companyName: 'Your Company Name',
      companyAddress: 'Your Company Address',
      companyEmail: 'billing@example.com',
      invoicePrefix: 'INV',
      receiptPrefix: 'RCP',
      currentInvoiceSeq: 1000,
      currentReceiptSeq: 1000,
    });
  }
  return config;
};

const BillingConfig = mongoose.model('BillingConfig', billingConfigSchema);

module.exports = BillingConfig;
