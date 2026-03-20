const mongoose = require('mongoose');

const commissionLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    taskTitle: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    commissionType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    commissionValue: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Compound index for efficient queries
commissionLogSchema.index({ userId: 1, createdAt: -1 });
commissionLogSchema.index({ createdAt: -1 });

const CommissionLog = mongoose.model('CommissionLog', commissionLogSchema);

module.exports = CommissionLog;
