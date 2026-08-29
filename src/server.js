
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const admin = require('firebase-admin');

// ============== FIREBASE ADMIN SDK INITIALIZATION ==============
// This MUST run before routes are loaded
let firebaseInitialized = false;

function initializeFirebaseAdmin() {
  console.log('[Push] ========== FIREBASE ADMIN INIT START ==========');
  
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.error('[Push] ❌ FIREBASE_SERVICE_ACCOUNT is MISSING from environment');
      console.error('[Push] To fix: Go to Firebase Console → Project Settings → Service Accounts → Generate new private key');
      console.error('[Push] Then add the FULL JSON as FIREBASE_SERVICE_ACCOUNT env var in Render');
      return false;
    }
    
    console.log('[Push] ✅ FIREBASE_SERVICE_ACCOUNT found in environment');
    console.log('[Push] Parsing service account JSON...');
    
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    
    console.log('[Push] ✅ JSON parsed successfully');
    console.log('[Push] Project ID:', serviceAccount.project_id);
    console.log('[Push] Client Email:', serviceAccount.client_email);
    
    // Check if already initialized (prevent duplicate)
    if (admin.apps.length > 0) {
      console.log('[Push] Firebase Admin already initialized, skipping');
      firebaseInitialized = true;
      return true;
    }
    
    console.log('[Push] Initializing Firebase Admin SDK...');
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    
    firebaseInitialized = true;
    console.log('[Push] ✅ Firebase Admin SDK initialized SUCCESSFULLY');
    console.log('[Push] ========== FIREBASE ADMIN INIT COMPLETE ==========');
    return true;
  } catch (err) {
    console.error('[Push] ❌ Firebase Admin init ERROR:', err.message);
    if (err.message.includes('JSON')) {
      console.error('[Push] The FIREBASE_SERVICE_ACCOUNT env var is not valid JSON');
      console.error('[Push] Make sure you copied the ENTIRE service account JSON file content');
    }
    console.error('[Push] ========== FIREBASE ADMIN INIT FAILED ==========');
    return false;
  }
}

// Initialize Firebase Admin immediately on module load
initializeFirebaseAdmin();

// Export for use in pushNotificationService
module.exports.firebaseAdmin = admin;
module.exports.isFirebaseInitialized = () => firebaseInitialized;

const { connectDB: connectToDatabase } = require('./config/db');
const { ensureMainAdminSeed } = require('./models/seedMainAdmin');
const { ensureClientWallets, ensureTestClient } = require('./models/seedWallets');
const { runPhase2SafetyChecks, runPhase3SafetyChecks } = require('./utils/safetyChecks');

const app = express();

// ============== CORS CONFIGURATION ==============
// cors() middleware handles OPTIONS preflight automatically
app.use(cors({
  origin: true,
  credentials: true
}));

// ============== BODY PARSERS ==============
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// ============== CLOUDINARY CONFIG ==============
// Validate Cloudinary env vars at startup
const cloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('[CLOUDINARY] Configured with cloud:', process.env.CLOUDINARY_CLOUD_NAME);
} else {
  console.error('[CLOUDINARY] WARNING: Missing env vars!');
}

// Helper: upload a single file buffer to Cloudinary, returns secure_url
const uploadBufferToCloudinary = (buffer, folder = 'goviralads/chat', resourceType = 'image') => {
  return new Promise((resolve, reject) => {
    if (!cloudinaryConfigured) {
      return reject(new Error('Cloudinary not configured - missing env vars'));
    }
    
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          console.error('[CLOUDINARY] Upload error:', error.message);
          reject(error);
        } else {
          console.log('[CLOUDINARY] Upload success:', result.secure_url);
          resolve(result.secure_url);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

// ============== STATIC FILE SERVING (uploads) ==============
// Kept for backward compatibility — existing messages stored before Cloudinary migration
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ============== MULTER CONFIG (Chat Image Upload — memory storage for Cloudinary) ==============
const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only jpg, png, webp, gif allowed.'));
  }
});

// Plan image upload (Cloudinary storage)
const planUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only jpg, png, webp allowed.'));
  }
});

// ============== IMAGE UPLOAD ENDPOINT ==============
const { authenticateJWT } = require('./middleware/auth');
app.post('/upload/chat', authenticateJWT, chatUpload.array('images', 5), async (req, res) => {
  console.log('[UPLOAD] Request received, files:', req.files?.length || 0);
  
  try {
    if (!req.files || req.files.length === 0) {
      console.log('[UPLOAD] No files in request');
      return res.status(400).json({ error: 'No files uploaded' });
    }

    console.log('[UPLOAD] Processing', req.files.length, 'file(s)');
    
    // Upload all files to Cloudinary in parallel
    const urls = await Promise.all(
      req.files.map(f => {
        console.log('[UPLOAD] Uploading file:', f.originalname, f.mimetype, f.size, 'bytes');
        return uploadBufferToCloudinary(f.buffer);
      })
    );

    console.log('[UPLOAD] Success, URLs:', urls);
    return res.status(200).json({ urls });
  } catch (err) {
    console.error('[UPLOAD] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// ============== PLAN IMAGE UPLOAD ENDPOINT ==============
app.post('/upload/plan-image', authenticateJWT, planUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const url = await uploadBufferToCloudinary(req.file.buffer, 'goviralads/plans');
    return res.status(200).json({ url });
  } catch (err) {
    console.error('[PLAN UPLOAD] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// ============== PROGRESS ICON UPLOAD ENDPOINT ==============
const { requireAdmin } = require('./middleware/authorization');
const { ProgressIconLibrary } = require('./models/ProgressIconLibrary');

// ============== PLAN VIDEO UPLOAD ENDPOINT ==============
// Optional explanatory video for Plans. Reuses the existing Cloudinary
// infrastructure (same as plan images) with resource_type 'video'.
// Admin-only; MIME whitelist + size limit enforced server-side by multer.
const planVideoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB hard cap
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/webm'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only MP4 and WebM videos are allowed.'));
  }
});

app.post('/upload/plan-video', authenticateJWT, requireAdmin, (req, res, next) => {
  // Intercept multer errors per-route (size/type) so clients get a clean JSON error
  planVideoUpload.single('video')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Video too large. Maximum 50MB allowed.'
        : (err.message || 'Video upload rejected');
      return res.status(400).json({ error: message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const url = await uploadBufferToCloudinary(req.file.buffer, 'goviralads/plan-videos', 'video');
    return res.status(200).json({ url });
  } catch (err) {
    console.error('[PLAN VIDEO UPLOAD] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// Multer config for progress icons (smaller size limit)
const iconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 }, // 500KB max for icons
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only PNG, SVG, JPG, WebP allowed for icons.'));
  }
});

// Upload buffer to Cloudinary (progress-icons folder)
const uploadIconToCloudinary = (buffer, mimetype) => {
  return new Promise((resolve, reject) => {
    if (!cloudinaryConfigured) {
      return reject(new Error('Cloudinary not configured'));
    }
    
    const resourceType = mimetype === 'image/svg+xml' ? 'raw' : 'image';
    
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'goviralads/progress-icons',
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            url: result.secure_url,
            publicId: result.public_id
          });
        }
      }
    );
    uploadStream.end(buffer);
  });
};

app.post('/admin/progress-icons/upload', authenticateJWT, requireAdmin, iconUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const name = req.body.name?.trim();
    if (!name) {
      return res.status(400).json({ error: 'Icon name is required' });
    }
    
    console.log('[ICON UPLOAD] Processing:', name, req.file.mimetype, req.file.size, 'bytes');
    
    // Upload to Cloudinary
    const { url, publicId } = await uploadIconToCloudinary(req.file.buffer, req.file.mimetype);
    
    // Save to database
    const icon = new ProgressIconLibrary({
      name,
      url,
      publicId,
      uploadedBy: req.user.id,
    });
    
    await icon.save();
    
    console.log('[ICON UPLOAD] Success:', icon._id, url);
    
    return res.status(201).json({
      success: true,
      icon: {
        _id: icon._id.toString(),
        name: icon.name,
        url: icon.url,
        createdAt: icon.createdAt,
      },
    });
  } catch (err) {
    console.error('[ICON UPLOAD] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/client');
const adminRoutes = require('./routes/admin');
const adminSubscriptionRoutes = require('./routes/adminSubscriptions');
const adminEmployeeRoutes = require('./routes/adminEmployees');

// Import task service for automatic progress updates
const { updateTaskProgressAutomatically, calculateProgressFromTimeline } = require('./services/taskService');
const { startReminderScheduler } = require('./services/reminderService');
const reminderScheduler = require('./services/reminderScheduler');
const { Task } = require('./models/Task');
const User = require('./models/User');
const LegalPage = require('./models/LegalPage');
const Settings = require('./models/Settings');
const UserSubscription = require('./models/UserSubscription');
const Notification = require('./models/Notification');
const { Category } = require('./models/Category');
const OfficeConfig = require('./models/OfficeConfig');
const { createNotification, NOTIFICATION_TYPES } = require('./services/notificationService');

app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'GoViral Backend' });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// CHAT MEDIA (Phase 1) — safe capability diagnostic for the R2 media
// foundation. Exposes ONLY booleans + limits: never credentials, account
// ID, or bucket name. Performs no R2 network call and no writes.
app.get('/health/media', (_req, res) => {
  try {
    const mediaStorage = require('./services/mediaStorageService');
    res.status(200).json(mediaStorage.getCapabilities());
  } catch (err) {
    res.status(200).json({ enabled: false, configured: false, error: 'unavailable' });
  }
});

app.use('/auth', authRoutes);
app.use('/client', clientRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/subscriptions', adminSubscriptionRoutes);
app.use('/admin/employees', adminEmployeeRoutes);

// Initialize default legal pages
async function ensureLegalPages() {
  try {
    await LegalPage.ensureDefaults();
    console.log('Legal pages initialized');
  } catch (err) {
    console.error('Failed to initialize legal pages:', err.message);
  }
}

// Public legal pages endpoint (no auth required)
app.get('/public/legal/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const page = await LegalPage.findOne({ slug, isPublished: true });
    
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    
    res.json({
      slug: page.slug,
      title: page.title,
      content: page.content,
      lastUpdated: page.lastUpdated,
      metaDescription: page.metaDescription,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch page' });
  }
});

// Get all legal pages (for footer links)
app.get('/public/legal', async (_req, res) => {
  try {
    const pages = await LegalPage.find({ isPublished: true }).select('slug title');
    res.json({ pages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

// Public branding endpoint (no auth required)
app.get('/public/branding', async (_req, res) => {
  try {
    // Find the first admin user to get branding
    const admin = await User.findOne({ role: 'ADMIN', isDeleted: false });
    if (admin && admin.branding) {
      res.json({
        appName: admin.branding.appName || 'Go Viral Ads',
        logoUrl: admin.branding.logoUrl || '',
        tagline: admin.branding.tagline || '',
        accentColor: admin.branding.accentColor || '#6366f1',
        secondaryColor: admin.branding.secondaryColor || '#22c55e',
      });
    } else {
      res.json({
        appName: 'Go Viral Ads',
        logoUrl: '',
        tagline: '',
        accentColor: '#6366f1',
        secondaryColor: '#22c55e',
      });
    }
  } catch (err) {
    res.json({
      appName: 'Go Viral Ads',
      logoUrl: '',
      tagline: '',
      accentColor: '#6366f1',
      secondaryColor: '#22c55e',
    });
  }
});

// Public agency contact info endpoint (no auth required)
app.get('/public/agency-info', async (_req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({
      agencyName: settings.agencyName || '',
      agencyAddress: settings.agencyAddress || '',
      supportEmail: settings.supportEmail || '',
      phoneNumber: settings.phoneNumber || '',
      whatsappNumber: settings.whatsappNumber || '',
      websiteUrl: settings.websiteUrl || '',
      logoUrl: settings.logoUrl || '',
      socialLinks: settings.socialLinks || {},
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch agency info' });
  }
});

// ============================================================
// PUBLIC MARKETPLACE ENDPOINTS (no auth required)
// These return ONLY data safe for unauthenticated visitors.
// Never expose private client data, SELECTED plans, or internal fields.
// ============================================================

// GET /public/plans - Public marketplace plan listing (PUBLIC visibility only)
app.get('/public/plans', async (req, res) => {
  try {
    const { categoryId, search, sort } = req.query;

    let query = {
      isListedInPlans: true,
      clientId: null,
      isActivePlan: true,
      visibility: 'PUBLIC'
    };

    if (categoryId && categoryId !== 'ALL') {
      query.categoryId = categoryId;
    }

    let plansQuery = Task.find(query)
      .populate('categoryId', 'name icon color slug');

    switch (sort) {
      case 'price_low':
        plansQuery = plansQuery.sort({ creditCost: 1 });
        break;
      case 'price_high':
        plansQuery = plansQuery.sort({ creditCost: -1 });
        break;
      case 'newest':
      default:
        plansQuery = plansQuery.sort({ createdAt: -1 });
    }

    const allPlans = await plansQuery.exec();

    let filteredPlans = allPlans;
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      filteredPlans = filteredPlans.filter(p =>
        p.title?.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower)
      );
    }

    return res.status(200).json({
      plans: filteredPlans.map((p) => ({
        id: p._id.toString(),
        title: p.title,
        description: p.description,
        creditCost: p.creditCost,
        featureImage: p.featureImage,
        planMedia: p.planMedia,
        offerPrice: p.offerPrice,
        originalPrice: p.originalPrice,
        countdownEndDate: p.countdownEndDate,
        quantity: p.showQuantityToClient ? p.quantity : null,
        showCreditsToClient: p.showCreditsToClient,
        progressTarget: p.progressTarget,
        categoryId: p.categoryId ? p.categoryId._id.toString() : null,
        categoryName: p.categoryId ? p.categoryId.name : null,
        categoryIcon: p.categoryId ? p.categoryId.icon : null,
        categoryColor: p.categoryId ? p.categoryId.color : null,
        publicNotes: p.publicNotes,
        createdAt: p.createdAt,
        requireLink: p.requireLink || false,
        requireCustomInput: p.requireCustomInput || false,
        customInputLabel: p.customInputLabel || '',
        customInputPlaceholder: p.customInputPlaceholder || '',
      })),
    });
  } catch (err) {
    console.error('Public marketplace error:', err);
    return res.status(500).json({ error: 'Failed to retrieve marketplace plans' });
  }
});

// GET /public/plans/:planId - Public plan detail (PUBLIC visibility only)
app.get('/public/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;

    const plan = await Task.findById(planId)
      .populate('categoryId', 'name icon color slug')
      .exec();

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (!plan.isListedInPlans || plan.clientId !== null) {
      return res.status(404).json({ error: 'Plan not available' });
    }

    if (!plan.isActivePlan) {
      return res.status(404).json({ error: 'Plan not available' });
    }

    // PUBLIC visibility only — no SELECTED access for unauthenticated users
    const visibility = plan.visibility || 'PUBLIC';
    if (visibility !== 'PUBLIC') {
      return res.status(404).json({ error: 'Plan not available' });
    }

    return res.status(200).json({
      plan: {
        id: plan._id.toString(),
        title: plan.title,
        description: plan.description,
        creditCost: plan.creditCost,
        featureImage: plan.featureImage,
        planMedia: plan.planMedia,
        offerPrice: plan.offerPrice,
        originalPrice: plan.originalPrice,
        countdownEndDate: plan.countdownEndDate,
        quantity: plan.showQuantityToClient ? plan.quantity : null,
        showQuantityToClient: plan.showQuantityToClient,
        showCreditsToClient: plan.showCreditsToClient,
        progressTarget: plan.progressTarget,
        progressMode: plan.progressMode,
        milestones: plan.milestones,
        categoryId: plan.categoryId ? plan.categoryId._id.toString() : null,
        categoryName: plan.categoryId ? plan.categoryId.name : null,
        categoryIcon: plan.categoryId ? plan.categoryId.icon : null,
        categoryColor: plan.categoryId ? plan.categoryId.color : null,
        publicNotes: plan.publicNotes,
        createdAt: plan.createdAt,
        requireLink: plan.requireLink || false,
        requireCustomInput: plan.requireCustomInput || false,
        customInputLabel: plan.customInputLabel || '',
        customInputPlaceholder: plan.customInputPlaceholder || '',
      },
    });
  } catch (err) {
    console.error('Public plan detail error:', err);
    return res.status(500).json({ error: 'Failed to retrieve plan' });
  }
});

// GET /public/categories - Active categories for marketplace (PUBLIC visibility only)
app.get('/public/categories', async (_req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ order: 1, name: 1 })
      .exec();

    const categoryCounts = await Task.aggregate([
      { $match: { isListedInPlans: true, clientId: null, isActivePlan: { $ne: false }, visibility: 'PUBLIC' } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } }
    ]);

    const countMap = {};
    categoryCounts.forEach(c => {
      if (c._id) countMap[c._id.toString()] = c.count;
    });

    const uncategorizedCount = await Task.countDocuments({
      isListedInPlans: true,
      clientId: null,
      isActivePlan: { $ne: false },
      visibility: 'PUBLIC',
      categoryId: null
    });

    return res.status(200).json({
      categories: [
        {
          id: 'ALL',
          name: 'All',
          icon: '🏠',
          color: '#6366f1',
          slug: 'all',
          planCount: categoryCounts.reduce((sum, c) => sum + c.count, 0) + uncategorizedCount
        },
        ...categories.map(c => ({
          id: c._id.toString(),
          name: c.name,
          slug: c.slug,
          icon: c.icon,
          image: c.image,
          color: c.color,
          description: c.description,
          planCount: countMap[c._id.toString()] || 0,
        }))
      ],
    });
  } catch (err) {
    console.error('Public categories error:', err);
    return res.status(500).json({ error: 'Failed to retrieve categories' });
  }
});

// GET /public/header-nav - Public admin-configurable header navigation (no auth required)
// Returns ONLY enabled items with non-empty titles, sorted by order, max 4.
// Lightweight single-query endpoint — no plan lookups, safe for logged-out visitors.
app.get('/public/header-nav', async (_req, res) => {
  try {
    const config = await OfficeConfig.getConfig();
    const items = (config.headerNavItems || [])
      .filter(item => item.isEnabled && item.title && item.title.trim() !== '')
      .sort((a, b) => a.order - b.order)
      .slice(0, 4)
      .map(item => ({
        id: item.id,
        title: item.title.trim(),
        content: item.content || '',
        link: item.link || ''
      }));
    return res.status(200).json({ items });
  } catch (err) {
    // Never block the public header — an empty list simply hides the navigation row
    return res.status(200).json({ items: [] });
  }
});

// GET /public/office-config - Public office config + featured plans (PUBLIC visibility only)
app.get('/public/office-config', async (_req, res) => {
  try {
    const config = await OfficeConfig.getConfig();

    // PUBLIC visibility only — no SELECTED filtering (no user to check against)
    const visibilityFilter = { visibility: 'PUBLIC' };

    const activeBanners = config.banners
      .filter(b => b.isActive)
      .sort((a, b) => a.order - b.order);

    const enabledSections = config.sections
      .filter(s => s.isEnabled)
      .sort((a, b) => a.order - b.order);

    let featuredPlans = [];
    if (config.featuredPlansConfig.selectionMode === 'manual' && config.featuredPlansConfig.manualPlanIds.length > 0) {
      featuredPlans = await Task.find({
        _id: { $in: config.featuredPlansConfig.manualPlanIds },
        isListedInPlans: true,
        isActivePlan: true,
        clientId: null,
        ...visibilityFilter
      }).select('_id title description offerPrice originalPrice creditCost planMedia featureImage isFeatured').limit(config.featuredPlansConfig.displayCount);
    } else {
      featuredPlans = await Task.find({
        isListedInPlans: true,
        isActivePlan: true,
        clientId: null,
        isFeatured: true,
        ...visibilityFilter
      }).select('_id title description offerPrice originalPrice creditCost planMedia featureImage isFeatured').sort({ createdAt: -1 }).limit(config.featuredPlansConfig.displayCount);

      if (featuredPlans.length < config.featuredPlansConfig.displayCount) {
        const remaining = config.featuredPlansConfig.displayCount - featuredPlans.length;
        const existingIds = featuredPlans.map(p => p._id);
        const morePlans = await Task.find({
          _id: { $nin: existingIds },
          isListedInPlans: true,
          isActivePlan: true,
          clientId: null,
          ...visibilityFilter
        }).select('_id title description offerPrice originalPrice creditCost planMedia featureImage isFeatured').sort({ createdAt: -1 }).limit(remaining);
        featuredPlans = [...featuredPlans, ...morePlans];
      }
    }

    return res.status(200).json({
      config: {
        pageTitle: config.pageTitle,
        banners: activeBanners,
        bannerAutoRotate: config.bannerAutoRotate,
        bannerRotateInterval: config.bannerRotateInterval,
        sections: enabledSections,
        featuredPlansConfig: {
          displayCount: config.featuredPlansConfig.displayCount,
          showSeeAllButton: config.featuredPlansConfig.showSeeAllButton,
          seeAllButtonText: config.featuredPlansConfig.seeAllButtonText
        },
        seeMoreButtonConfig: config.seeMoreButtonConfig,
        updatesSectionConfig: config.updatesSectionConfig,
        requirementsSectionConfig: config.requirementsSectionConfig
      },
      featuredPlans: featuredPlans.map(p => ({
        id: p._id.toString(),
        title: p.title,
        description: p.description,
        offerPrice: p.offerPrice,
        originalPrice: p.originalPrice,
        creditCost: p.creditCost,
        planMedia: p.planMedia,
        featureImage: p.featureImage,
        isFeatured: p.isFeatured
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch office config' });
  }
});

// Fallback for unknown routes
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await connectToDatabase();
    await ensureMainAdminSeed();
    await ensureTestClient();  // Create test client user for development
    await ensureClientWallets();
        await ensureLegalPages();
    // await runPhase2SafetyChecks();
    // await runPhase3SafetyChecks(); // Temporarily disabled for auth testing
    
    // Start automatic progress updates
    startAutomaticProgressUpdates();
    
    // Start email reminder scheduler
    startReminderScheduler();
      
    // Start reminder schedulers
    reminderScheduler.startSchedulers();
    
    // Expire stale subscriptions every 60 minutes
    startSubscriptionExpiryJob();

    // Send subscription expiry reminders every 12 hours
    startSubscriptionReminderJob();
    
    app.listen(PORT, () => {
      console.log('Backend live');
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

// Expire subscriptions whose expiresAt has passed
function startSubscriptionExpiryJob() {
  const Wallet = require('./models/Wallet');
  const { WalletTransaction, TRANSACTION_TYPES } = require('./models/WalletTransaction');
  const { createNotification } = require('./services/notificationService');
  const expireSubscriptions = async () => {
    try {
      // 1. Expire UserSubscription records (legacy)
      const result = await UserSubscription.updateMany(
        { isActive: true, expiresAt: { $lt: new Date() } },
        { $set: { isActive: false, creditsRemaining: 0 } }
      );
      if (result.modifiedCount > 0) {
        console.log(`[EXPIRY] Expired ${result.modifiedCount} subscription(s)`);
      }

      // 2. Reset wallet.subscriptionCredits for expired subscriptions
      // B2: Include $ne: null to catch wallets with null expiry that shouldn't have active credits
      // B1: Create ledger entry + notification for each expired wallet
      const now = new Date();
      const expiredWallets = await Wallet.find({
        subscriptionExpiresAt: { $lt: now, $ne: null },
        subscriptionCredits: { $gt: 0 },
      }).exec();

      for (const wallet of expiredWallets) {
        const expiredCredits = wallet.subscriptionCredits || 0;

        // B1: Create ledger entry for credit expiry
        try {
          await WalletTransaction.create({
            walletId: wallet._id,
            type: TRANSACTION_TYPES.SUBSCRIPTION_EXPIRED,
            amount: 0,
            credits: -expiredCredits,
            description: `Subscription credits expired (${expiredCredits} credits)`,
            referenceId: null,
          });
        } catch (txErr) {
          console.error('[EXPIRY] Failed to create ledger entry:', txErr.message);
        }

        // B1: Notify client about expiry
        try {
          await createNotification({
            recipientId: wallet.clientId,
            title: 'Subscription Credits Expired',
            message: `Your ${expiredCredits} subscription credits have expired. Please recharge to continue.`,
            relatedEntity: { entityType: 'WALLET', entityId: wallet._id },
          });
        } catch (notifErr) {
          console.error('[EXPIRY] Notification error:', notifErr.message);
        }

        // Reset credits
        wallet.subscriptionCredits = 0;
        await wallet.save();
      }

      if (expiredWallets.length > 0) {
        console.log(`[EXPIRY] Reset subscriptionCredits on ${expiredWallets.length} wallet(s)`);
      }
    } catch (err) {
      console.error('[EXPIRY] Subscription expiry job error:', err.message);
    }
  };

  // Run immediately on startup, then every 60 minutes
  expireSubscriptions();
  setInterval(expireSubscriptions, 60 * 60 * 1000);
  console.log('Subscription expiry job started (every 60 minutes)');
}

// Configurable subscription renewal reminder job
// Runs every 12 hours. Sends before-expiry and after-expiry reminders
// based on admin-configured Settings.subscriptionReminders.
// Idempotency guaranteed by ReminderLog unique reminderKey index.
function startSubscriptionReminderJob() {
  const { ReminderLog, REMINDER_STATUS } = require('./models/ReminderLog');
  const Wallet = require('./models/Wallet');

  const sendReminders = async () => {
    try {
      // 1. Load admin-configured reminder settings
      const settings = await Settings.getSettings();
      const config = settings.subscriptionReminders || {};

      if (!config.enabled) {
        console.log('[REMINDER] Subscription reminders disabled');
        return;
      }

      const inAppEnabled = config.inAppEnabled !== false;
      const emailEnabled = config.emailEnabled !== false;
      if (!inAppEnabled && !emailEnabled) {
        console.log('[REMINDER] All reminder channels disabled');
        return;
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let totalSent = 0;

      // Helper: build a ±18h calendar-day window around a target date.
      // This ensures a 12-hourly scheduler cannot miss a date regardless of run time.
      const buildWindow = (targetDate) => ({
        start: new Date(targetDate.getTime() - 6 * 60 * 60 * 1000),  // -6h
        end:   new Date(targetDate.getTime() + 30 * 60 * 60 * 1000), // +30h
      });

      // Helper: resolve placeholders in custom message templates
      // Unknown placeholders remain as harmless plain text (no code execution)
      const resolvePlaceholders = (template, values) => {
        if (!template || typeof template !== 'string') return template;
        return template
          .replace(/\[CLIENT_NAME\]/g, values.clientName || 'Valued Client')
          .replace(/\[PLAN_NAME\]/g, values.planName || 'Your Plan')
          .replace(/\[EXPIRY_DATE\]/g, values.expiryDate || 'soon')
          .replace(/\[CREDITS\]/g, values.credits || '0')
          .replace(/\[DAYS\]/g, String(values.days ?? ''))
          .replace(/\[RENEW_URL\]/g, values.renewUrl || '');
      };

      // Existing renewal URL — same as used in notificationService.js
      const clientUrl = process.env.CLIENT_URL || 'https://goviralads.com';
      const renewUrl = clientUrl + '/wallet?scrollToSubscription=true';

      // 2. BEFORE-EXPIRY reminders
      if (config.beforeExpiry && config.beforeExpiry.enabled && Array.isArray(config.beforeExpiry.days)) {
        for (const days of config.beforeExpiry.days) {
          if (!Number.isInteger(days) || days < 0) continue;

          const targetDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
          const { start, end } = buildWindow(targetDate);

          // Find wallets whose subscription expires on this target calendar day
          const wallets = await Wallet.find({
            subscriptionExpiresAt: { $gt: start, $lte: end },
          }).exec();

          for (const wallet of wallets) {
            try {
              // Find the matching UserSubscription for reminderKey (subscriptionId)
              const userSub = await UserSubscription.findOne({
                userId: wallet.clientId,
                planId: wallet.currentPlanId,
              }).sort({ createdAt: -1 }).exec();

              if (!userSub) continue;

              const reminderKey = `${userSub._id}-before-${days}`;

              // Idempotency: skip if already sent (persistent DB check)
              const existing = await ReminderLog.findOne({ reminderKey }).exec();
              if (existing) continue;

              // Authoritative check: is this subscription still the active one?
              // If Wallet.subscriptionExpiresAt has been reset by renewal, this wallet
              // would not match the query above. But double-check UserSubscription state.
              if (userSub.isActive === false) continue;

              const expiryDateStr = new Date(wallet.subscriptionExpiresAt).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
              });

              // Build placeholder values for custom message resolution
              const clientDoc = await User.findById(wallet.clientId).select('identifier email').lean().exec();
              const clientName = clientDoc ? (clientDoc.identifier || clientDoc.email || 'Valued Client') : 'Valued Client';
              const placeholderVals = {
                clientName,
                planName: userSub.planName || 'Your Plan',
                expiryDate: expiryDateStr,
                credits: String(userSub.creditsRemaining ?? wallet.subscriptionCredits ?? 0),
                days,
                renewUrl,
              };

              // Read custom message templates (if admin configured them)
              const customMsg = (config.messages && config.messages.beforeExpiry) || {};

              // Resolve title: custom template or hardcoded production default
              let title;
              if (customMsg.inAppTitle) {
                title = resolvePlaceholders(customMsg.inAppTitle, placeholderVals);
              } else if (days === 0) {
                title = 'Your plan expires today';
              } else {
                title = `Your plan expires in ${days} day${days !== 1 ? 's' : ''}`;
              }

              // Resolve message: custom template or hardcoded production default
              let message;
              if (customMsg.inAppMessage) {
                message = resolvePlaceholders(customMsg.inAppMessage, placeholderVals);
              } else if (days === 0) {
                message = `Your plan "${userSub.planName}" expires today. Renew now to avoid interruption.`;
              } else {
                message = `Your plan "${userSub.planName}" expires in ${days} day${days !== 1 ? 's' : ''} (${expiryDateStr}). Renew now to continue uninterrupted service.`;
              }

              // Resolve custom email subject/body (passed through to notificationService)
              const customEmailSubject = customMsg.emailSubject
                ? resolvePlaceholders(customMsg.emailSubject, placeholderVals)
                : undefined;
              const customEmailBody = customMsg.emailBody
                ? resolvePlaceholders(customMsg.emailBody, placeholderVals)
                : undefined;

              // Determine channel
              let channel = 'BOTH';
              if (!inAppEnabled && emailEnabled) channel = 'EMAIL';
              else if (inAppEnabled && !emailEnabled) channel = 'IN_APP';

              // Send via existing notification infrastructure
              if (inAppEnabled) {
                await createNotification({
                  recipientId: wallet.clientId,
                  title,
                  message,
                  type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING,
                  relatedEntity: { entityType: 'SUBSCRIPTION', entityId: userSub._id },
                  notifyByEmail: emailEnabled,
                  // Fix existing data gap: pass real values for email template
                  planName: userSub.planName,
                  expiryDate: expiryDateStr,
                  // Custom email overrides (undefined = use existing defaults)
                  customEmailSubject,
                  customEmailBody,
                });
              }

              // Log for idempotency
              await ReminderLog.create({
                recipientId: wallet.clientId,
                subscriptionId: userSub._id,
                reminderKey,
                daysOffset: days,
                direction: 'before',
                status: REMINDER_STATUS.SENT,
                channel,
                sentAt: new Date(),
              });

              totalSent++;
              console.log(`[REMINDER] Before-expiry (${days}d) sent to ${wallet.clientId} for plan "${userSub.planName}"`);
            } catch (subErr) {
              if (subErr.code === 11000) {
                // Duplicate key — scheduler race — safe to skip
                continue;
              }
              console.error(`[REMINDER] Before-expiry error for wallet ${wallet._id}:`, subErr.message);
            }
          }
        }
      }

      // 3. AFTER-EXPIRY reminders
      if (config.afterExpiry && config.afterExpiry.enabled && Array.isArray(config.afterExpiry.days)) {
        for (const days of config.afterExpiry.days) {
          if (!Number.isInteger(days) || days < 0) continue;

          const targetDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
          const { start, end } = buildWindow(targetDate);

          // Find wallets whose subscription expired on this target calendar day
          const wallets = await Wallet.find({
            subscriptionExpiresAt: { $gt: start, $lte: end },
          }).exec();

          for (const wallet of wallets) {
            try {
              // PRIMARY PROTECTION: If the wallet's subscription has been renewed
              // (subscriptionExpiresAt reset to a future date), this wallet would NOT
              // match the query above. But verify UserSubscription state as backup.
              const userSub = await UserSubscription.findOne({
                userId: wallet.clientId,
                planId: wallet.currentPlanId,
              }).sort({ createdAt: -1 }).exec();

              if (!userSub) continue;

              // If user has an active subscription, they renewed — skip after-expiry reminders
              if (userSub.isActive === true) continue;

              const reminderKey = `${userSub._id}-after-${days}`;

              // Idempotency: skip if already sent
              const existing = await ReminderLog.findOne({ reminderKey }).exec();
              if (existing) continue;

              const expiryDateStr = new Date(wallet.subscriptionExpiresAt).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
              });

              // Build placeholder values for custom message resolution
              const clientDoc = await User.findById(wallet.clientId).select('identifier email').lean().exec();
              const clientName = clientDoc ? (clientDoc.identifier || clientDoc.email || 'Valued Client') : 'Valued Client';
              const placeholderVals = {
                clientName,
                planName: userSub.planName || 'Your Plan',
                expiryDate: expiryDateStr,
                credits: String(userSub.creditsRemaining ?? wallet.subscriptionCredits ?? 0),
                days,
                renewUrl,
              };

              // Read custom message templates (if admin configured them)
              const customMsg = (config.messages && config.messages.afterExpiry) || {};

              // Resolve title: custom template or hardcoded production default
              let title;
              if (customMsg.inAppTitle) {
                title = resolvePlaceholders(customMsg.inAppTitle, placeholderVals);
              } else if (days === 0) {
                title = 'Your plan has expired';
              } else {
                title = `Your plan expired ${days} day${days !== 1 ? 's' : ''} ago`;
              }

              // Resolve message: custom template or hardcoded production default
              let message;
              if (customMsg.inAppMessage) {
                message = resolvePlaceholders(customMsg.inAppMessage, placeholderVals);
              } else if (days === 0) {
                message = `Your plan "${userSub.planName}" has expired (${expiryDateStr}). Renew now to restore your credits.`;
              } else {
                message = `Your plan "${userSub.planName}" expired ${days} day${days !== 1 ? 's' : ''} ago (${expiryDateStr}). Renew now to restore your credits.`;
              }

              // Resolve custom email subject/body (passed through to notificationService)
              const customEmailSubject = customMsg.emailSubject
                ? resolvePlaceholders(customMsg.emailSubject, placeholderVals)
                : undefined;
              const customEmailBody = customMsg.emailBody
                ? resolvePlaceholders(customMsg.emailBody, placeholderVals)
                : undefined;

              let channel = 'BOTH';
              if (!inAppEnabled && emailEnabled) channel = 'EMAIL';
              else if (inAppEnabled && !emailEnabled) channel = 'IN_APP';

              if (inAppEnabled) {
                await createNotification({
                  recipientId: wallet.clientId,
                  title,
                  message,
                  type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING,
                  relatedEntity: { entityType: 'SUBSCRIPTION', entityId: userSub._id },
                  notifyByEmail: emailEnabled,
                  // Fix existing data gap: pass real values for email template
                  planName: userSub.planName,
                  expiryDate: expiryDateStr,
                  // Custom email overrides (undefined = use existing defaults)
                  customEmailSubject,
                  customEmailBody,
                });
              }

              await ReminderLog.create({
                recipientId: wallet.clientId,
                subscriptionId: userSub._id,
                reminderKey,
                daysOffset: days,
                direction: 'after',
                status: REMINDER_STATUS.SENT,
                channel,
                sentAt: new Date(),
              });

              totalSent++;
              console.log(`[REMINDER] After-expiry (${days}d) sent to ${wallet.clientId} for plan "${userSub.planName}"`);
            } catch (subErr) {
              if (subErr.code === 11000) continue;
              console.error(`[REMINDER] After-expiry error for wallet ${wallet._id}:`, subErr.message);
            }
          }
        }
      }

      if (totalSent > 0) {
        console.log(`[REMINDER] Subscription reminder cycle complete. ${totalSent} reminder(s) sent.`);
      }
    } catch (err) {
      console.error('[REMINDER] Subscription reminder job error:', err.message);
    }
  };

  // Run immediately on startup, then every 12 hours
  sendReminders();
  setInterval(sendReminders, 12 * 60 * 60 * 1000);
  console.log('Subscription reminder job started (configurable, every 12 hours)');
}

// Function to update progress for all AUTO tasks
async function updateAllAutoProgress() {
  try {
    // Find all tasks with progressMode AUTO and status not completed/cancelled
    const tasks = await Task.find({
      progressMode: 'AUTO',
      status: { $nin: ['COMPLETED', 'CANCELLED'] },
      progress: { $lt: 80 }  // Only update tasks with progress less than 80%
    });
    
    console.log(`Found ${tasks.length} tasks to update progress for`);
    
    for (const task of tasks) {
      try {
        await updateTaskProgressAutomatically(task._id);
      } catch (error) {
        console.error(`Error updating progress for task ${task._id}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error in updateAllAutoProgress:', error.message);
  }
}

// Function to start automatic progress updates
function startAutomaticProgressUpdates() {
  // Update progress immediately when server starts
  updateAllAutoProgress();
  
  // Then update every 10 minutes (600000 milliseconds)
  setInterval(updateAllAutoProgress, 10 * 60 * 1000);
  
  console.log('Automatic progress updates started (every 10 minutes)');
}

start();
