const mongoose = require('mongoose');

// Embedded metadata only. This does not create a collection or an order workflow.
module.exports = new mongoose.Schema({
  kind: { type: String, enum: ['video', 'file'], required: true },
  key: { type: String, required: true, maxlength: 180 },
  name: { type: String, required: true, maxlength: 120 },
  size: { type: Number, required: true, min: 1, max: 500 * 1024 * 1024 },
  mime: { type: String, required: true, maxlength: 100 },
  etag: { type: String, maxlength: 120 },
  expiresAt: { type: Date, required: true },
}, { _id: false });
