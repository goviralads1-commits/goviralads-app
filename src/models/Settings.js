const mongoose = require('mongoose');

// Singleton settings document for agency/invoice branding
const settingsSchema = new mongoose.Schema(
  {
    // Singleton identifier (always 'global')
    key: {
      type: String,
      default: 'global',
      unique: true,
      immutable: true,
    },
    // Agency branding
    agencyName: {
      type: String,
      trim: true,
      default: 'Go Viral Ads',
    },
    agencyAddress: {
      type: String,
      trim: true,
      default: '',
    },
    supportEmail: {
      type: String,
      trim: true,
      default: '',
    },
    gstNumber: {
      type: String,
      trim: true,
      default: '',
    },
    logoUrl: {
      type: String,
      trim: true,
      default: '',
    },
    // Additional optional fields for future
    phoneNumber: {
      type: String,
      trim: true,
      default: '',
    },
    websiteUrl: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Static method to get or create singleton settings
settingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ key: 'global' });
  if (!settings) {
    settings = await this.create({ key: 'global' });
  }
  return settings;
};

// Static method to update settings (upsert)
settingsSchema.statics.updateSettings = async function (updates) {
  const settings = await this.findOneAndUpdate(
    { key: 'global' },
    { $set: updates },
    { new: true, upsert: true, runValidators: true }
  );
  return settings;
};

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
