const mongoose = require('mongoose');

/**
 * ORDER STATUS FLOW:
 * 
 * PENDING_APPROVAL → (Admin Approves) → APPROVED → (Tasks Created) → IN_PROGRESS → COMPLETED
 *                  ↘ (Admin Rejects) → REJECTED (Wallet Refunded)
 */

const ORDER_STATUS = Object.freeze({
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
});

const PAYMENT_STATUS = Object.freeze({
  PAID: 'PAID',
  REFUNDED: 'REFUNDED',
});

// Generate unique order ID like "ORD-20240224-A1B2C3"
function generateOrderId() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${dateStr}-${randomPart}`;
}

const orderItemSchema = new mongoose.Schema({
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
  },
  planTitle: {
    type: String,
    required: true,
  },
  planImage: {
    type: String,
    default: null,
  },
  planIcon: {
    type: String,
    default: '📦',
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null,
  },
  categoryName: {
    type: String,
    default: null,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  originalPrice: {
    type: Number,
    default: null,
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  // Store plan snapshot for reference (in case plan is modified later)
  planSnapshot: {
    description: { type: String, default: '' },
    creditCost: { type: Number, default: 0 },
    publicNotes: { type: String, default: '' },
    progressMode: { type: String, default: 'AUTO' },
    progressTarget: { type: Number, default: 100 },
    milestones: { type: Array, default: [] },
    autoCompletionCap: { type: Number, default: 100 },
  },
  inputs: [
    {
      link: { type: String, default: '' },
      customInput: { type: String, default: '' },
    },
  ],
}, { _id: false });

const orderSchema = new mongoose.Schema(
  {
    // Unique human-readable order ID
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: generateOrderId,
    },
    
    // Client who placed the order
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    
    // Order items (plans with quantities)
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: function(arr) {
          return arr.length > 0;
        },
        message: 'Order must have at least one item',
      },
    },
    
    // Pricing
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    
    // Payment
    paymentMethod: {
      type: String,
      enum: ['WALLET'],
      default: 'WALLET',
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PAID,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      default: null,
    },
    
    // Order Status
    orderStatus: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING_APPROVAL,
      index: true,
    },
    
    // Admin Actions
    adminNotes: {
      type: String,
      default: '',
      trim: true,
    },
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    
    // Task linkage (populated after approval)
    taskIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Task',
      default: [],
    },
    
    // Completion tracking
    completedAt: {
      type: Date,
      default: null,
    },
    
    // Refund tracking
    refundedAt: {
      type: Date,
      default: null,
    },
    refundTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ clientId: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

// Pre-save hook to ensure orderId is unique
// NOTE: Using async/await without next() for compatibility with session-based transactions
orderSchema.pre('save', async function() {
  if (this.isNew && !this.orderId) {
    // Generate unique orderId with retry
    let attempts = 0;
    while (attempts < 5) {
      this.orderId = generateOrderId();
      const existing = await this.constructor.findOne({ orderId: this.orderId });
      if (!existing) break;
      attempts++;
    }
  }
  // No next() call - async middleware resolves automatically
});

// Virtual for total items count (considering quantities)
orderSchema.virtual('totalItemsCount').get(function() {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// Virtual for tasks completion percentage
orderSchema.virtual('completionPercentage').get(function() {
  if (this.taskIds.length === 0) return 0;
  // This would need to be populated with actual task status
  // Will be calculated at runtime when needed
  return null;
});

// Ensure virtuals are included in JSON output
orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

const Order = mongoose.model('Order', orderSchema);

module.exports = {
  Order,
  ORDER_STATUS,
  PAYMENT_STATUS,
  generateOrderId,
};
