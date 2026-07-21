const mongoose = require('mongoose');
const { EMPLOYEE_ROLES } = require('./Employee');

const ASSIGNMENT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  REMOVED: 'REMOVED',
});

const assignmentCommissionSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    percentage: { type: Number, default: 0, min: 0, max: 100 },
    notes: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const clientEmployeeAssignmentSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: Object.values(EMPLOYEE_ROLES),
      required: true,
      index: true,
    },
    commissionSettings: {
      type: assignmentCommissionSettingsSchema,
      default: () => ({}),
    },
    status: {
      type: String,
      enum: Object.values(ASSIGNMENT_STATUS),
      default: ASSIGNMENT_STATUS.ACTIVE,
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    removedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    removedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

clientEmployeeAssignmentSchema.index(
  { clientId: 1, employeeId: 1, role: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: ASSIGNMENT_STATUS.ACTIVE },
  }
);

const ClientEmployeeAssignment = mongoose.model('ClientEmployeeAssignment', clientEmployeeAssignmentSchema);

module.exports = {
  ClientEmployeeAssignment,
  ASSIGNMENT_STATUS,
};
