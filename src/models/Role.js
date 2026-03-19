const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  displayName: { type: String, required: true, trim: true },
  permissions: {
    canViewWallet:      { type: Boolean, default: false },
    canApproveRecharge: { type: Boolean, default: false },
    canEditPlans:       { type: Boolean, default: false },
    canCreateTasks:     { type: Boolean, default: false },
    canEditTasks:       { type: Boolean, default: false },
    canDeleteTasks:     { type: Boolean, default: false },
    canViewAllTasks:    { type: Boolean, default: false },
    canAssignTasks:     { type: Boolean, default: false },
    canAddUsers:        { type: Boolean, default: false },
    canEditUsers:       { type: Boolean, default: false },
  },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true
});

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
