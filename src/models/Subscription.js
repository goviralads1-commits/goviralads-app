const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: false,
    trim: true,
  },
  tasks: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Task',
    required: true,
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'Subscription must contain at least one task'
    }
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  offerPrice: {
    type: Number,
    required: false,
    min: 0,
  },
  durationDays: {
    type: Number,
    required: false,
    min: 1,
  },
  featureImage: {
    type: String,
    required: false,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  targetClients: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
});

const Subscription = mongoose.model('Subscription', SubscriptionSchema);

module.exports = Subscription;
