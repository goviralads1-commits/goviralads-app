/**
 * Email Notification Service
 * Uses Resend API for reliable email delivery
 * 
 * Environment Variables Required:
 * - RESEND_API_KEY (from resend.com dashboard)
 * - EMAIL_FROM (verified sender email, e.g., noreply@goviralads.com)
 * - EMAIL_FROM_NAME (sender display name)
 */

const { Resend } = require('resend');

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validate email format
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
};

// Check if email is configured
const isEmailConfigured = () => {
  const configured = !!process.env.RESEND_API_KEY;
  if (!configured) {
    console.error('[EMAIL CONFIG] ❌ RESEND NOT CONFIGURED! Emails will NOT be sent.');
    console.error('[EMAIL CONFIG]   Required environment variables:');
    console.error('[EMAIL CONFIG]   - RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ SET' : '❌ NOT SET');
    console.error('[EMAIL CONFIG]   - EMAIL_FROM:', process.env.EMAIL_FROM || '❌ NOT SET');
  }
  return configured;
};

// Create Resend client
let resendClient = null;
const getResendClient = () => {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
};

// Log config status on startup
const logEmailStatus = () => {
  console.log('[EMAIL SERVICE] ========================================');
  console.log('[EMAIL SERVICE] PRODUCTION EMAIL CONFIG VERIFICATION');
  console.log('[EMAIL SERVICE] ========================================');
  console.log('[EMAIL SERVICE] NODE_ENV:', process.env.NODE_ENV || 'not set');
  console.log('[EMAIL SERVICE] RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY);
  console.log('[EMAIL SERVICE] RESEND_API_KEY length:', process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.length : 0);
  console.log('[EMAIL SERVICE] EMAIL_FROM:', process.env.EMAIL_FROM || '❌ NOT SET (will use default)');
  console.log('[EMAIL SERVICE] EMAIL_FROM_NAME:', process.env.EMAIL_FROM_NAME || '❌ NOT SET (will use default)');
  
  if (isEmailConfigured()) {
    console.log('[EMAIL SERVICE] ✅ Resend API Configured - emails ENABLED');
  } else {
    console.log('[EMAIL SERVICE] ❌ Resend NOT Configured - emails DISABLED');
  }
  console.log('[EMAIL SERVICE] ========================================');
};

// Call on module load
logEmailStatus();

// Send email helper using Resend API
const sendEmail = async ({ to, subject, html, text }) => {
  console.log('[EMAIL SEND] ==========================================');
  console.log('[EMAIL SEND] SEND EMAIL ATTEMPT');
  console.log('[EMAIL SEND] ==========================================');
  console.log('[EMAIL SEND] Sending email to:', to);
  console.log('[EMAIL SEND] Subject:', subject);
  console.log('[EMAIL SEND] Using provider: Resend');
  console.log('[EMAIL SEND] From:', process.env.EMAIL_FROM || 'onboarding@resend.dev');
  console.log('[EMAIL SEND] RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY);
  
  // 1. Check Resend config
  if (!isEmailConfigured()) {
    console.error('[EMAIL SEND] ❌ FAILED: Resend not configured - RESEND_API_KEY missing');
    return { success: false, reason: 'resend_not_configured' };
  }
  
  // 2. Validate recipient email
  if (!isValidEmail(to)) {
    console.error('[EMAIL SEND] ❌ FAILED: Invalid recipient email:', to);
    return { success: false, reason: 'invalid_recipient_email', providedValue: to };
  }
  
  // 3. Attempt to send via Resend
  try {
    console.log('[EMAIL SEND] Config OK, calling Resend API...');
    
    const resend = getResendClient();
    const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    const fromName = process.env.EMAIL_FROM_NAME || 'Go Viral Ads';
    
    // DEBUG: Log full send parameters
    console.log('[EMAIL DEBUG] Pre-send details:', {
      to,
      from: `${fromName} <${fromEmail}>`,
      subject,
      environment: process.env.NODE_ENV,
      apiKeyPresent: !!process.env.RESEND_API_KEY,
      fromEmailVar: process.env.EMAIL_FROM,
      fromNameVar: process.env.EMAIL_FROM_NAME
    });
    
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html,
      text: text || subject
    });
    
    if (error) {
      console.error('[EMAIL SEND] ❌ RESEND API RETURNED ERROR!');
      console.error('[EMAIL SEND]   Error object:', JSON.stringify(error, null, 2));
      console.error('[EMAIL SEND]   Error message:', error.message);
      console.error('[EMAIL SEND]   Error name:', error.name);
      return { success: false, error: error.message, code: error.name };
    }
    
    console.log('[EMAIL SEND] ✅ SUCCESS! Email sent via Resend');
    console.log('[EMAIL SEND]   Message ID:', data?.id);
    console.log('[EMAIL SEND]   Full response:', JSON.stringify(data, null, 2));
    console.log('[EMAIL SEND] ==========================================');
    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error('[EMAIL SEND] ❌ EXCEPTION CAUGHT!');
    console.error('[EMAIL SEND]   Catch error:', error.message);
    console.error('[EMAIL SEND]   Stack:', error.stack);
    console.log('[EMAIL SEND] ==========================================');
    return { success: false, error: error.message };
  }
};

// ============================================
// EMAIL TEMPLATES
// ============================================

const templates = {
  // Welcome Email
  welcome: (data) => ({
    subject: `Welcome to ${data.appName || 'Go Viral Ads'}!`,
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
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">${data.appName || 'Go Viral Ads'}</p>
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
  isValidEmail: isValidEmail,
  
  sendWelcome: async (to, data) => {
    console.log('[EMAIL] sendWelcome called for:', to);
    const template = templates.welcome(data);
    return sendEmail({ to, ...template });
  },
  
  sendNewTask: async (to, data) => {
    console.log('[EMAIL] sendNewTask called for:', to);
    console.log('[EMAIL]   Task:', data.taskTitle);
    const template = templates.newTask(data);
    return sendEmail({ to, ...template });
  },
  
  sendTaskReminder: async (to, data) => {
    console.log('[EMAIL] sendTaskReminder called for:', to);
    const template = templates.taskReminder(data);
    return sendEmail({ to, ...template });
  },
  
  sendWalletUpdate: async (to, data) => {
    console.log('[EMAIL] sendWalletUpdate called for:', to);
    console.log('[EMAIL]   Amount:', data.amount, 'New Balance:', data.newBalance);
    const template = templates.walletUpdate(data);
    return sendEmail({ to, ...template });
  },
  
  sendNewNotice: async (to, data) => {
    console.log('[EMAIL] sendNewNotice called for:', to);
    const template = templates.newNotice(data);
    return sendEmail({ to, ...template });
  },
  
  sendTicketReply: async (to, data) => {
    console.log('[EMAIL] sendTicketReply called for:', to);
    const template = templates.ticketReply(data);
    return sendEmail({ to, ...template });
  },
  
  sendClientReply: async (to, data) => {
    console.log('[EMAIL] sendClientReply called for:', to);
    const template = templates.clientReply(data);
    return sendEmail({ to, ...template });
  },
  
  sendOverdueAlert: async (to, data) => {
    console.log('[EMAIL] sendOverdueAlert called for:', to);
    const template = templates.overdueAlert(data);
    return sendEmail({ to, ...template });
  },
  
  // Generic send
  send: sendEmail
};

module.exports = emailService;
