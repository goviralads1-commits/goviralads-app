const mongoose = require('mongoose');

/**
 * CreditPlan Model
 * 
 * Purpose: Defines credit plans/packs that clients can purchase
 * 
 * IMPORTANT: This model ONLY stores plan definitions.
 * It does NOT modify wallet logic or approval flow.
 * 
 * When client selects a plan, it pre-fills the existing
 * recharge request with plan.price as the amount.
 */
const creditPlanSchema = new mongoose.Schema({
  // Plan display name (e.g., "Starter Pack", "Pro Plan")
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  // Price in currency (this becomes recharge request amount)
  // Must be >= 100 to match backend recharge validation
  price: {
    type: Number,
    required: true,
    min: 100
  },
  
  // Base credits included
  credits: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Bonus credits (0 for credit packs)
  bonusCredits: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Plan type: PLAN (with bonus) or PACK (no bonus, simple multiples)
  type: {
    type: String,
    enum: ['PLAN', 'PACK'],
    default: 'PLAN'
  },
  
  // Optional description
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  
  // Display order for sorting (lower = first)
  displayOrder: {
    type: Number,
    default: 0
  },
  
  // Whether plan is visible to clients
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
creditPlanSchema.index({ type: 1, isActive: 1 });
creditPlanSchema.index({ displayOrder: 1 });

// Virtual: total credits (base + bonus)
creditPlanSchema.virtual('totalCredits').get(function() {
  return this.credits + this.bonusCredits;
});

// Ensure virtuals are included in JSON
creditPlanSchema.set('toJSON', { virtuals: true });
creditPlanSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('CreditPlan', creditPlanSchema);
