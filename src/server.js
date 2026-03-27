require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

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
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper: upload a single file buffer to Cloudinary, returns secure_url
const uploadBufferToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'goviralads/chat',
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
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
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Upload all files to Cloudinary in parallel
    const urls = await Promise.all(
      req.files.map(f => uploadBufferToCloudinary(f.buffer))
    );

    return res.status(200).json({ urls });
  } catch (err) {
    console.error('[UPLOAD] Cloudinary upload error:', err.message);
    return res.status(500).json({ error: 'Upload failed' });
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
