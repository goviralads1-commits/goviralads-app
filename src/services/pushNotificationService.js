// Push Notification Service using Firebase Admin SDK
// Firebase Admin is initialized in server.js - we just use it here
const admin = require('firebase-admin');
const DeviceToken = require('../models/DeviceToken');

// Check if Firebase Admin is initialized (done in server.js)
const isFirebaseReady = () => {
  const ready = admin.apps && admin.apps.length > 0;
  if (!ready) {
    console.error('[Push] Firebase Admin SDK is NOT initialized');
    console.error('[Push] Check server.js startup logs for initialization errors');
  }
  return ready;
};

/**
 * Send push notification to a specific user
 * @param {string} userId - User ID to send notification to
 * @param {object} notification - { title, body }
 * @param {object} data - Additional data payload
 */
const sendToUser = async (userId, notification, data = {}) => {
  console.log('[Push] ========== SEND NOTIFICATION ==========');
  console.log('[Push] Recipient userId:', userId);
  console.log('[Push] Notification:', notification);
  
  if (!isFirebaseReady()) {
    console.error('[Push] ❌ Cannot send - Firebase not initialized');
    return { success: false, reason: 'firebase_not_initialized' };
  }

  try {
    // Get all active device tokens for user
    const tokens = await DeviceToken.getActiveTokensForUser(userId);
    
    if (!tokens || tokens.length === 0) {
      console.log(`[Push] ❌ No device tokens found for user ${userId}`);
      return { success: false, reason: 'no_tokens' };
    }

    const tokenStrings = tokens.map(t => t.token);
    console.log(`[Push] Found ${tokenStrings.length} device token(s)`);
    
    // Ensure ALL data values are strings (FCM requirement for web)
    const stringifiedData = {};
    for (const [key, value] of Object.entries(data)) {
      stringifiedData[key] = String(value);
    }
    
    // Build FCM message
    const message = {
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: stringifiedData,
      webpush: {
        notification: {
          title: notification.title,
          body: notification.body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          requireInteraction: true
        },
        fcm_options: {
          link: stringifiedData.url || '/support'
        }
      },
      tokens: tokenStrings
    };

    console.log('[Push] Sending FCM message...');
    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`[Push] ✅ Sent: ${response.successCount} success, ${response.failureCount} failed`);
    
    // Handle failed tokens (remove invalid ones)
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          console.log(`[Push] Token ${idx} failed:`, errorCode, resp.error?.message);
          // Remove invalid tokens
          if (errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered') {
            failedTokens.push(tokenStrings[idx]);
          }
        }
      });
      
      if (failedTokens.length > 0) {
        await DeviceToken.updateMany(
          { token: { $in: failedTokens } },
          { $set: { isActive: false } }
        );
        console.log(`[Push] Deactivated ${failedTokens.length} invalid tokens`);
      }
    }

    console.log('[Push] ========== SEND COMPLETE ==========');
    return { 
      success: response.successCount > 0, 
      successCount: response.successCount,
      failureCount: response.failureCount
    };
  } catch (error) {
    console.error('[Push] ❌ Error sending notification:', error);
    return { success: false, reason: 'error', error: error.message };
  }
};

/**
 * Send push notification for new chat message
 * @param {string} recipientUserId - User to notify
 * @param {string} senderName - Name of message sender
 * @param {string} taskTitle - Task title
 * @param {string} taskId - Task ID for deep linking
 * @param {string} messagePreview - Short preview of message
 */
const sendMessageNotification = async (recipientUserId, senderName, taskTitle, taskId, messagePreview) => {
  console.log('[Push] sendMessageNotification called:', { recipientUserId, senderName, taskTitle, taskId });
  
  const safePreview = (messagePreview || '[Attachment]').substring(0, 80);
  const notification = {
    title: 'New Message - Go Viral Ads',
    body: `${senderName}: ${safePreview.length >= 80 ? safePreview.substring(0, 77) + '...' : safePreview}`
  };
  
  const data = {
    type: 'chat',
    taskId: String(taskId),
    taskTitle: String(taskTitle),
    url: `/support?taskId=${taskId}`
  };

  return sendToUser(recipientUserId, notification, data);
};

/**
 * Send push notification for approval request
 * @param {string} recipientUserId - User to notify
 * @param {string} taskTitle - Task title
 * @param {string} taskId - Task ID
 * @param {string} approvalTitle - Approval question
 */
const sendApprovalNotification = async (recipientUserId, taskTitle, taskId, approvalTitle) => {
  console.log('[Push] sendApprovalNotification called:', { recipientUserId, taskTitle, taskId });
  
  const notification = {
    title: 'Approval Required - Go Viral Ads',
    body: `${taskTitle}: ${approvalTitle}`
  };
  
  const data = {
    type: 'approval_request',
    taskId: String(taskId),
    taskTitle: String(taskTitle),
    url: `/support?taskId=${taskId}`
  };

  return sendToUser(recipientUserId, notification, data);
};

module.exports = {
  sendToUser,
  sendMessageNotification,
  sendApprovalNotification,
  isFirebaseReady
};
