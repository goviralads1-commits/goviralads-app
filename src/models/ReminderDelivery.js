const mongoose = require('mongoose');

// Internal delivery journal. Existing documents and public notification schemas are unchanged.
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  scope: { type: String, required: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  ownerClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  subjectId: { type: mongoose.Schema.Types.ObjectId },
  channel: { type: String, enum: ['EMAIL', 'IN_APP', 'BOUNDARY'], required: true },
  state: { type: String, enum: ['BOUNDARY', 'PENDING', 'SENDING', 'UNKNOWN', 'ACCEPTED', 'RECORDED', 'HELD', 'CANCELLED', 'FAILED'], required: true },
  payload: { type: mongoose.Schema.Types.Mixed },
  cutoverAt: Date,
  firstAttemptAt: { type: Date, default: null },
  retryUntil: { type: Date, default: null },
  leaseUntil: { type: Date, default: null },
  leaseToken: { type: String, default: null },
  attempts: { type: Number, default: 0 },
  providerMessageId: String,
  notificationId: { type: mongoose.Schema.Types.ObjectId },
  acceptedAt: Date,
  reason: String,
}, { timestamps: true });

module.exports = mongoose.model('ReminderDelivery', schema);
