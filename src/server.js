require('dotenv').config();

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
const uploadBufferToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    if (!cloudinaryConfigured) {
      return reject(new Error('Cloudinary not configured - missing env vars'));
    }
    
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'goviralads/chat',
        resource_type: 'image',
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

// ============== PROGRESS ICON UPLOAD ENDPOINT ==============
const { requireAdmin } = require('./middleware/authorization');
const { ProgressIconLibrary } = require('./models/ProgressIconLibrary');

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

// Import task service for automatic progress updates
const { updateTaskProgressAutomatically, calculateProgressFromTimeline } = require('./services/taskService');
const { startReminderScheduler } = require('./services/reminderService');
const reminderScheduler = require('./services/reminderScheduler');
const { Task } = require('./models/Task');
const User = require('./models/User');
const LegalPage = require('./models/LegalPage');
const UserSubscription = require('./models/UserSubscription');
const Notification = require('./models/Notification');
const { createNotification, NOTIFICATION_TYPES } = require('./services/notificationService');

app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'GoViral Backend' });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.use('/auth', authRoutes);
app.use('/client', clientRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/subscriptions', adminSubscriptionRoutes);

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
      const now = new Date();
      const walletResult = await Wallet.updateMany(
        { subscriptionExpiresAt: { $lt: now }, subscriptionCredits: { $gt: 0 } },
        { $set: { subscriptionCredits: 0 } }
      );
      if (walletResult.modifiedCount > 0) {
        console.log(`[EXPIRY] Reset subscriptionCredits on ${walletResult.modifiedCount} wallet(s)`);
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

// Send reminders for subscriptions expiring in ≤2 days
function startSubscriptionReminderJob() {
  const sendReminders = async () => {
    try {
      const now = new Date();
      const in2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

      // Find all active subscriptions expiring within next 2 days
      const expiringSoon = await UserSubscription.find({
        isActive: true,
        expiresAt: { $gt: now, $lt: in2Days }
      }).exec();

      if (expiringSoon.length === 0) return;
      console.log(`[REMINDER] Found ${expiringSoon.length} subscription(s) expiring within 2 days`);

      for (const sub of expiringSoon) {
        try {
          // Dedup: skip if already sent a SUBSCRIPTION_EXPIRING notification in last 23 hours
          const alreadySent = await Notification.findOne({
            recipientId: sub.userId,
            type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING,
            'relatedEntity.entityId': sub._id,
            createdAt: { $gt: new Date(Date.now() - 23 * 60 * 60 * 1000) }
          }).exec();

          if (alreadySent) continue;

          const daysLeft = Math.ceil((new Date(sub.expiresAt) - now) / (1000 * 60 * 60 * 24));
          const isToday = daysLeft <= 0;
          const expiryDateStr = new Date(sub.expiresAt).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric'
          });

          const title = isToday
            ? `Your plan expires today`
            : `Your plan is expiring in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
          const message = isToday
            ? `Your plan "${sub.planName}" expires today. Renew now to avoid interruption.`
            : `Your plan "${sub.planName}" is expiring soon. Renew to continue services.`;

          await createNotification({
            recipientId: sub.userId,
            title,
            message,
            type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING,
            relatedEntity: {
              entityType: 'SUBSCRIPTION',
              entityId: sub._id
            },
            planName: sub.planName,
            expiryDate: expiryDateStr,
            notifyByEmail: true
          });

          console.log(`[REMINDER] Sent expiry reminder to user ${sub.userId} for plan "${sub.planName}"`);
        } catch (subErr) {
          console.error(`[REMINDER] Error processing sub ${sub._id}:`, subErr.message);
        }
      }
    } catch (err) {
      console.error('[REMINDER] Subscription reminder job error:', err.message);
    }
  };

  // Run immediately on startup, then every 12 hours
  sendReminders();
  setInterval(sendReminders, 12 * 60 * 60 * 1000);
  console.log('Subscription reminder job started (every 12 hours)');
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
