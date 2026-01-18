const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderRole: { type: String, enum: ['CLIENT', 'ADMIN'], required: true },
  message: { type: String, required: true, trim: true },
  attachments: [{ type: String }], // URLs
  createdAt: { type: Date, default: Date.now }
});

const ticketSchema = new mongoose.Schema({
  // Reference
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // Ticket details
  ticketNumber: { type: String, unique: true },
  subject: { type: String, required: true, trim: true, maxlength: 200 },
  category: { 
    type: String, 
    enum: ['GENERAL', 'BILLING', 'TECHNICAL', 'TASK_ISSUE', 'ACCOUNT', 'OTHER'],
    default: 'GENERAL'
  },
  priority: {
    type: String,
    enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
    default: 'NORMAL'
  },
  status: {
    type: String,
    enum: ['OPEN', 'IN_PROGRESS', 'AWAITING_CLIENT', 'RESOLVED', 'CLOSED'],
    default: 'OPEN'
  },
  
  // Messages thread
  messages: [ticketMessageSchema],
  
  // Related entities (optional)
  relatedTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  
  // Metadata
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Admin assigned
  lastReplyAt: { type: Date },
  lastReplyBy: { type: String, enum: ['CLIENT', 'ADMIN'] },
  resolvedAt: { type: Date },
  closedAt: { type: Date },
  
  // Client satisfaction
  rating: { type: Number, min: 1, max: 5 },
  feedback: { type: String },
  
  // Soft delete
  isDeleted: { type: Boolean, default: false }
}, {
  timestamps: true
});

// Indexes
ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ createdAt: -1 });

// Generate ticket number
ticketSchema.pre('save', async function(next) {
  if (!this.ticketNumber) {
    const count = await mongoose.model('Ticket').countDocuments();
    this.ticketNumber = `TKT-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Virtual for unread count (for client)
ticketSchema.virtual('hasUnreadAdminReply').get(function() {
  if (!this.messages || this.messages.length === 0) return false;
  return this.lastReplyBy === 'ADMIN' && this.status !== 'CLOSED';
});

const Ticket = mongoose.model('Ticket', ticketSchema);

module.exports = Ticket;

