const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    icon: {
      type: String,
      default: '📦',  // Emoji or icon name
    },
    image: {
      type: String,
      default: null,  // URL to category image
    },
    color: {
      type: String,
      default: '#6366f1',  // Brand color for category
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    order: {
      type: Number,
      default: 0,  // For sorting categories
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    planCount: {
      type: Number,
      default: 0,  // Cached count of plans in this category
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate slug from name (Mongoose v9+ compatible)
categorySchema.pre('save', function() {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
});

const Category = mongoose.model('Category', categorySchema);

module.exports = { Category };
