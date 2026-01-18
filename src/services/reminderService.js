/**
 * Automatic Email Reminder Service
 * Sends automatic reminders for upcoming task deadlines
 * 
 * Admin configurable settings:
 * - Days before deadline to send reminder (e.g., 7, 3, 1, 0)
 * - Number of reminders per day
 * - Custom reminder message
 */

const { Task } = require('../models/Task');
const User = require('../models/User');
const emailService = require('./emailService');
const { createNotification, NOTIFICATION_TYPES, ENTITY_TYPES } = require('./notificationService');

// Default reminder settings (can be customized via admin)
const DEFAULT_SETTINGS = {
  reminderDays: [7, 3, 1, 0], // Days before deadline
  maxRemindersPerDay: 2,
  customMessage: 'Your task deadline is approaching. Please ensure timely completion.',
  enabled: true
};

// Track sent reminders to avoid duplicates (in-memory, should use DB in production)
const sentReminders = new Map();

/**
 * Get admin reminder settings from database or use defaults
 */
const getReminderSettings = async () => {
  try {
    // Try to get admin with settings
    const admin = await User.findOne({ role: 'ADMIN' }).select('settings').exec();
    if (admin?.settings?.reminders) {
      return { ...DEFAULT_SETTINGS, ...admin.settings.reminders };
    }
  } catch (err) {
    console.error('[REMINDER] Failed to get settings:', err.message);
  }
  return DEFAULT_SETTINGS;
};

/**
 * Calculate days until deadline
 */
const daysUntilDeadline = (deadline) => {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diffTime = deadlineDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Generate reminder key for deduplication
 */
const getReminderKey = (taskId, daysLeft) => {
  const today = new Date().toISOString().split('T')[0];
  return `${taskId}-${daysLeft}-${today}`;
};

/**
 * Check and send reminders for a single task
 */
const processTaskReminder = async (task, settings, clientAppUrl) => {
  if (!task.deadline || !task.clientId) return;

  const daysLeft = daysUntilDeadline(task.deadline);
  
  // Check if this day is in the reminder schedule
  if (!settings.reminderDays.includes(daysLeft)) return;

  const reminderKey = getReminderKey(task._id, daysLeft);
  
  // Check if already sent today
  if (sentReminders.has(reminderKey)) return;

  try {
    // Get client info
    const client = await User.findById(task.clientId).select('identifier profile.email').exec();
    if (!client) return;

    const email = client.profile?.email || client.identifier;
    if (!email || !email.includes('@')) return;

    // Prepare reminder data
    const reminderData = {
      taskTitle: task.title,
      deadline: new Date(task.deadline).toLocaleDateString(),
      daysLeft,
      customMessage: settings.customMessage,
      taskUrl: `${clientAppUrl}/tasks/${task._id}`
    };

    // Send email
    const emailResult = await emailService.sendTaskReminder(email, reminderData);
    
    // Create in-app notification
    await createNotification({
      recipientId: task.clientId,
      type: NOTIFICATION_TYPES.TASK_REMINDER,
      title: `Task Reminder: ${daysLeft === 0 ? 'Due Today!' : `${daysLeft} days left`}`,
      message: `"${task.title}" ${daysLeft === 0 ? 'is due today!' : `is due in ${daysLeft} days`}`,
      relatedEntity: {
        entityType: ENTITY_TYPES.TASK,
        entityId: task._id
      }
    });

    // Mark as sent
    sentReminders.set(reminderKey, true);
    
    console.log(`[REMINDER] Sent for task ${task._id} (${daysLeft} days left)`);
    
    return { success: true, taskId: task._id, daysLeft, emailResult };
  } catch (err) {
    console.error(`[REMINDER] Failed for task ${task._id}:`, err.message);
    return { success: false, taskId: task._id, error: err.message };
  }
};

/**
 * Run the reminder check for all active tasks
 */
const runReminderCheck = async () => {
  console.log('[REMINDER] Starting reminder check...');
  
  const settings = await getReminderSettings();
  
  if (!settings.enabled) {
    console.log('[REMINDER] Reminders disabled, skipping');
    return;
  }

  if (!emailService.isConfigured()) {
    console.log('[REMINDER] Email not configured, skipping');
    return;
  }

  const clientAppUrl = process.env.CLIENT_APP_URL || 'http://localhost:3001';

  // Get all active tasks with deadlines
  const maxDays = Math.max(...settings.reminderDays);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + maxDays + 1);

  const tasks = await Task.find({
    status: { $in: ['ACTIVE', 'IN_PROGRESS', 'PENDING_APPROVAL'] },
    deadline: { 
      $exists: true, 
      $ne: null,
      $gte: new Date(), // Not past deadline
      $lte: cutoffDate  // Within reminder window
    },
    clientId: { $exists: true, $ne: null }
  }).exec();

  console.log(`[REMINDER] Found ${tasks.length} tasks to check`);

  const results = [];
  for (const task of tasks) {
    const result = await processTaskReminder(task, settings, clientAppUrl);
    if (result) results.push(result);
  }

  const sent = results.filter(r => r?.success).length;
  console.log(`[REMINDER] Check complete. ${sent}/${results.length} reminders sent`);
  
  return results;
};

/**
 * Clear old reminder keys (run daily)
 */
const cleanupReminderKeys = () => {
  const today = new Date().toISOString().split('T')[0];
  for (const [key] of sentReminders) {
    if (!key.includes(today)) {
      sentReminders.delete(key);
    }
  }
};

/**
 * Schedule automatic reminder checks
 * Runs every hour between 8am-8pm
 */
let reminderInterval = null;

const startReminderScheduler = () => {
  if (reminderInterval) {
    console.log('[REMINDER] Scheduler already running');
    return;
  }

  // Initial cleanup
  cleanupReminderKeys();

  // Run immediately on start
  runReminderCheck();

  // Run every 3 hours
  const THREE_HOURS = 3 * 60 * 60 * 1000;
  reminderInterval = setInterval(() => {
    const hour = new Date().getHours();
    // Only run between 8am and 8pm
    if (hour >= 8 && hour <= 20) {
      cleanupReminderKeys();
      runReminderCheck();
    }
  }, THREE_HOURS);

  console.log('[REMINDER] Scheduler started (runs every 3 hours, 8am-8pm)');
};

const stopReminderScheduler = () => {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log('[REMINDER] Scheduler stopped');
  }
};

module.exports = {
  runReminderCheck,
  startReminderScheduler,
  stopReminderScheduler,
  getReminderSettings,
  DEFAULT_SETTINGS
};
