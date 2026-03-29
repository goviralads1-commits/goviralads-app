// Push Notification Service using Firebase Admin SDK
const admin = require('firebase-admin');
const DeviceToken = require('../models/DeviceToken');

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) return true;
  
  // Firebase Admin requires a service account JSON
  // Set FIREBASE_SERVICE_ACCOUNT env var with the JSON string
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!serviceAccountJson) {
    console.error('[Push] ❌ FIREBASE_SERVICE_ACCOUNT not set - push notifications DISABLED');
    console.error('[Push] To fix: Go to Firebase Console → Project Settings → Service Accounts → Generate new private key');
    console.error('[Push] Then add the FULL JSON as FIREBASE_SERVICE_ACCOUNT env var');
    return false;
  }
  
  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
    console.log('[Push] ✅ Firebase Admin SDK initialized successfully');
    console.log('[Push] Project ID:', serviceAccount.project_id);
    return true;
  } catch (error) {
    console.error('[Push] ❌ Failed to initialize Firebase:', error.message);
    if (error.message.includes('JSON')) {
      console.error('[Push] Check that FIREBASE_SERVICE_ACCOUNT is valid JSON');
    }
    return false;
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
  console.log('[Push] ========== SEND NOTIFICATION ==========');
  console.log('[Push] Recipient userId:', userId);
  console.log('[Push] Notification:', notification);
  
  if (!firebaseInitialized) {
    console.error('[Push] ❌ Firebase not initialized - cannot send');
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

// Check if Firebase is ready
const isFirebaseReady = () => firebaseInitialized;

module.exports = {
  sendToUser,
  sendMessageNotification,
  sendApprovalNotification,
  initializeFirebase,
  isFirebaseReady
};
