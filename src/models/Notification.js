const mongoose = require('mongoose');

const NOTIFICATION_TYPES = {
  // CLIENT-facing notifications
  RECHARGE_APPROVED: 'RECHARGE_APPROVED',
  RECHARGE_REJECTED: 'RECHARGE_REJECTED',
  WALLET_ADJUSTED: 'WALLET_ADJUSTED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',

  // ADMIN-facing notifications
  RECHARGE_REQUEST_SUBMITTED: 'RECHARGE_REQUEST_SUBMITTED',
  TASK_PURCHASED: 'TASK_PURCHASED',
  SYSTEM_ALERT: 'SYSTEM_ALERT',
};

const ENTITY_TYPES = {
  RECHARGE_REQUEST: 'RECHARGE_REQUEST',
  TASK: 'TASK',
  WALLET: 'WALLET',
  SYSTEM: 'SYSTEM',
};

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    relatedEntity: {
      entityType: {
        type: String,
        enum: Object.values(ENTITY_TYPES),
        required: true,
      },
      entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false,
      },
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient user notification queries
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = { Notification, NOTIFICATION_TYPES, ENTITY_TYPES };
