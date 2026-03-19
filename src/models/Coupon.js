const mongoose = require('mongoose');

/**
 * Coupon Model
 *
 * Coupons are applied at subscription plan purchase time.
 * type: 'discount' → reduce price by value%
 * type: 'bonus'    → add value extra credits to the subscription
 */
const couponSchema = new mongoose.Schema({
  // Coupon code (stored uppercase, unique)
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: 50,
  },

  type: {
    type: String,
    enum: ['discount', 'bonus'],
    required: true,
  },

  // For 'discount': percentage off (0-100). For 'bonus': number of extra credits.
  value: {
    type: Number,
    required: true,
    min: 0,
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },

  // Optional expiry; null means no expiry
  expiryDate: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

couponSchema.index({ code: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
