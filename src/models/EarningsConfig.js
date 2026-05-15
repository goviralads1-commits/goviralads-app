const mongoose = require('mongoose');

const earningsConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'global',
      unique: true,
      immutable: true,
    },
    minimumRedeemAmount: {
      type: Number,
      default: 500,
    },
    maximumRedeemAmount: {
      type: Number,
      default: 50000,
    },
    redeemEnabled: {
      type: Boolean,
      default: false,
    },
    walletConversionEnabled: {
      type: Boolean,
      default: false,
    },
    externalPayoutEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Static: get or create singleton
earningsConfigSchema.statics.getConfig = async function () {
  let config = await this.findOne({ key: 'global' });
  if (!config) {
    config = await this.create({ key: 'global' });
  }
  return config;
};

// Static: update config (upsert)
earningsConfigSchema.statics.updateConfig = async function (updates) {
  const config = await this.findOneAndUpdate(
    { key: 'global' },
    { $set: updates },
    { new: true, upsert: true, runValidators: true }
  );
  return config;
};

const EarningsConfig = mongoose.model('EarningsConfig', earningsConfigSchema);

module.exports = EarningsConfig;
