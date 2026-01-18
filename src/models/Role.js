const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  displayName: { type: String, required: true, trim: true },
  permissions: {
    viewClients: { type: String, enum: ['NONE', 'PARTIAL', 'FULL'], default: 'NONE' },
    createTasks: { type: String, enum: ['NONE', 'PARTIAL', 'FULL'], default: 'NONE' },
    editTasks: { type: String, enum: ['NONE', 'PARTIAL', 'FULL'], default: 'NONE' },
    manageWallet: { type: String, enum: ['NONE', 'PARTIAL', 'FULL'], default: 'NONE' },
    sendNotices: { type: String, enum: ['NONE', 'PARTIAL', 'FULL'], default: 'NONE' },
    replyTickets: { type: String, enum: ['NONE', 'PARTIAL', 'FULL'], default: 'NONE' },
    viewReports: { type: String, enum: ['NONE', 'PARTIAL', 'FULL'], default: 'NONE' },
    manageUsers: { type: String, enum: ['NONE', 'PARTIAL', 'FULL'], default: 'NONE' },
  },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true
});

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
