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
  TASK_MESSAGE: 'TASK_MESSAGE',
  TASK_REMINDER: 'TASK_REMINDER',
  TASK_OVERDUE: 'TASK_OVERDUE',
  TASK_COMPLETED: 'TASK_COMPLETED',
  MILESTONE_REACHED: 'MILESTONE_REACHED',
  FINAL_DELIVERY_READY: 'FINAL_DELIVERY_READY',
  WALLET_ADJUSTED: 'WALLET_ADJUSTED',
  TICKET_CREATED: 'TICKET_CREATED',
  TICKET_REPLIED: 'TICKET_REPLIED',
  TICKET_STATUS_CHANGED: 'TICKET_STATUS_CHANGED',
  NEW_NOTICE: 'NEW_NOTICE',
  NEW_UPDATE: 'NEW_UPDATE',
  NEW_REQUIREMENT: 'NEW_REQUIREMENT',
  NEW_PROMOTION: 'NEW_PROMOTION',
  NOTICE_RESPONSE: 'NOTICE_RESPONSE',
  RESPONSE_SUBMITTED: 'RESPONSE_SUBMITTED',
  // Order notifications
  NEW_ORDER: 'NEW_ORDER',
  ORDER_APPROVED: 'ORDER_APPROVED',
  ORDER_REJECTED: 'ORDER_REJECTED',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  // Subscription notifications
  SUBSCRIPTION_EXPIRING: 'SUBSCRIPTION_EXPIRING',
  SUBSCRIPTION_REQUEST_SUBMITTED: 'SUBSCRIPTION_REQUEST_SUBMITTED',
  SUBSCRIPTION_REQUEST_APPROVED: 'SUBSCRIPTION_REQUEST_APPROVED',
  SUBSCRIPTION_REQUEST_REJECTED: 'SUBSCRIPTION_REQUEST_REJECTED',
});

const ENTITY_TYPES = Object.freeze({
  RECHARGE_REQUEST: 'RECHARGE_REQUEST',
  TASK: 'TASK',
  WALLET: 'WALLET',
  TICKET: 'TICKET',
  NOTICE: 'NOTICE',
  ORDER: 'ORDER',
  SUBSCRIPTION: 'SUBSCRIPTION',
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
    const adminDashboardUrl = process.env.ADMIN_URL || 'https://admin.goviralads.com';
    const type = notifData.type || 'GENERAL';
    
    // Use specific templates for known types
    if (type === NOTIFICATION_TYPES.RECHARGE_REQUEST_SUBMITTED) {
      // Admin email for recharge request
      console.log('[NOTIF EMAIL] Sending RECHARGE_REQUEST_SUBMITTED email to admin:', recipientEmail);
      await emailService.send({
        to: recipientEmail,
        subject: `💰 New Recharge Request - Go Viral Ads`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
              <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 32px; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 24px;">💰 New Recharge Request</h1>
              </div>
              <div style="padding: 32px;">
                <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">${notifData.title || 'New Recharge Request'}</h2>
                <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">${notifData.message || 'A client has submitted a recharge request.'}</p>
                <a href="${adminDashboardUrl}/recharges" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(245,158,11,0.3);">
                  📋 View Requests
                </a>
              </div>
              <div style="padding: 16px 32px; background: #f8fafc; text-align: center;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">Go Viral Ads Admin</p>
              </div>
            </div>
          </body>
          </html>
        `
      });
    } else if (type === NOTIFICATION_TYPES.TASK_PURCHASED) {
      // Admin email for task purchase
      console.log('[NOTIF EMAIL] Sending TASK_PURCHASED email to admin:', recipientEmail);
      await emailService.send({
        to: recipientEmail,
        subject: `🛒 New Task Purchased - Go Viral Ads`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
              <div style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); padding: 32px; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 24px;">🛒 New Task Purchased</h1>
              </div>
              <div style="padding: 32px;">
                <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">${notifData.title || 'New Task Purchased'}</h2>
                <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">${notifData.message || 'A client has purchased a new task.'}</p>
                <a href="${adminDashboardUrl}/tasks" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: #fff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(139,92,246,0.3);">
                  📋 View Tasks
                </a>
              </div>
              <div style="padding: 16px 32px; background: #f8fafc; text-align: center;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">Go Viral Ads Admin</p>
              </div>
            </div>
          </body>
          </html>
        `
      });
    } else if (type === NOTIFICATION_TYPES.RECHARGE_APPROVED || type === NOTIFICATION_TYPES.RECHARGE_REJECTED) {
      await emailService.sendWalletUpdate(recipientEmail, {
        amount: type === NOTIFICATION_TYPES.RECHARGE_APPROVED ? '+' : '-',
        description: notifData.message || notifData.title,
        newBalance: 'Check dashboard',
        dashboardUrl
      });
    } else if (type === NOTIFICATION_TYPES.TASK_APPROVED || type === NOTIFICATION_TYPES.TASK_CREATED) {
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
    } else if (type === NOTIFICATION_TYPES.ORDER_APPROVED || type === NOTIFICATION_TYPES.ORDER_REJECTED) {
      // Order-specific email templates
      const isApproved = type === NOTIFICATION_TYPES.ORDER_APPROVED;
      const icon = isApproved ? '✅' : '❌';
      const statusText = isApproved ? 'Approved' : 'Rejected';
      const gradient = isApproved ? '#22c55e, #16a34a' : '#ef4444, #dc2626';
      const bodyText = isApproved 
        ? 'Your order has been approved and work has started. You can track progress inside your dashboard.'
        : 'Your order has been rejected. If applicable, your wallet has been refunded. Please check your dashboard for details.';
      
      console.log('[NOTIF EMAIL] Sending ORDER email:', { type, to: recipientEmail });
      
      await emailService.send({
        to: recipientEmail,
        subject: `${icon} Order ${statusText} - Go Viral Ads`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
              <div style="background: linear-gradient(135deg, ${gradient}); padding: 32px; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 24px;">Order ${statusText} ${icon}</h1>
              </div>
              <div style="padding: 32px;">
                <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">Order ${statusText}</h2>
                <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">${bodyText}</p>
                <a href="${dashboardUrl}/orders" style="display: inline-block; padding: 14px 32px; background: ${isApproved ? '#22c55e' : '#6366f1'}; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
                  View Orders
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
    } else if (type === NOTIFICATION_TYPES.TASK_MESSAGE) {
      // Task discussion message email
      console.log('[NOTIF EMAIL] Sending TASK_MESSAGE email:', { to: recipientEmail, title: notifData.title });
      const taskUrl = notifData.taskUrl || (dashboardUrl + '/tasks');
      
      // Build messages preview HTML
      let messagesHtml = '';
      if (notifData.recentMessages && notifData.recentMessages.length > 0) {
        messagesHtml = `
          <div style="margin: 0 0 24px;">
            <p style="color: #64748b; font-size: 12px; font-weight: 600; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.05em;">Recent Messages</p>
            ${notifData.recentMessages.map(m => `
              <div style="padding: 12px 16px; border-radius: 12px; margin-bottom: 8px; ${m.sender === 'CLIENT' ? 'background: #f0f9ff; border-left: 3px solid #3b82f6;' : 'background: #f5f3ff; border-left: 3px solid #6366f1;'}">
                <p style="font-size: 11px; color: ${m.sender === 'CLIENT' ? '#3b82f6' : '#6366f1'}; font-weight: 600; margin: 0 0 4px;">${m.sender === 'CLIENT' ? '👤 Client' : '🔧 Admin'}</p>
                <p style="color: #334155; font-size: 14px; line-height: 1.5; margin: 0;">${m.text}</p>
              </div>
            `).join('')}
          </div>
        `;
      }
      
      await emailService.send({
        to: recipientEmail,
        subject: `💬 New Message on Your Task - Go Viral Ads`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
              <div style="background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 32px; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 24px;">💬 New Message</h1>
              </div>
              <div style="padding: 32px;">
                <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">${notifData.title || 'New Message'}</h2>
                ${messagesHtml}
                <a href="${taskUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(99,102,241,0.3);">
                  💬 Open Chat
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
    } else if (type === NOTIFICATION_TYPES.FINAL_DELIVERY_READY) {
      // Final delivery ready email
      console.log('[NOTIF EMAIL] Sending FINAL_DELIVERY_READY email:', { to: recipientEmail, title: notifData.title });
      const taskUrl = notifData.taskUrl || (dashboardUrl + '/tasks');
      
      await emailService.send({
        to: recipientEmail,
        subject: `📦 Delivery Ready! - Go Viral Ads`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
              <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 32px; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 24px;">📦 Delivery Ready!</h1>
              </div>
              <div style="padding: 32px;">
                <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">${notifData.title || 'Your delivery is ready'}</h2>
                <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">${notifData.message || 'Your task has a delivery ready for download.'}</p>
                <a href="${taskUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #10b981, #059669); color: #fff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(16,185,129,0.3);">
                  📥 View Task
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
    } else if (type === NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING) {
      // Subscription expiry reminder email to client
      console.log('[NOTIF EMAIL] Sending SUBSCRIPTION_EXPIRING email to client:', recipientEmail);
      const renewUrl = (dashboardUrl + '/wallet?scrollToSubscription=true');
      const expiryDate = notifData.expiryDate || 'soon';
      const planName = notifData.planName || 'Your subscription';
      await emailService.send({
        to: recipientEmail,
        subject: `⏳ Your Plan is Expiring Soon — Go Viral Ads`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
              <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 32px; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 24px;">⏳ Plan Expiring Soon</h1>
              </div>
              <div style="padding: 32px;">
                <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">Your Plan is Expiring Soon</h2>
                <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 12px; padding: 16px; margin: 0 0 24px;">
                  <p style="color: #92400e; font-size: 15px; font-weight: 600; margin: 0 0 6px;">${planName}</p>
                  <p style="color: #92400e; font-size: 14px; margin: 0;">Expires: ${expiryDate}</p>
                </div>
                <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">${notifData.message || 'Renew your plan now to continue uninterrupted service.'}</p>
                <a href="${renewUrl}" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(245,158,11,0.3);">
                  🔄 Renew Plan
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
    } else if (type === NOTIFICATION_TYPES.NOTICE_RESPONSE) {
      // Admin email for client response
      console.log('[NOTIF EMAIL] Sending NOTICE_RESPONSE email to admin:', recipientEmail);
      const responseDisplay = notifData.metadata?.response !== undefined ? String(notifData.metadata.response) : 'Response submitted';
      const noticeTitle = notifData.metadata?.noticeTitle || 'Notice';
      
      await emailService.send({
        to: recipientEmail,
        subject: `📝 Client Response Received - Go Viral Ads`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
              <div style="background: linear-gradient(135deg, #0ea5e9, #0284c7); padding: 32px; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 24px;">📝 Client Response</h1>
              </div>
              <div style="padding: 32px;">
                <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">${notifData.title || 'Client Response Received'}</h2>
                <div style="background: #f0f9ff; border-left: 4px solid #0ea5e9; border-radius: 8px; padding: 16px; margin: 0 0 24px;">
                  <p style="color: #64748b; font-size: 12px; font-weight: 600; margin: 0 0 8px; text-transform: uppercase;">Notice</p>
                  <p style="color: #1e293b; font-size: 14px; margin: 0 0 12px;">${noticeTitle}</p>
                  <p style="color: #64748b; font-size: 12px; font-weight: 600; margin: 0 0 8px; text-transform: uppercase;">Response</p>
                  <p style="color: #1e293b; font-size: 16px; font-weight: 700; margin: 0;">${responseDisplay}</p>
                </div>
                <a href="${adminDashboardUrl}/notices" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #0ea5e9, #0284c7); color: #fff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 12px rgba(14,165,233,0.3);">
                  💼 View Responses
                </a>
              </div>
              <div style="padding: 16px 32px; background: #f8fafc; text-align: center;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">Go Viral Ads Admin</p>
              </div>
            </div>
          </body>
          </html>
        `
      });
} else if (type === NOTIFICATION_TYPES.SUBSCRIPTION_REQUEST_SUBMITTED) {
      // Admin email for new subscription request
      console.log('[NOTIF EMAIL] Sending SUBSCRIPTION_REQUEST_SUBMITTED email to admin:', recipientEmail);
      await emailService.send({
        to: recipientEmail,
        subject: `📋 New Subscription Request - Go Viral Ads`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
              <div style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); padding: 32px; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 24px;">📋 New Subscription Request</h1>
              </div>
              <div style="padding: 32px;">
                <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">${notifData.title || 'New Subscription Request'}</h2>
                <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">${notifData.message || 'A client has submitted a subscription request.'}</p>
                <a href="${adminDashboardUrl}/subscription-requests" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: #fff; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(139,92,246,0.3);">
                  📋 View Requests
                </a>
              </div>
              <div style="padding: 16px 32px; background: #f8fafc; text-align: center;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0;">Go Viral Ads Admin</p>
              </div>
            </div>
          </body>
          </html>
        `
      });
} else if (type === NOTIFICATION_TYPES.SUBSCRIPTION_REQUEST_APPROVED || type === NOTIFICATION_TYPES.SUBSCRIPTION_REQUEST_REJECTED) {
      // Client email for subscription request decision
      const isApproved = type === NOTIFICATION_TYPES.SUBSCRIPTION_REQUEST_APPROVED;
      const icon = isApproved ? '✅' : '❌';
      const statusText = isApproved ? 'Approved' : 'Rejected';
      const gradient = isApproved ? '#22c55e, #16a34a' : '#ef4444, #dc2626';
      const bodyText = isApproved 
        ? 'Your subscription has been approved! Your credits have been added to your wallet.'
        : 'Unfortunately, your subscription request was rejected. Please check your dashboard for details.';
      
      console.log('[NOTIF EMAIL] Sending SUBSCRIPTION_REQUEST email:', { type, to: recipientEmail });
      
      await emailService.send({
        to: recipientEmail,
        subject: `${icon} Subscription ${statusText} - Go Viral Ads`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
              <div style="background: linear-gradient(135deg, ${gradient}); padding: 32px; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 24px;">Subscription ${statusText} ${icon}</h1>
              </div>
              <div style="padding: 32px;">
                <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">Subscription ${statusText}</h2>
                <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">${bodyText}</p>
                <a href="${dashboardUrl}/wallet" style="display: inline-block; padding: 14px 32px; background: ${isApproved ? '#22c55e' : '#6366f1'}; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
                  View Wallet
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