// Push Notification Service using Firebase Admin SDK
// Firebase Admin is initialized in server.js - we just use it here
const admin = require('firebase-admin');
const DeviceToken = require('../models/DeviceToken');
const User = require('../models/User');

// Check if Firebase Admin is initialized (done in server.js)
const isFirebaseReady = () => {
  const ready = admin.apps && admin.apps.length > 0;
  if (!ready) {
    console.error('[Push] ❌ Firebase Admin SDK is NOT initialized');
    console.error('[Push] Check server.js startup logs for initialization errors');
  }
  return ready;
};

/**
 * Get token counts for diagnostics
 */
const getTokenCounts = async () => {
  try {
    const adminCount = await DeviceToken.countDocuments({ role: 'admin', isActive: true });
    const clientCount = await DeviceToken.countDocuments({ role: 'client', isActive: true });
    console.log(`[Push] Token counts - Admin: ${adminCount}, Client: ${clientCount}`);
    return { adminCount, clientCount };
  } catch (err) {
    console.error('[Push] Error getting token counts:', err.message);
    return { adminCount: 0, clientCount: 0 };
  }
};

// ---------------------------------------------------------------------------
// Agency logo cache — fetched from DB once per 5 minutes, used in FCM payloads
// ---------------------------------------------------------------------------
let _cachedLogoUrl = null;
let _cacheExpiry = 0;

const getAgencyLogoUrl = async () => {
  const now = Date.now();
  if (_cachedLogoUrl !== null && now < _cacheExpiry) return _cachedLogoUrl;
  try {
    const adminUser = await User.findOne({ role: 'ADMIN', isDeleted: false })
      .select('branding.logoUrl').lean();
    _cachedLogoUrl = adminUser?.branding?.logoUrl || '';
    _cacheExpiry = now + 5 * 60 * 1000; // refresh every 5 minutes
    console.log('[Push] Agency logo URL cached:', _cachedLogoUrl ? _cachedLogoUrl.substring(0, 50) + '...' : '(none)');
    return _cachedLogoUrl;
  } catch (err) {
    console.warn('[Push] Could not fetch agency logo:', err.message);
    return '';
  }
};

/**
 * Send push notification to a specific user
 * @param {string} userId - User ID to send notification to
 * @param {object} notification - { title, body }
 * @param {object} data - Additional data payload
 */
const sendToUser = async (userId, notification, data = {}) => {
  console.log('[Push] ========== SEND TO USER ==========');
  console.log('[Push] Target userId:', userId);
  console.log('[Push] Notification title:', notification.title);
  console.log('[Push] Notification body:', notification.body);
  
  // Log token counts for diagnostics
  await getTokenCounts();
  
  if (!isFirebaseReady()) {
    console.error('[Push] ❌ ABORT: Firebase not initialized');
    return { success: false, reason: 'firebase_not_initialized' };
  }

  try {
    // Check if user has push notifications enabled in DB
    const userDoc = await User.findById(userId).select('preferences').lean();
    if (userDoc && userDoc.preferences?.pushNotifications === false) {
      console.log(`[Push] Push notifications disabled by user ${userId} - skipping`);
      return { success: false, reason: 'push_disabled_by_user' };
    }

    // Get all active device tokens for user
    console.log('[Push] Querying tokens for userId:', userId);
    const tokens = await DeviceToken.getActiveTokensForUser(userId);
    
    if (!tokens || tokens.length === 0) {
      console.log(`[Push] ❌ No device tokens found for user ${userId}`);
      // Check if ANY tokens exist for this user (including inactive)
      const allTokens = await DeviceToken.find({ userId }).lean();
      console.log(`[Push] Total tokens (including inactive) for user: ${allTokens.length}`);
      if (allTokens.length > 0) {
        console.log('[Push] Tokens exist but are inactive:', allTokens.map(t => ({ active: t.isActive, role: t.role })));
      }
      return { success: false, reason: 'no_tokens' };
    }

    const tokenStrings = tokens.map(t => t.token);
    console.log(`[Push] Found ${tokenStrings.length} active token(s) for user`);
    console.log('[Push] Token preview:', tokenStrings.map(t => t.substring(0, 20) + '...'));
    
    // Ensure ALL data values are strings (FCM requirement for web)
    const stringifiedData = {};
    for (const [key, value] of Object.entries(data)) {
      stringifiedData[key] = String(value);
    }
    
    // Build FCM message - DATA ONLY for web push (service worker displays notification)
    // This prevents the browser from showing generic "site updated" message
    const message = {
      // NO top-level notification field - let service worker handle display
      data: {
        ...stringifiedData,
        // Include notification data in data field for service worker
        title: notification.title,
        body: notification.body
      },
      webpush: {
        headers: {
          Urgency: 'high'
        },
        data: {
          ...stringifiedData,
          title: notification.title,
          body: notification.body
        },
        fcm_options: {
          link: stringifiedData.url || '/support'
        }
      },
      tokens: tokenStrings
    };

    console.log('[Push] Sending FCM message via sendEachForMulticast...');
    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`[Push] ✅ Firebase response: ${response.successCount} success, ${response.failureCount} failed`);
    
    // Log detailed response for each token
    response.responses.forEach((resp, idx) => {
      if (resp.success) {
        console.log(`[Push] Token ${idx}: ✅ SUCCESS - messageId: ${resp.messageId}`);
      } else {
        console.error(`[Push] Token ${idx}: ❌ FAILED - ${resp.error?.code}: ${resp.error?.message}`);
      }
    });
    
    // Handle failed tokens (remove invalid ones)
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
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

    console.log('[Push] ========== SEND TO USER COMPLETE ==========');
    return { 
      success: response.successCount > 0, 
      successCount: response.successCount,
      failureCount: response.failureCount
    };
  } catch (error) {
    console.error('[Push] ❌ EXCEPTION during send:', error.message);
    console.error('[Push] Full error:', error);
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
  
  const logoUrl = await getAgencyLogoUrl();
  const data = {
    type: 'chat',
    taskId: String(taskId),
    taskTitle: String(taskTitle),
    url: `/support?taskId=${taskId}`,
    icon: logoUrl
  };

  return sendToUser(recipientUserId, notification, data);
};

/**
 * Send push notification to ALL users with a specific role
 * @param {string} role - 'admin' or 'client'
 * @param {object} notification - { title, body }
 * @param {object} data - Additional data payload
 */
const sendToRole = async (role, notification, data = {}) => {
  console.log(`[Push] ========== SEND TO ALL ${role.toUpperCase()}S ==========`);
  console.log('[Push] Notification title:', notification.title);
  console.log('[Push] Notification body:', notification.body);
  
  // Log token counts for diagnostics
  await getTokenCounts();
  
  if (!isFirebaseReady()) {
    console.error('[Push] ❌ ABORT: Firebase not initialized');
    return { success: false, reason: 'firebase_not_initialized' };
  }

  try {
    // Get all active tokens for the role
    console.log(`[Push] Querying tokens for role: ${role}`);
    const tokens = await DeviceToken.getActiveTokensByRole(role);
    
    if (!tokens || tokens.length === 0) {
      console.log(`[Push] ❌ No ${role} tokens found`);
      // Check if ANY tokens exist for this role (including inactive)
      const allTokens = await DeviceToken.find({ role }).lean();
      console.log(`[Push] Total ${role} tokens (including inactive): ${allTokens.length}`);
      if (allTokens.length > 0) {
        console.log('[Push] Tokens exist but are inactive:', allTokens.map(t => ({ active: t.isActive, userId: t.userId })));
      }
      return { success: false, reason: 'no_tokens' };
    }

    const tokenStrings = tokens.map(t => t.token);
    console.log(`[Push] ${role.toUpperCase()} tokens found: ${tokenStrings.length}`);
    console.log('[Push] Token details:', tokens.map((t, i) => ({
      index: i,
      userId: t.userId?.toString(),
      tokenPreview: t.token ? t.token.substring(0, 20) + '...' : 'null'
    })));
    console.log(`[Push] Sending to all ${role}s...`);
    
    // Ensure ALL data values are strings
    const stringifiedData = {};
    for (const [key, value] of Object.entries(data)) {
      stringifiedData[key] = String(value);
    }
    
    // Build FCM message - DATA ONLY for web push (service worker displays notification)
    // This prevents the browser from showing generic "site updated" message
    const message = {
      // NO top-level notification field - let service worker handle display
      data: {
        ...stringifiedData,
        // Include notification data in data field for service worker
        title: notification.title,
        body: notification.body
      },
      webpush: {
        headers: {
          Urgency: 'high'
        },
        data: {
          ...stringifiedData,
          title: notification.title,
          body: notification.body
        },
        fcm_options: {
          link: stringifiedData.url || '/support'
        }
      },
      tokens: tokenStrings
    };

    console.log('[Push] Sending FCM message via sendEachForMulticast...');
    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`[Push] ✅ Firebase response: ${response.successCount} success, ${response.failureCount} failed`);
    
    // Log detailed response for each token
    response.responses.forEach((resp, idx) => {
      if (resp.success) {
        console.log(`[Push] Token ${idx}: ✅ SUCCESS - messageId: ${resp.messageId}`);
      } else {
        console.error(`[Push] Token ${idx}: ❌ FAILED - ${resp.error?.code}: ${resp.error?.message}`);
      }
    });
    
    // Handle failed tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
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

    console.log(`[Push] ========== SEND TO ${role.toUpperCase()}S COMPLETE ==========`);
    return { 
      success: response.successCount > 0, 
      successCount: response.successCount,
      failureCount: response.failureCount
    };
  } catch (error) {
    console.error(`[Push] ❌ EXCEPTION sending to ${role}s:`, error.message);
    console.error('[Push] Full error:', error);
    return { success: false, reason: 'error', error: error.message };
  }
};

/**
 * Send message notification to ALL admins
 * @param {string} senderName - Name of message sender
 * @param {string} taskTitle - Task title
 * @param {string} taskId - Task ID
 * @param {string} messagePreview - Message preview
 */
const sendMessageToAllAdmins = async (senderName, taskTitle, taskId, messagePreview) => {
  console.log('[Push] ===== SENDING PUSH TO ADMIN =====');
  console.log('[Push] sendMessageToAllAdmins called:', { senderName, taskTitle, taskId });
  
  const safePreview = (messagePreview || '[Attachment]').substring(0, 80);
  const notification = {
    title: 'New Message - Go Viral Ads',
    body: `${senderName}: ${safePreview.length >= 80 ? safePreview.substring(0, 77) + '...' : safePreview}`
  };
  
  const logoUrl = await getAgencyLogoUrl();
  const data = {
    type: 'chat',
    taskId: String(taskId),
    taskTitle: String(taskTitle),
    url: `/support?taskId=${taskId}`,
    icon: logoUrl
  };

  return sendToRole('admin', notification, data);
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
  
  const logoUrl = await getAgencyLogoUrl();
  const data = {
    type: 'approval_request',
    taskId: String(taskId),
    taskTitle: String(taskTitle),
    url: `/support?taskId=${taskId}`,
    icon: logoUrl
  };

  return sendToUser(recipientUserId, notification, data);
};

module.exports = {
  sendToUser,
  sendToRole,
  sendMessageNotification,
  sendMessageToAllAdmins,
  sendApprovalNotification,
  isFirebaseReady,
  getTokenCounts
};
