// Push Notification Service for Client App
// Production-level implementation with full debugging

import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import api from './api';

// Firebase config from environment
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Firebase instances
let app = null;
let messaging = null;

// Check if Firebase is configured
const isFirebaseConfigured = () => {
  const configured = !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId
  );
  console.log('[Push] Firebase config check:', {
    hasApiKey: !!firebaseConfig.apiKey,
    hasProjectId: !!firebaseConfig.projectId,
    hasSenderId: !!firebaseConfig.messagingSenderId,
    configured
  });
  return configured;
};

// Initialize Firebase (singleton)
const initFirebase = () => {
  if (app) {
    console.log('[Push] Firebase already initialized');
    return { app, messaging };
  }
  
  if (!isFirebaseConfigured()) {
    console.error('[Push] Firebase NOT configured - check .env variables');
    return { app: null, messaging: null };
  }

  try {
    console.log('[Push] Initializing Firebase...');
    app = initializeApp(firebaseConfig);
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      messaging = getMessaging(app);
      console.log('[Push] Firebase messaging initialized');
    }
    return { app, messaging };
  } catch (error) {
    console.error('[Push] Firebase init error:', error);
    return { app: null, messaging: null };
  }
};

// Request notification permission
export const requestPermission = async (forceRequest = false) => {
  try {
    console.log('[Push] Requesting permission... (force:', forceRequest, ')');
    
    // Check if notifications are supported
    if (!('Notification' in window)) {
      console.error('[Push] Notifications NOT supported in this browser');
      return null;
    }

    // Check current permission
    const currentPermission = Notification.permission;
    console.log('[Push] Current permission:', currentPermission);
    
    // If already granted or denied, return current state
    if (currentPermission === 'granted') {
      console.log('[Push] Permission already granted');
      return 'granted';
    }
    
    if (currentPermission === 'denied') {
      console.error('[Push] Permission DENIED by user - cannot request again');
      return 'denied';
    }

    // Request permission (only if 'default')
    console.log('[Push] Showing permission prompt...');
    const permission = await Notification.requestPermission();
    console.log('[Push] Permission result:', permission);
    
    return permission;
  } catch (error) {
    console.error('[Push] Permission request failed:', error);
    return null;
  }
};

// Generate FCM token and send to backend
export const generateToken = async () => {
  try {
    console.log('[Push] Starting token generation...');
    
    // Check Firebase config
    if (!isFirebaseConfigured()) {
      throw new Error('Firebase not configured - check VITE_FIREBASE_* env vars');
    }

    // Check VAPID key
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    console.log('[Push] VAPID key exists:', !!vapidKey, vapidKey ? `(${vapidKey.substring(0, 20)}...)` : '');
    if (!vapidKey) {
      throw new Error('VAPID key not configured - check VITE_FIREBASE_VAPID_KEY');
    }

    // Check permission
    console.log('[Push] Notification permission:', Notification.permission);
    if (Notification.permission !== 'granted') {
      throw new Error(`Permission not granted (current: ${Notification.permission})`);
    }

    // Initialize Firebase
    const { messaging: msg } = initFirebase();
    console.log('[Push] Messaging instance:', !!msg);
    if (!msg) {
      throw new Error('Firebase messaging not available');
    }

    // Register service worker
    let swRegistration = null;
    if ('serviceWorker' in navigator) {
      try {
        console.log('[Push] Registering service worker...');
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('[Push] Service worker registered:', swRegistration.scope);
      } catch (swError) {
        console.warn('[Push] Service worker registration failed:', swError.message);
        // Continue without SW - might still work
      }
    }

    // Get FCM-token
    console.log('[Push] Requesting FCM token from Firebase...');
    const tokenOptions = { vapidKey };
    if (swRegistration) {
      tokenOptions.serviceWorkerRegistration = swRegistration;
    }

    const fcmToken = await getToken(msg, tokenOptions);
    console.log('[Push] Firebase returned token:', !!fcmToken);
    
    if (fcmToken) {
      console.log('[Push] ✅ FCM Token generated:', fcmToken.substring(0, 30) + '...');
      
      // Store locally
      localStorage.setItem('fcmToken', fcmToken);
      
      // Send to backend
      const backendResult = await sendTokenToBackend(fcmToken);
      console.log('[Push] Backend saved token:', backendResult);
      if (!backendResult) {
        throw new Error('Failed to save token to backend');
      }
      
      return fcmToken;
    } else {
      throw new Error('No FCM token received from Firebase');
    }
  } catch (error) {
    console.error('[Push] Token generation FAILED:', error.message);
    console.error('[Push] Stack:', error.stack);
    throw error; // Re-throw so caller knows exactly what failed
  }
};

// Send token to backend
const sendTokenToBackend = async (fcmToken) => {
  try {
    const authToken = localStorage.getItem('token');
    console.log('[Push] Auth token exists:', !!authToken);
    if (!authToken) {
      throw new Error('No auth token - user not logged in');
    }

    // IMPORTANT: Save preference to DB BEFORE registering token.
    // The POST /device-token guard checks preferences.pushNotifications.
    // If user previously disabled push (sets preference=false), we must set
    // preference=true FIRST, otherwise the guard skips token registration.
    try {
      await api.patch('/client/push-preference', { pushEnabled: true });
      console.log('[Push] Push preference saved to DB: enabled (before token registration)');
    } catch (e) {
      console.warn('[Push] Failed to save push preference to DB (non-fatal):', e.message);
    }

    console.log('[Push] Sending token to backend: POST /client/device-token');
    const response = await api.post('/client/device-token', {
      token: fcmToken,
      platform: 'web'
    });
    
    console.log('[Push] ✅ Backend response:', response.status, response.data);
    localStorage.setItem('pushNotificationsEnabled', 'true');

    return true;
  } catch (error) {
    console.error('[Push] Backend save FAILED:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw error; // Re-throw to propagate to caller
  }
};

// Remove token from backend (disable notifications)
export const disablePushNotifications = async () => {
  try {
    const fcmToken = localStorage.getItem('fcmToken');
    console.log('[Push] Disabling notifications, token exists:', !!fcmToken);

    // Save preference to backend DB FIRST (non-blocking if it fails)
    try {
      await api.patch('/client/push-preference', { pushEnabled: false });
      console.log('[Push] Push preference saved to DB: disabled');
    } catch (e) {
      console.warn('[Push] Failed to save push preference to DB:', e.message);
    }

    if (fcmToken) {
      console.log('[Push] Sending DELETE /client/device-token');
      const response = await api.delete('/client/device-token', { data: { token: fcmToken } });
      console.log('[Push] ✅ Token removed from backend:', response.status, response.data);
    }
    
    localStorage.removeItem('fcmToken');
    localStorage.setItem('pushNotificationsEnabled', 'false');
    console.log('[Push] ✅ Notifications disabled successfully');
    return true;
  } catch (error) {
    console.error('[Push] Disable FAILED:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    // Still clear local state even if backend fails
    localStorage.removeItem('fcmToken');
    localStorage.setItem('pushNotificationsEnabled', 'false');
    return false;
  }
};

// Enable push notifications (re-register)
export const enablePushNotifications = async () => {
  console.log('[Push] ========== ENABLE PUSH START ==========');
  try {
    // Step 1: Request permission
    console.log('[Push] Step 1: Requesting permission...');
    const permission = await requestPermission(true);
    console.log('[Push] Permission result:', permission);
    
    if (permission !== 'granted') {
      const msg = permission === 'denied' 
        ? 'Permission denied - please enable in browser settings' 
        : 'Permission not granted';
      console.error('[Push] FAILED:', msg);
      throw new Error(msg);
    }
    
    // Step 2: Generate token and save to backend
    console.log('[Push] Step 2: Generating token...');
    const token = await generateToken();
    console.log('[Push] Token generated:', !!token);
    
    if (!token) {
      throw new Error('Token generation returned null');
    }
    
    console.log('[Push] ========== ENABLE PUSH SUCCESS ==========');
    return true;
  } catch (error) {
    console.error('[Push] ========== ENABLE PUSH FAILED ==========');
    console.error('[Push] Error:', error.message);
    console.error('[Push] Stack:', error.stack);
    throw error; // Re-throw so UI can show specific error
  }
};

// Check if push notifications are enabled
export const isPushEnabled = () => {
  const enabled = localStorage.getItem('pushNotificationsEnabled') === 'true';
  const hasToken = !!localStorage.getItem('fcmToken');
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  const result = enabled && hasToken && permission === 'granted';
  
  console.log('[Push] isPushEnabled check:', { enabled, hasToken, permission, result });
  return result;
};

// Setup foreground message handler
export const setupForegroundHandler = (onMessageCallback) => {
  const { messaging: msg } = initFirebase();
  if (!msg) return () => {};

  return onMessage(msg, (payload) => {
    console.log('[Push] Foreground message received:', payload);
    
    // Backend sends data-only messages — read from payload.data
    // Show browser notification if page is not focused
    if (document.hidden && Notification.permission === 'granted') {
      const title = payload.data?.title || 'New Message - Go Viral Ads';
      const body = payload.data?.body || 'You have a new message';
      
      new Notification(title, {
        body,
        icon: '/icon-192.png',
        tag: 'message-notification',
        data: payload.data
      });
    }
    
    // Call custom handler
    if (onMessageCallback) {
      onMessageCallback(payload);
    }
  });
};

// Initialize push notifications (call after login)
export const initPushNotifications = async () => {
  console.log('[Push] ========== AUTO INIT START ==========');
  try {
    // Check if user is authenticated
    const authToken = localStorage.getItem('token');
    if (!authToken) {
      console.log('[Push] Not authenticated, skipping');
      return;
    }

    // Check if user has explicitly disabled push notifications
    if (localStorage.getItem('pushNotificationsEnabled') === 'false') {
      console.log('[Push] User has disabled push - skipping');
      return;
    }

    // Check if already have a valid token
    const existingToken = localStorage.getItem('fcmToken');
    if (existingToken && Notification.permission === 'granted') {
      // Always call generateToken() (Firebase SDK getToken()) instead of re-sending the
      // cached localStorage token. FCM tokens can rotate silently; Firebase SDK returns
      // the current valid token (same or new) and we save it fresh to the backend.
      console.log('[Push] Existing token found — refreshing via Firebase SDK (getToken)...');
      try {
        await generateToken();
        console.log('[Push] ✅ Token refreshed and re-registered');
      } catch (e) {
        console.warn('[Push] Token refresh failed:', e.message);
      }
      return;
    }

    // Request permission if not yet granted
    if (Notification.permission === 'default') {
      console.log('[Push] First time - requesting permission...');
      const permission = await requestPermission();
      if (permission === 'granted') {
        await generateToken();
      }
    } else if (Notification.permission === 'granted') {
      console.log('[Push] Permission granted, generating token...');
      await generateToken();
    } else {
      console.log('[Push] Permission denied by user');
    }
    
    console.log('[Push] ========== AUTO INIT COMPLETE ==========');
  } catch (error) {
    console.error('[Push] Auto-init error (non-fatal):', error.message);
  }
};

// Export sendTokenToBackend for re-registration
export { sendTokenToBackend };
