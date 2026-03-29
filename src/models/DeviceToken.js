const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  role: {
    type: String,
    enum: ['admin', 'client'],
    required: true,
    index: true
  },
  platform: {
    type: String,
    enum: ['web', 'ios', 'android'],
    default: 'web'
  },
  userAgent: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUsed: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for user lookup
deviceTokenSchema.index({ userId: 1, isActive: 1 });
deviceTokenSchema.index({ role: 1, isActive: 1 });

// Update lastUsed on token access
deviceTokenSchema.methods.touch = async function() {
  this.lastUsed = new Date();
  await this.save();
};

// Static method to get all active tokens for a user
deviceTokenSchema.statics.getActiveTokensForUser = async function(userId) {
  return this.find({ userId, isActive: true }).select('token');
};

// Static method to get all active tokens by role (admin or client)
deviceTokenSchema.statics.getActiveTokensByRole = async function(role) {
  const tokens = await this.find({ role, isActive: true }).select('token userId');
  console.log(`[DeviceToken] Found ${tokens.length} active ${role} token(s)`);
  return tokens;
};

// Static method to deactivate old tokens (not used in 30 days)
deviceTokenSchema.statics.deactivateOldTokens = async function() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return this.updateMany(
    { lastUsed: { $lt: thirtyDaysAgo }, isActive: true },
    { $set: { isActive: false } }
  );
};

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);
