const mongoose = require('mongoose');

const EMPLOYEE_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
});

const EMPLOYEE_ROLES = Object.freeze({
  ACCOUNT_MANAGER: 'ACCOUNT_MANAGER',
  VIDEO_EDITOR: 'VIDEO_EDITOR',
  GRAPHIC_DESIGNER: 'GRAPHIC_DESIGNER',
  ADS_MANAGER: 'ADS_MANAGER',
  SEO_EXECUTIVE: 'SEO_EXECUTIVE',
  CONTENT_WRITER: 'CONTENT_WRITER',
  SALES_EXECUTIVE: 'SALES_EXECUTIVE',
  OTHER: 'OTHER',
});

const commissionSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    percentage: { type: Number, default: 0, min: 0, max: 100 },
    notes: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const employeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    identifier: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    defaultRole: {
      type: String,
      enum: Object.values(EMPLOYEE_ROLES),
      default: EMPLOYEE_ROLES.OTHER,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(EMPLOYEE_STATUS),
      default: EMPLOYEE_STATUS.ACTIVE,
      index: true,
    },
    commissionSettings: {
      type: commissionSettingsSchema,
      default: () => ({}),
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Employee = mongoose.model('Employee', employeeSchema);

module.exports = {
  Employee,
  EMPLOYEE_STATUS,
  EMPLOYEE_ROLES,
};
