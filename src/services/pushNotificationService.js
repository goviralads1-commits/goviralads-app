// Push Notification Service using Firebase Admin SDK
const admin = require('firebase-admin');
const DeviceToken = require('../models/DeviceToken');

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) return;
  
  // Firebase Admin requires a service account JSON
  // Set FIREBASE_SERVICE_ACCOUNT env var with the JSON string
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!serviceAccountJson) {
    console.log('[Push] Firebase service account not configured - push notifications disabled');
    return;
  }
  
  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
    console.log('[Push] Firebase Admin SDK initialized');
  } catch (error) {
    console.error('[Push] Failed to initialize Firebase:', error.message);
  }
};

// Initialize on module load
initializeFirebase();

/**
 * Send push notification to a specific user
 * @param {string} userId - User ID to send notification to
 * @param {object} notification - { title, body }
 * @param {object} data - Additional data payload
 */
const sendToUser = async (userId, notification, data = {}) => {
  if (!firebaseInitialized) {
    console.log('[Push] Firebase not initialized, skipping notification');
    return { success: false, reason: 'firebase_not_initialized' };
  }

  try {
    // Get all active device tokens for user
    const tokens = await DeviceToken.getActiveTokensForUser(userId);
    
    if (!tokens || tokens.length === 0) {
      console.log(`[Push] No device tokens for user ${userId}`);
      return { success: false, reason: 'no_tokens' };
    }

    const tokenStrings = tokens.map(t => t.token);
    
    // Send to all devices
    const message = {
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK' // For mobile apps
      },
      tokens: tokenStrings
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`[Push] Sent to user ${userId}: ${response.successCount} success, ${response.failureCount} failed`);
    
    // Handle failed tokens (remove invalid ones)
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
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

    return { 
      success: response.successCount > 0, 
      successCount: response.successCount,
      failureCount: response.failureCount
    };
  } catch (error) {
    console.error('[Push] Error sending notification:', error);
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
  const notification = {
    title: 'New Message - Go Viral Ads',
    body: `${senderName}: ${messagePreview.length > 80 ? messagePreview.substring(0, 77) + '...' : messagePreview}`
  };
  
  const data = {
    type: 'chat',
    taskId: taskId,
    taskTitle: taskTitle,
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
  const notification = {
    title: 'Approval Required',
    body: `${taskTitle}: ${approvalTitle}`
  };
  
  const data = {
    type: 'approval_request',
    taskId: taskId,
    taskTitle: taskTitle
  };

  return sendToUser(recipientUserId, notification, data);
};

module.exports = {
  sendToUser,
  sendMessageNotification,
  sendApprovalNotification,
  initializeFirebase
};
