const mongoose = require('mongoose');

const { ROLES } = require('../config');

const userSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: [ROLES.CLIENT, ROLES.ADMIN],
      required: true,
    },
    customRole: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      default: null
    },
    assignedManagers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    commissionSettings: {
      enabled: { type: Boolean, default: false },
      percentage: { type: Number, default: 0, min: 0, max: 100 },
      recipients: [{
        managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        share: { type: Number, default: 100 }
      }]
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'DISABLED'],
      default: 'ACTIVE',
      required: true,
    },
    // Profile fields
    profile: {
      name: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      photoUrl: { type: String, default: null },
      avatarUrl: { type: String, default: null },
      company: { type: String, trim: true, default: '' },
      designation: { type: String, trim: true, default: '' },
      timezone: { type: String, default: 'UTC' },
      language: { type: String, default: 'en' },
    },
    // Branding settings (admin only)
    branding: {
      appName: { type: String, default: 'TaskFlow Pro' },
      logoUrl: { type: String, default: '' },
      tagline: { type: String, default: '' },
      accentColor: { type: String, default: '#6366f1' },
      secondaryColor: { type: String, default: '#22c55e' },
    },
    // Notification preferences
    preferences: {
      emailNotifications: { type: Boolean, default: true },
      inAppNotifications: { type: Boolean, default: true },
      marketingEmails: { type: Boolean, default: false },
    },
    // Admin settings (reminders, etc.)
    settings: {
      reminders: {
        enabled: { type: Boolean, default: true },
        reminderDays: { type: [Number], default: [7, 3, 1, 0] },
        maxRemindersPerDay: { type: Number, default: 2 },
        customMessage: { type: String, default: 'Your task deadline is approaching. Please ensure timely completion.' },
      },
    },
    // Metadata
    lastLoginAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// Index for soft delete queries
userSchema.index({ isDeleted: 1, role: 1, status: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
