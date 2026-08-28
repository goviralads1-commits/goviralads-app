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
  type: { type: String, enum: ['FEATURED_PLANS', 'UPDATES', 'REQUIREMENTS', 'PROMOTIONS', 'SEE_MORE_BUTTON'], required: true },
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

// Admin-configurable public header navigation items (max 4 exposed publicly)
const headerNavItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, default: '' },
  content: { type: String, default: '' },
  // Optional — when set, clicking navigates to this route instead of opening the content popup (e.g. /legal/about)
  link: { type: String, default: '' },
  isEnabled: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
});

// WORKING-DAY DEADLINE SYSTEM: admin-managed holiday calendar entries.
// Calendar dates only (YYYY-MM-DD) — never hard-coded; managed via Admin Panel.
const holidaySchema = new mongoose.Schema({
  id: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  name: { type: String, default: '' }
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

  // Public Header Navigation (admin-configurable, max 4 shown publicly)
  headerNavItems: [headerNavItemSchema],

  // WORKING-DAY DEADLINE SYSTEM: configurable holiday calendar (empty = none)
  holidays: [holidaySchema],

  // WORKING-DAY DEADLINE SYSTEM: configurable weekly working days.
  // JS day numbers (0=Sunday ... 6=Saturday). Default Mon–Fri preserves the
  // historical behavior; docs missing this field fall back to the default.
  workingWeek: { type: [Number], default: [1, 2, 3, 4, 5] },
  
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
  
  // Promotions Section Config
  promotionsSectionConfig: {
    title: { type: String, default: 'Promotions' },
    icon: { type: String, default: '🎁' },
    emptyText: { type: String, default: 'No promotions available' },
    emptyIcon: { type: String, default: '🎉' }
  },
  
  // Page Config
  pageTitle: { type: String, default: 'Office' },
  
  // Metadata
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Default sample header navigation items (generic editable content — no business claims)
const DEFAULT_HEADER_NAV_ITEMS = [
  {
    id: 'nav-about',
    title: 'About',
    content: '<h3>About Go Viral Ads</h3><p>Go Viral Ads is an online advertising and marketing platform built to help businesses grow their reach with effective, easy-to-manage campaigns.</p><p>Our platform brings everything into one place: browse advertising plans, track your campaign tasks in real time, manage your balance with a simple wallet system, and get help from our support team whenever you need it.</p><p><em>This is sample content — edit it from the Admin Panel to tell your own story.</em></p>',
    link: '',
    isEnabled: true,
    order: 0
  },
  {
    id: 'nav-services',
    title: 'Services',
    content: '<h3>Our Services</h3><p>We offer a range of advertising and promotion plans designed for businesses of every size.</p><ul><li><strong>Advertising Plans:</strong> Pick a plan that matches your goals and budget.</li><li><strong>Campaign Tracking:</strong> Follow every task and milestone from your dashboard.</li><li><strong>Wallet System:</strong> Simple balance management for smooth purchases.</li><li><strong>Dedicated Support:</strong> Raise tickets and chat with our team any time.</li></ul><p><em>This is sample content — update it with your actual service details.</em></p>',
    link: '',
    isEnabled: true,
    order: 1
  },
  {
    id: 'nav-our-work',
    title: 'Our Work',
    content: '<h3>Our Work</h3><p>Every campaign we run is tracked transparently from start to finish, so you always know exactly how your promotion is progressing.</p><p>From planning and execution to final delivery, our task system keeps you informed at every step — with real-time updates and direct communication with our team.</p><p><em>This is sample content — replace it with your portfolio highlights.</em></p>',
    link: '',
    isEnabled: true,
    order: 2
  },
  {
    id: 'nav-why-us',
    title: 'Why Us',
    content: '<h3>Why Choose Go Viral Ads</h3><ul><li><strong>Transparency:</strong> Clear pricing and honest progress updates.</li><li><strong>Simplicity:</strong> Powerful marketing tools without the complexity.</li><li><strong>Real-Time Tracking:</strong> See your campaign status at any moment.</li><li><strong>Human Support:</strong> A real team behind every ticket and message.</li></ul><p><em>This is sample content — customize it to highlight your strengths.</em></p>',
    link: '',
    isEnabled: true,
    order: 3
  }
];

// Ensure only one config exists
officeConfigSchema.statics.getConfig = async function() {
  // One-time additive migration: seed header nav samples ONLY on legacy documents where the
  // field does not exist in the DB. An empty array is a deliberate admin choice (hide the
  // navigation row entirely) and must never be re-seeded.
  await this.updateOne(
    { configType: 'OFFICE_CONFIG', headerNavItems: { $exists: false } },
    { $set: { headerNavItems: DEFAULT_HEADER_NAV_ITEMS } }
  );
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
        { id: 'requirements', type: 'REQUIREMENTS', title: 'Requirements', icon: '📋', isEnabled: true, order: 3 },
        { id: 'promotions', type: 'PROMOTIONS', title: 'Promotions', icon: '🎁', isEnabled: true, order: 4 }
      ],
      featuredPlansConfig: { displayCount: 4, selectionMode: 'auto', manualPlanIds: [], showSeeAllButton: true, seeAllButtonText: 'See All' },
      seeMoreButtonConfig: { text: 'See More Plans', isEnabled: true, linkType: 'internal', link: '/plans' },
      headerNavItems: DEFAULT_HEADER_NAV_ITEMS
    });
  }
  return config;
};

module.exports = mongoose.model('OfficeConfig', officeConfigSchema);
