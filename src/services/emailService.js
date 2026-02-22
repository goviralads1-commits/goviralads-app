/**
 * Email Notification Service
 * Uses Nodemailer with configurable SMTP (Gmail, Brevo, Zoho, etc.)
 * 
 * Environment Variables Required:
 * - SMTP_HOST (e.g., smtp.gmail.com, smtp-relay.brevo.com)
 * - SMTP_PORT (e.g., 587, 465)
 * - SMTP_USER (email or API key)
 * - SMTP_PASS (password or API key)
 * - SMTP_FROM (sender email)
 * - SMTP_FROM_NAME (sender name)
 */

const nodemailer = require('nodemailer');

// Create transporter with environment config
const createTransporter = () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587');
  const secure = port === 465;
  
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    // Gmail specific settings
    ...(host.includes('gmail') && {
      tls: { rejectUnauthorized: false }
    })
  });
};

// Check if email is configured
const isEmailConfigured = () => {
  const configured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!configured) {
    console.warn('[EMAIL CONFIG] ⚠️ SMTP not configured! Required env vars:');
    console.warn('[EMAIL CONFIG]   - SMTP_HOST (current:', process.env.SMTP_HOST || 'NOT SET', ')');
    console.warn('[EMAIL CONFIG]   - SMTP_PORT (current:', process.env.SMTP_PORT || 'NOT SET', ')');
    console.warn('[EMAIL CONFIG]   - SMTP_USER (current:', process.env.SMTP_USER ? 'SET' : 'NOT SET', ')');
    console.warn('[EMAIL CONFIG]   - SMTP_PASS (current:', process.env.SMTP_PASS ? 'SET' : 'NOT SET', ')');
  }
  return configured;
};

// Send email helper
const sendEmail = async ({ to, subject, html, text }) => {
  if (!isEmailConfigured()) {
    console.log('[EMAIL] SMTP not configured, skipping email send');
    return { success: false, reason: 'not_configured' };
  }
  
  try {
    const transporter = createTransporter();
    
    const info = await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'TaskFlow Pro'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to,
      subject,
      text: text || subject,
      html
    });
    
    console.log('[EMAIL] Sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL] Failed to send:', error.message);
    return { success: false, error: error.message };
  }
};

// ============================================
// EMAIL TEMPLATES
// ============================================

const templates = {
  // Welcome Email
  welcome: (data) => ({
    subject: `Welcome to ${data.appName || 'TaskFlow Pro'}!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Welcome! 🎉</h1>
          </div>
          <div style="padding: 32px;">
            <p style="color: #1e293b; font-size: 16px; margin: 0 0 16px;">Hi ${data.name || 'there'},</p>
            <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
              Your account has been created successfully. You can now access all features and start managing your tasks.
            </p>
            <a href="${data.loginUrl || '#'}" style="display: inline-block; padding: 14px 32px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
              Login to Your Account
            </a>
          </div>
          <div style="padding: 16px 32px; background: #f8fafc; text-align: center;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">${data.appName || 'TaskFlow Pro'}</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),
  
  // New Task Notification
  newTask: (data) => ({
    subject: `New Task: ${data.taskTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">New Task Assigned 📋</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">${data.taskTitle}</h2>
            ${data.description ? `<p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">${data.description}</p>` : ''}
            <div style="background: #f0fdf4; border-radius: 12px; padding: 16px; margin: 0 0 24px;">
              <p style="color: #15803d; font-size: 14px; margin: 0;"><strong>Status:</strong> ${data.status || 'Pending'}</p>
              ${data.deadline ? `<p style="color: #15803d; font-size: 14px; margin: 8px 0 0;"><strong>Deadline:</strong> ${data.deadline}</p>` : ''}
            </div>
            <a href="${data.taskUrl || '#'}" style="display: inline-block; padding: 14px 32px; background: #22c55e; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
              View Task
            </a>
          </div>
        </div>
      </body>
      </html>
    `
  }),
  
  // Task Reminder
  taskReminder: (data) => ({
    subject: `⏰ Reminder: ${data.taskTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Task Reminder ⏰</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">${data.taskTitle}</h2>
            <div style="background: #fef3c7; border-radius: 12px; padding: 16px; margin: 0 0 24px;">
              <p style="color: #92400e; font-size: 14px; margin: 0;">
                <strong>${data.daysLeft > 0 ? `${data.daysLeft} days remaining` : 'Due today!'}</strong>
              </p>
              <p style="color: #92400e; font-size: 14px; margin: 8px 0 0;">Deadline: ${data.deadline}</p>
            </div>
            <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
              ${data.customMessage || 'Don\'t forget to complete your task on time.'}
            </p>
            <a href="${data.taskUrl || '#'}" style="display: inline-block; padding: 14px 32px; background: #f59e0b; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
              View Task
            </a>
          </div>
        </div>
      </body>
      </html>
    `
  }),
  
  // Wallet Update
  walletUpdate: (data) => ({
    subject: `Wallet ${data.amount > 0 ? 'Credit' : 'Debit'}: ₹${Math.abs(data.amount)}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <div style="background: ${data.amount > 0 ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'}; padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Wallet ${data.amount > 0 ? 'Credited' : 'Debited'} 💰</h1>
          </div>
          <div style="padding: 32px;">
            <div style="text-align: center; margin: 0 0 24px;">
              <p style="font-size: 40px; font-weight: 800; color: ${data.amount > 0 ? '#22c55e' : '#ef4444'}; margin: 0;">
                ${data.amount > 0 ? '+' : ''}₹${data.amount}
              </p>
              <p style="color: #64748b; font-size: 14px; margin: 8px 0 0;">${data.description || 'Transaction'}</p>
            </div>
            <div style="background: #f8fafc; border-radius: 12px; padding: 16px;">
              <p style="color: #475569; font-size: 14px; margin: 0;"><strong>New Balance:</strong> ₹${data.newBalance}</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  }),
  
  // New Notice/Update
  newNotice: (data) => ({
    subject: `${data.type === 'REQUIREMENT' ? '📋 New Requirement' : '📢 New Update'}: ${data.title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <div style="background: ${data.type === 'REQUIREMENT' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'}; padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">${data.type === 'REQUIREMENT' ? 'Action Required' : 'New Update'}</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">${data.title}</h2>
            <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">${data.content}</p>
            ${data.responseRequired ? `
              <div style="background: #fef2f2; border-radius: 12px; padding: 16px; margin: 0 0 24px;">
                <p style="color: #dc2626; font-size: 14px; font-weight: 600; margin: 0;">⚠️ Your response is required</p>
              </div>
            ` : ''}
            <a href="${data.dashboardUrl || '#'}" style="display: inline-block; padding: 14px 32px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
              View Details
            </a>
          </div>
        </div>
      </body>
      </html>
    `
  }),
  
  // Ticket Reply
  ticketReply: (data) => ({
    subject: `Reply to Ticket #${data.ticketNumber}: ${data.subject}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">New Reply on Your Ticket</h1>
          </div>
          <div style="padding: 32px;">
            <p style="color: #64748b; font-size: 12px; margin: 0 0 8px;">Ticket #${data.ticketNumber}</p>
            <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 24px;">${data.subject}</h2>
            <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin: 0 0 24px;">
              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0;">${data.message}</p>
            </div>
            <a href="${data.ticketUrl || '#'}" style="display: inline-block; padding: 14px 32px; background: #8b5cf6; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
              View Full Thread
            </a>
          </div>
        </div>
      </body>
      </html>
    `
  }),
  
  // Client Reply (Notify Admin)
  clientReply: (data) => ({
    subject: `📩 Client Reply on Ticket #${data.ticketNumber}: ${data.subject}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Client Replied to Ticket</h1>
          </div>
          <div style="padding: 32px;">
            <p style="color: #64748b; font-size: 12px; margin: 0 0 8px;">Ticket #${data.ticketNumber} from ${data.clientEmail}</p>
            <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">${data.subject}</h2>
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; margin: 0 0 24px;">
              <p style="color: #92400e; font-size: 14px; line-height: 1.6; margin: 0;">${data.message}</p>
            </div>
            <a href="${data.ticketUrl || '#'}" style="display: inline-block; padding: 14px 32px; background: #f59e0b; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
              Reply to Client
            </a>
          </div>
        </div>
      </body>
      </html>
    `
  }),
  
  // Overdue Alert (Notify Admin)
  overdueAlert: (data) => ({
    subject: `🚨 Overdue Task: ${data.taskTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 32px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">🚨 Task Overdue</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 16px;">${data.taskTitle}</h2>
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; margin: 0 0 24px;">
              <p style="color: #dc2626; font-size: 14px; margin: 0;"><strong>Client:</strong> ${data.clientEmail}</p>
              <p style="color: #dc2626; font-size: 14px; margin: 8px 0 0;"><strong>Due Date:</strong> ${data.deadline}</p>
              <p style="color: #dc2626; font-size: 14px; margin: 8px 0 0;"><strong>Days Overdue:</strong> ${data.daysOverdue}</p>
            </div>
            <a href="${data.taskUrl || '#'}" style="display: inline-block; padding: 14px 32px; background: #ef4444; color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
              View Task
            </a>
          </div>
        </div>
      </body>
      </html>
    `
  })
};

// ============================================
// NOTIFICATION FUNCTIONS
// ============================================

const emailService = {
  isConfigured: isEmailConfigured,
  
  sendWelcome: async (to, data) => {
    const template = templates.welcome(data);
    return sendEmail({ to, ...template });
  },
  
  sendNewTask: async (to, data) => {
    const template = templates.newTask(data);
    return sendEmail({ to, ...template });
  },
  
  sendTaskReminder: async (to, data) => {
    const template = templates.taskReminder(data);
    return sendEmail({ to, ...template });
  },
  
  sendWalletUpdate: async (to, data) => {
    const template = templates.walletUpdate(data);
    return sendEmail({ to, ...template });
  },
  
  sendNewNotice: async (to, data) => {
    const template = templates.newNotice(data);
    return sendEmail({ to, ...template });
  },
  
  sendTicketReply: async (to, data) => {
    const template = templates.ticketReply(data);
    return sendEmail({ to, ...template });
  },
  
  sendClientReply: async (to, data) => {
    const template = templates.clientReply(data);
    return sendEmail({ to, ...template });
  },
  
  sendOverdueAlert: async (to, data) => {
    const template = templates.overdueAlert(data);
    return sendEmail({ to, ...template });
  },
  
  // Generic send
  send: sendEmail
};

module.exports = emailService;
