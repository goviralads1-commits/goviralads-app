const cron = require('node-cron');
const Task = require('../models/Task');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const emailService = require('./emailService');

// Reminder Settings (stored in-memory, can be moved to DB later)
let reminderSettings = {
  taskDeadline: {
    enabled: true,
    daysBefore: 3,
    message: 'Your task deadline is approaching. Please complete it on time.'
  },
  taskOverdue: {
    enabled: true,
    message: 'This task is overdue. Please take immediate action.'
  },
  planExpiry: {
    enabled: true,
    daysBefore: 7,
    message: 'Your plan is about to expire. Renew to continue using the service.'
  }
};

// Get settings
const getSettings = () => reminderSettings;

// Update settings
const updateSettings = (newSettings) => {
  reminderSettings = { ...reminderSettings, ...newSettings };
  console.log('[REMINDER] Settings updated:', reminderSettings);
};

// 1) TASK DEADLINE REMINDER - Runs daily at 9 AM
const checkTaskDeadlines = async () => {
  if (!reminderSettings.taskDeadline.enabled) return;
  
  try {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + reminderSettings.taskDeadline.daysBefore);
    
    const tasks = await Task.find({
      mode: 'TASK',
      clientId: { $ne: null },
      deadline: {
        $gte: now,
        $lte: futureDate
      },
      status: { $nin: ['COMPLETE', 'CANCELLED'] }
    }).populate('clientId', 'identifier');
    
    console.log(`[REMINDER] Found ${tasks.length} tasks with upcoming deadlines`);
    
    for (const task of tasks) {
      if (!task.clientId || !task.clientId.identifier) continue;
      
      const daysLeft = Math.ceil((new Date(task.deadline) - now) / (1000 * 60 * 60 * 24));
      
      await emailService.sendTaskReminder(task.clientId.identifier, {
        taskTitle: task.title,
        deadline: new Date(task.deadline).toLocaleDateString(),
        daysLeft,
        customMessage: reminderSettings.taskDeadline.message,
        taskUrl: `http://localhost:5175/tasks/${task._id}`
      });
      
      console.log(`[REMINDER] Sent deadline reminder to ${task.clientId.identifier} for task ${task.title}`);
    }
  } catch (error) {
    console.error('[REMINDER] Error checking task deadlines:', error.message);
  }
};

// 2) TASK OVERDUE REMINDER - Runs daily at 10 AM
const checkOverdueTasks = async () => {
  if (!reminderSettings.taskOverdue.enabled) return;
  
  try {
    const now = new Date();
    
    const tasks = await Task.find({
      mode: 'TASK',
      clientId: { $ne: null },
      deadline: { $lt: now },
      status: { $nin: ['COMPLETE', 'CANCELLED'] }
    }).populate('clientId', 'identifier');
    
    console.log(`[REMINDER] Found ${tasks.length} overdue tasks`);
    
    // Get admin email
    const admin = await User.findOne({ role: 'ADMIN' });
    const adminEmail = admin?.identifier;
    
    for (const task of tasks) {
      if (!task.clientId || !task.clientId.identifier) continue;
      
      const daysOverdue = Math.ceil((now - new Date(task.deadline)) / (1000 * 60 * 60 * 24));
      
      // Send to client
      await emailService.sendTaskReminder(task.clientId.identifier, {
        taskTitle: task.title,
        deadline: new Date(task.deadline).toLocaleDateString(),
        daysLeft: -daysOverdue,
        customMessage: reminderSettings.taskOverdue.message,
        taskUrl: `http://localhost:5175/tasks/${task._id}`
      });
      
      // Send to admin
      if (adminEmail) {
        await emailService.sendOverdueAlert(adminEmail, {
          taskTitle: task.title,
          clientEmail: task.clientId.identifier,
          deadline: new Date(task.deadline).toLocaleDateString(),
          daysOverdue,
          taskUrl: `http://localhost:5173/tasks/${task._id}`
        });
      }
      
      console.log(`[REMINDER] Sent overdue alert for task ${task.title}`);
    }
  } catch (error) {
    console.error('[REMINDER] Error checking overdue tasks:', error.message);
  }
};

// 3) PLAN EXPIRY REMINDER - Runs daily at 8 AM
const checkPlanExpiry = async () => {
  if (!reminderSettings.planExpiry.enabled) return;
  
  try {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + reminderSettings.planExpiry.daysBefore);
    
    const tasks = await Task.find({
      mode: 'PLAN',
      clientId: { $ne: null },
      deadline: {
        $gte: now,
        $lte: futureDate
      },
      status: { $nin: ['COMPLETE', 'CANCELLED'] }
    }).populate('clientId', 'identifier');
    
    console.log(`[REMINDER] Found ${tasks.length} plans expiring soon`);
    
    for (const task of tasks) {
      if (!task.clientId || !task.clientId.identifier) continue;
      
      const daysLeft = Math.ceil((new Date(task.deadline) - now) / (1000 * 60 * 60 * 24));
      
      await emailService.sendTaskReminder(task.clientId.identifier, {
        taskTitle: `Plan: ${task.title}`,
        deadline: new Date(task.deadline).toLocaleDateString(),
        daysLeft,
        customMessage: reminderSettings.planExpiry.message,
        taskUrl: `http://localhost:5175/tasks/${task._id}`
      });
      
      console.log(`[REMINDER] Sent plan expiry reminder to ${task.clientId.identifier}`);
    }
  } catch (error) {
    console.error('[REMINDER] Error checking plan expiry:', error.message);
  }
};

// 4) Already handled in ticket reply endpoints, but we export the function
const sendTicketReplyEmail = async (ticket, replyMessage, recipientRole) => {
  try {
    const recipient = recipientRole === 'CLIENT' 
      ? await User.findById(ticket.clientId)
      : await User.findOne({ role: 'ADMIN' });
    
    if (!recipient) return;
    
    if (recipientRole === 'CLIENT') {
      await emailService.sendTicketReply(recipient.identifier, {
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        message: replyMessage,
        ticketUrl: `http://localhost:5175/tickets/${ticket._id}`
      });
    } else {
      const client = await User.findById(ticket.clientId);
      await emailService.sendClientReply(recipient.identifier, {
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        clientEmail: client?.identifier || 'Unknown',
        message: replyMessage,
        ticketUrl: `http://localhost:5173/tickets/${ticket._id}`
      });
    }
    
    console.log(`[REMINDER] Sent ticket reply email to ${recipient.identifier}`);
  } catch (error) {
    console.error('[REMINDER] Error sending ticket reply email:', error.message);
  }
};

// Start all schedulers
const startSchedulers = () => {
  console.log('[REMINDER] Starting reminder schedulers...');
  
  // Task deadline reminder - Daily at 9:00 AM
  cron.schedule('0 9 * * *', checkTaskDeadlines);
  
  // Task overdue reminder - Daily at 10:00 AM
  cron.schedule('0 10 * * *', checkOverdueTasks);
  
  // Plan expiry reminder - Daily at 8:00 AM
  cron.schedule('0 8 * * *', checkPlanExpiry);
  
  console.log('[REMINDER] Schedulers started successfully');
  console.log('[REMINDER] - Task deadlines: Daily at 9:00 AM');
  console.log('[REMINDER] - Task overdue: Daily at 10:00 AM');
  console.log('[REMINDER] - Plan expiry: Daily at 8:00 AM');
};

// Manual trigger for testing
const triggerNow = async (type) => {
  console.log(`[REMINDER] Manually triggering ${type} check...`);
  switch(type) {
    case 'deadline':
      await checkTaskDeadlines();
      break;
    case 'overdue':
      await checkOverdueTasks();
      break;
    case 'expiry':
      await checkPlanExpiry();
      break;
    default:
      console.log('[REMINDER] Unknown type');
  }
};

module.exports = {
  startSchedulers,
  triggerNow,
  sendTicketReplyEmail,
  getSettings,
  updateSettings
};
