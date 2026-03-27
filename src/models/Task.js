const mongoose = require('mongoose');

const TASK_STATUS = Object.freeze({
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  LISTED: 'LISTED',
});

const TASK_PRIORITY = Object.freeze({
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
});

const taskSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false, // Changed: Optional for Plans (isListedInPlans = true)
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      // Note: trim removed to preserve HTML formatting from rich text editor
    },
    creditCost: {
      type: Number,
      required: true,
      min: 0,
    },
    creditsUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    deadline: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(TASK_STATUS),
      default: TASK_STATUS.PENDING,
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(TASK_PRIORITY),
      default: TASK_PRIORITY.MEDIUM,
      required: true,
    },
    startDate: {
      type: Date,
      required: false, // Changed: Optional for Plans
      default: null,
    },
    endDate: {
      type: Date,
      required: false,  // Changed: endDate is optional
    },
    publicNotes: {
      type: String,
      default: '',
      trim: true,
    },
    internalNotes: {
      type: String,
      default: '',
      trim: true,
    },
    specialInstructions: {
      type: String,
      default: '',
      trim: true,
    },
    progressMode: {
      type: String,
      enum: ['AUTO', 'MANUAL'],
      default: 'AUTO',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      // No max constraint - allow overachievement (120%, 150%, etc)
    },
    // SMART PROGRESS SYSTEM EXTENSIONS
    progressTarget: {
      type: Number,
      required: false,
      min: 0,
      default: 100,
    },
    progressAchieved: {
      type: Number,
      required: false,
      min: 0,
      default: 0,
    },
    showProgressDetails: {
      type: Boolean,
      default: false,  // Hide Target & Achieved by default
    },
    autoCompletionCap: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    milestones: {
      type: [{
        name: { type: String, required: true },
        percentage: { type: Number, required: true, min: 0 },
        color: { type: String, default: '#6366f1' },
        reached: { type: Boolean, default: false },
        reachedAt: { type: Date, default: null },
      }],
      default: [],
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // TASK ASSIGNMENT SYSTEM
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    commissionType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'percentage',
    },
    commissionValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    commissionEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    // DEDUCTION MODE CONTROL
    deductionMode: {
      type: String,
      enum: ['AUTO', 'SUBSCRIPTION_ONLY', 'WALLET_ONLY'],
      default: 'AUTO',
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaskTemplate',
      default: null,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    // Order linkage (for tasks created from order approval)
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true,
    },
    // PLAN SYSTEM EXTENSIONS (BACKWARD COMPATIBLE)
    quantity: {
      type: Number,
      required: false,
      min: 0,
    },
    showQuantityToClient: {
      type: Boolean,
      default: true,
    },
    showCreditsToClient: {
      type: Boolean,
      default: true,
    },
    isListedInPlans: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActivePlan: {
      type: Boolean,
      default: true,
    },
    visibility: {
      type: String,
      enum: ['PUBLIC', 'SELECTED', 'HIDDEN'],
      default: 'PUBLIC',
    },
    allowedClients: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    targetClients: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: null,
    },
    featureImage: {
      type: String,
      required: false,
      trim: true,
    },
    offerPrice: {
      type: Number,
      required: false,
      min: 0,
    },
    originalPrice: {
      type: Number,
      required: false,
      min: 0,
    },
    countdownEndDate: {
      type: Date,
      required: false,
    },
    // MEDIA SYSTEM: Array of media items (1-4 items, any mix of image/video)
    planMedia: {
      type: [{
        type: {
          type: String,
          enum: ['image', 'video'],
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
      }],
      default: [],
      validate: {
        validator: function(arr) {
          return arr.length <= 4; // Max 4 media items
        },
        message: 'Maximum 4 media items allowed'
      }
    },
    // COMMISSION SYSTEM
    commissionSettings: {
      enabled: { type: Boolean, default: false },
      percentage: { type: Number, default: 0, min: 0, max: 100 },
      recipients: [{
        managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        share: { type: Number, default: 100 }
      }]
    },
    // CLIENT CONTENT SUBMISSION (Phase 2)
    // Allows client to submit content after task purchase
    clientContentText: {
      type: String,
      default: '',
      trim: true,
      maxlength: 5000,
    },
    clientContentLinks: {
      type: [String],
      default: [],
      validate: {
        validator: function(arr) {
          return arr.length <= 10; // Max 10 links
        },
        message: 'Maximum 10 content links allowed'
      }
    },
    clientDriveLink: {
      type: String,
      default: '',
      trim: true,
    },
    // ALIAS: clientContentFolder (Phase 4A - future Google Drive automation)
    // Maps to clientDriveLink for backward compatibility
    clientContentSubmittedAt: {
      type: Date,
      default: null,
    },
    clientContentSubmitted: {
      type: Boolean,
      default: false,
    },
    // CONTENT REQUIREMENT CONTROL (Phase 2 Step 4)
    // If true, client must submit content before work starts
    requireClientContent: {
      type: Boolean,
      default: false,
    },
    // FINAL DELIVERY SYSTEM (Phase 3)
    // Admin uploads final deliverables for client download
    // ALIAS: finalDeliveryFolder (Phase 4A - future Google Drive automation)
    finalDeliveryLink: {
      type: String,
      default: '',
      trim: true,
    },
    finalDeliveryText: {
      type: String,
      default: '',
      trim: true,
      maxlength: 2000,
    },
    finalDeliveredAt: {
      type: Date,
      default: null,
    },
    // CLIENT UPLOAD FOLDER (Phase 4B)
    // Admin sets folder where client uploads content
    clientUploadFolderLink: {
      type: String,
      default: '',
      trim: true,
    },
    // TASK DISCUSSION SYSTEM (Phase 6)
    // Client-Admin messaging within task context
    messages: [{
      sender: {
        type: String,
        enum: ['CLIENT', 'ADMIN'],
        required: true,
      },
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      text: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2000,
      },
      attachments: [{
        type: String, // Image URLs (data URLs or hosted URLs)
      }],
      createdAt: {
        type: Date,
        default: Date.now,
      },
    }],
  },
  {
    timestamps: true,
  }
);

const Task = mongoose.model('Task', taskSchema);

module.exports = {
  Task,
  TASK_STATUS,
  TASK_PRIORITY,
};
