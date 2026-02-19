require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

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
app.use(express.json());
app.use(morgan('dev'));

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
        appName: admin.branding.appName || 'TaskFlow Pro',
        logoUrl: admin.branding.logoUrl || '',
        tagline: admin.branding.tagline || '',
        accentColor: admin.branding.accentColor || '#6366f1',
        secondaryColor: admin.branding.secondaryColor || '#22c55e',
      });
    } else {
      res.json({
        appName: 'TaskFlow Pro',
        logoUrl: '',
        tagline: '',
        accentColor: '#6366f1',
        secondaryColor: '#22c55e',
      });
    }
  } catch (err) {
    res.json({
      appName: 'TaskFlow Pro',
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

    app.listen(PORT, () => {
      console.log('Backend live');
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
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
