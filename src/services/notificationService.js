const Notification = require('../models/Notification');
const emailService = require('./emailService');
const User = require('../models/User');

const NOTIFICATION_TYPES = Object.freeze({
  RECHARGE_REQUEST_SUBMITTED: 'RECHARGE_REQUEST_SUBMITTED',
  RECHARGE_APPROVED: 'RECHARGE_APPROVED',
  RECHARGE_REJECTED: 'RECHARGE_REJECTED',
  TASK_PURCHASED: 'TASK_PURCHASED',
  TASK_APPROVED: 'TASK_APPROVED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  TASK_CREATED: 'TASK_CREATED',
  WALLET_ADJUSTED: 'WALLET_ADJUSTED',
  TICKET_CREATED: 'TICKET_CREATED',
  TICKET_REPLIED: 'TICKET_REPLIED',
  TICKET_STATUS_CHANGED: 'TICKET_STATUS_CHANGED',
  NEW_NOTICE: 'NEW_NOTICE',
  TASK_REMINDER: 'TASK_REMINDER',
});

const ENTITY_TYPES = Object.freeze({
  RECHARGE_REQUEST: 'RECHARGE_REQUEST',
  TASK: 'TASK',
  WALLET: 'WALLET',
  TICKET: 'TICKET',
  NOTICE: 'NOTICE',
});

async function getNotificationsForUser(userId, options = {}) {
  const { unreadOnly = false } = options;
  
  const query = { recipientId: userId };
  if (unreadOnly) {
    query.isRead = false;
  }
  
  return await Notification.find(query)
    .sort({ createdAt: -1 })
    .exec();
}

async function markNotificationAsRead(notificationId, userId) {
  const notification = await Notification.findOne({
    _id: notificationId,
    recipientId: userId
  }).exec();
  
  if (!notification) {
    throw new Error('Notification not found');
  }
  
  notification.isRead = true;
  notification.readAt = new Date();
  
  return await notification.save();
}

async function markAllNotificationsAsRead(userId) {
  const result = await Notification.updateMany(
    { recipientId: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  
  return result.nModified;
}

async function createNotification(notificationData) {
  const { notifyByEmail = false, ...notifData } = notificationData;
  
  // Create notification in database
  const notification = await Notification.create(notifData);
  
  // Log email trigger decision
  console.log(`[NOTIF] Created notification: ${notifData.type || 'GENERAL'} | notifyByEmail: ${notifyByEmail}`);
  
  // Trigger email if requested (async, non-blocking)
  if (notifyByEmail && notifData.recipientId) {
    console.log(`[NOTIF EMAIL] Email trigger requested for ${notifData.type} to recipient ${notifData.recipientId}`);
    triggerNotificationEmail(notifData).catch(err => {
      console.error('[NOTIF EMAIL] Error sending email (non-fatal):', err.message);
    });
  } else if (notifyByEmail && !notifData.recipientId) {
    console.log('[NOTIF EMAIL] Email requested but no recipientId provided - skipping');
  }
  
  return notification;
}

// Async email trigger helper
async function triggerNotificationEmail(notifData) {
  console.log('[NOTIF EMAIL] ====== EMAIL TRIGGER START ======');
  console.log('[NOTIF EMAIL] Type:', notifData.type);
  console.log('[NOTIF EMAIL] RecipientId:', notifData.recipientId);
  
  try {
    // Check if email is configured first
    if (!emailService.isConfigured()) {
      console.log('[NOTIF EMAIL] Resend not configured - skipping email');
      return;
    }
    
    // Fetch recipient email
    const user = await User.findById(notifData.recipientId).select('email identifier').exec();
    if (!user) {
      console.log('[NOTIF EMAIL] User not found:', notifData.recipientId);
      return;
    }
    
    const recipientEmail = user.email || user.identifier;
    console.log('[NOTIF EMAIL] Recipient email resolved:', recipientEmail);
    
    if (!emailService.isValidEmail(recipientEmail)) {
      console.log('[NOTIF EMAIL] Invalid recipient email:', recipientEmail);
      return;
    }
    
    // Build email based on notification type
    const dashboardUrl = process.env.CLIENT_URL || 'https://goviralads.com';
    const type = notifData.type || 'GENERAL';
    
    // Use specific templates for known types
    if (type === NOTIFICATION_TYPES.RECHARGE_APPROVED || type === NOTIFICATION_TYPES.RECHARGE_REJECTED) {
      await emailService.sendWalletUpdate(recipientEmail, {
        amount: type === NOTIFICATION_TYPES.RECHARGE_APPROVED ? '+' : '-',
        description: notifData.message || notifData.title,
        newBalance: 'Check dashboard',
        dashboardUrl
      });
    } else if (type === NOTIFICATION_TYPES.TASK_PURCHASED || type === NOTIFICATION_TYPES.TASK_APPROVED || type === NOTIFICATION_TYPES.TASK_CREATED) {
      await emailService.sendNewTask(recipientEmail, {
        taskTitle: notifData.title,
        description: notifData.message,
        taskUrl: dashboardUrl + '/tasks'
      });
    } else if (type === NOTIFICATION_TYPES.NEW_NOTICE) {
      await emailService.sendNewNotice(recipientEmail, {
        type: 'UPDATE',
        title: notifData.title,
        content: notifData.message,
        dashboardUrl
      });
    } else {
      // Generic notification email
      await emailService.send({
        to: recipientEmail,
        subject: `New Notification from Go Viral Ads`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
              <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 32px; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 24px;">New Notification</h1>
              </div>
              <div style="padding: 32px;">
                <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">${notifData.title || 'Notification'}</h2>
                <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">${notifData.message || ''}</p>
                <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 32px; background: #22c55e; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
                  Go to Dashboard
                </a>
              </div>
              <div style="padding: 16px 32px; background: #f8fafc; text-align: center;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">Go Viral Ads</p>
              </div>
            </div>
          </body>
          </html>
        `
      });
    }
    
    console.log('[NOTIF EMAIL] Email sent successfully to:', recipientEmail);
  } catch (err) {
    console.error('[NOTIF EMAIL] Failed to send email:', err.message);
  }
}

async function getUnreadCount(userId) {
  const count = await Notification.countDocuments({
    recipientId: userId,
    isRead: false
  }).exec();
  
  return count;
}

module.exports = {
  getNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createNotification,
  getUnreadCount,
  NOTIFICATION_TYPES,
  ENTITY_TYPES,
};