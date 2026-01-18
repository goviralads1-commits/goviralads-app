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
      trim: true,
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
