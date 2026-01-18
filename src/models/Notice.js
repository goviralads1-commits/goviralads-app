const mongoose = require('mongoose');

const noticeResponseSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  responseType: {
    type: String,
    enum: ['YES', 'NO', 'RATING', 'TEXT', 'FILE'],
    required: true,
  },
  value: {
    type: mongoose.Schema.Types.Mixed, // String for text, Number for rating, etc.
    default: null,
  },
  fileUrl: {
    type: String,
    default: null,
  },
  respondedAt: {
    type: Date,
    default: Date.now,
  },
});

const noticeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ['UPDATE', 'REQUIREMENT', 'NOTICE', 'PROMOTION'],
      required: true,
      default: 'NOTICE',
    },
    priority: {
      type: String,
      enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
      default: 'NORMAL',
    },
    // Targeting
    targetType: {
      type: String,
      enum: ['ALL', 'SELECTED'],
      default: 'ALL',
    },
    targetClients: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    // Response settings
    responseRequired: {
      type: Boolean,
      default: false,
    },
    responseType: {
      type: String,
      enum: ['NONE', 'YES_NO', 'RATING', 'TEXT', 'FILE'],
      default: 'NONE',
    },
    // Responses from clients
    responses: [noticeResponseSchema],
    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    // Optional metadata
    imageUrl: {
      type: String,
      default: null,
    },
    linkUrl: {
      type: String,
      default: null,
    },
    linkText: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    // Analytics
    viewCount: {
      type: Number,
      default: 0,
    },
    viewedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
noticeSchema.index({ isActive: 1, createdAt: -1 });
noticeSchema.index({ targetType: 1, targetClients: 1 });
noticeSchema.index({ type: 1, isActive: 1 });

const Notice = mongoose.model('Notice', noticeSchema);

module.exports = Notice;
