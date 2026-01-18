const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  gradient: { type: String, default: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  imageUrl: { type: String, default: '' },
  ctaText: { type: String, default: 'Explore Now' },
  ctaLink: { type: String, default: '/plans' },
  ctaLinkType: { type: String, enum: ['internal', 'external'], default: 'internal' },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
});

const sectionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['FEATURED_PLANS', 'UPDATES', 'REQUIREMENTS', 'SEE_MORE_BUTTON'], required: true },
  title: { type: String, required: true },
  icon: { type: String, default: '⭐' },
  isEnabled: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
});

const featuredPlansConfigSchema = new mongoose.Schema({
  displayCount: { type: Number, default: 4, min: 2, max: 12 },
  selectionMode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
  manualPlanIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  showSeeAllButton: { type: Boolean, default: true },
  seeAllButtonText: { type: String, default: 'See All' }
});

const seeMoreButtonConfigSchema = new mongoose.Schema({
  text: { type: String, default: 'See More Plans' },
  isEnabled: { type: Boolean, default: true },
  linkType: { type: String, enum: ['internal', 'external'], default: 'internal' },
  link: { type: String, default: '/plans' }
});

const officeConfigSchema = new mongoose.Schema({
  // Singleton identifier
  configType: { type: String, default: 'OFFICE_CONFIG', unique: true },
  
  // Banners
  banners: [bannerSchema],
  bannerAutoRotate: { type: Boolean, default: true },
  bannerRotateInterval: { type: Number, default: 5000 },
  
  // Sections
  sections: [sectionSchema],
  
  // Featured Plans Config
  featuredPlansConfig: featuredPlansConfigSchema,
  
  // See More Button Config
  seeMoreButtonConfig: seeMoreButtonConfigSchema,
  
  // Updates Section Config
  updatesSectionConfig: {
    title: { type: String, default: 'Updates' },
    icon: { type: String, default: '🔄' },
    emptyText: { type: String, default: 'No updates at the moment' },
    emptyIcon: { type: String, default: '📭' }
  },
  
  // Requirements Section Config
  requirementsSectionConfig: {
    title: { type: String, default: 'Requirements' },
    icon: { type: String, default: '📋' },
    emptyText: { type: String, default: 'All caught up! No requirements pending.' },
    emptyIcon: { type: String, default: '✅' }
  },
  
  // Page Config
  pageTitle: { type: String, default: 'Office' },
  
  // Metadata
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Ensure only one config exists
officeConfigSchema.statics.getConfig = async function() {
  let config = await this.findOne({ configType: 'OFFICE_CONFIG' });
  if (!config) {
    config = await this.create({
      configType: 'OFFICE_CONFIG',
      banners: [
        { id: 'banner1', title: 'Premium Services', subtitle: 'Get started with our top plans', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', ctaText: 'Explore Now', ctaLink: '/plans', order: 0 },
        { id: 'banner2', title: 'Special Offers', subtitle: 'Limited time deals available', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', ctaText: 'View Offers', ctaLink: '/plans', order: 1 },
        { id: 'banner3', title: 'New Arrivals', subtitle: 'Check out the latest plans', gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', ctaText: 'Discover', ctaLink: '/plans', order: 2 }
      ],
      sections: [
        { id: 'featured', type: 'FEATURED_PLANS', title: 'Featured Plans', icon: '⭐', isEnabled: true, order: 0 },
        { id: 'seeMore', type: 'SEE_MORE_BUTTON', title: 'See More Plans', icon: '', isEnabled: true, order: 1 },
        { id: 'updates', type: 'UPDATES', title: 'Updates', icon: '🔄', isEnabled: true, order: 2 },
        { id: 'requirements', type: 'REQUIREMENTS', title: 'Requirements', icon: '📋', isEnabled: true, order: 3 }
      ],
      featuredPlansConfig: { displayCount: 4, selectionMode: 'auto', manualPlanIds: [], showSeeAllButton: true, seeAllButtonText: 'See All' },
      seeMoreButtonConfig: { text: 'See More Plans', isEnabled: true, linkType: 'internal', link: '/plans' }
    });
  }
  return config;
};

module.exports = mongoose.model('OfficeConfig', officeConfigSchema);
