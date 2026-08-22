const mongoose = require('mongoose');

const REMINDER_STATUS = Object.freeze({
  SENT: 'SENT',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const reminderLogSchema = new mongoose.Schema(
  {
    // Who receives the reminder
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Which subscription this reminder belongs to
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserSubscription',
      required: true,
    },

    // Deterministic unique key: "{subscriptionId}-{before|after}-{daysOffset}"
    // Identifies the specific subscription + reminder point.
    // Prevents old subscription history from blocking new subscription reminders.
    reminderKey: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
    },

    // Days offset from expiry (positive number)
    daysOffset: {
      type: Number,
      required: true,
    },

    // 'before' or 'after' expiry
    direction: {
      type: String,
      enum: ['before', 'after'],
      required: true,
    },

    // Delivery status
    status: {
      type: String,
      enum: Object.values(REMINDER_STATUS),
      default: REMINDER_STATUS.SENT,
    },

    // Channel used
    channel: {
      type: String,
      enum: ['BOTH', 'IN_APP', 'EMAIL'],
      default: 'BOTH',
    },

    // When the reminder was actually sent
    sentAt: {
      type: Date,
      default: null,
    },

    // Error message if delivery failed
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient lookup by subscription
reminderLogSchema.index({ subscriptionId: 1, status: 1 });

const ReminderLog = mongoose.model('ReminderLog', reminderLogSchema);

module.exports = {
  ReminderLog,
  REMINDER_STATUS,
};
