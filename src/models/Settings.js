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
    whatsappNumber: {
      type: String,
      trim: true,
      default: '',
    },
    socialLinks: {
      facebook: { type: String, trim: true, default: '' },
      instagram: { type: String, trim: true, default: '' },
      twitter: { type: String, trim: true, default: '' },
      linkedin: { type: String, trim: true, default: '' },
      youtube: { type: String, trim: true, default: '' },
    },

    // Subscription Renewal Reminder configuration
    subscriptionReminders: {
      enabled: { type: Boolean, default: true },
      beforeExpiry: {
        enabled: { type: Boolean, default: true },
        days: { type: [Number], default: [7, 3, 1] },
      },
      afterExpiry: {
        enabled: { type: Boolean, default: true },
        days: { type: [Number], default: [1, 3, 7] },
      },
      inAppEnabled: { type: Boolean, default: true },
      emailEnabled: { type: Boolean, default: true },

      // Customizable message templates (all optional — fallback to hardcoded defaults)
      // Supported placeholders: [CLIENT_NAME] [PLAN_NAME] [EXPIRY_DATE] [CREDITS] [DAYS] [RENEW_URL]
      messages: {
        beforeExpiry: {
          inAppTitle:   { type: String, trim: true, default: undefined },
          inAppMessage: { type: String, trim: true, default: undefined },
          emailSubject: { type: String, trim: true, default: undefined },
          emailBody:    { type: String, trim: true, default: undefined },
        },
        afterExpiry: {
          inAppTitle:   { type: String, trim: true, default: undefined },
          inAppMessage: { type: String, trim: true, default: undefined },
          emailSubject: { type: String, trim: true, default: undefined },
          emailBody:    { type: String, trim: true, default: undefined },
        },
      },
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
