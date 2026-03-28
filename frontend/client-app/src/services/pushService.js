// Push Notification Service for Client App
// Complete implementation with backend integration

import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import api from './api';

// Session flag to only ask once per session
const SESSION_KEY = 'push_permission_asked';

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
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId
  );
};

// Initialize Firebase (singleton)
const initFirebase = () => {
  if (app) return { app, messaging };
  
  if (!isFirebaseConfigured()) {
    console.log('[Push] Firebase not configured');
    return { app: null, messaging: null };
  }

  try {
    app = initializeApp(firebaseConfig);
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      messaging = getMessaging(app);
    }
    return { app, messaging };
  } catch (error) {
    console.error('[Push] Firebase init error:', error);
    return { app: null, messaging: null };
  }
};

// Request notification permission (only once per session)
export const requestPermission = async () => {
  try {
    // Check if already asked this session
    if (sessionStorage.getItem(SESSION_KEY)) {
      console.log('[Push] Permission already requested this session');
      return Notification.permission;
    }

    // Check if notifications are supported
    if (!('Notification' in window)) {
      console.log('[Push] Notifications not supported in this browser');
      return null;
    }

    // Mark as asked for this session
    sessionStorage.setItem(SESSION_KEY, 'true');

    // Request permission
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
    // Check Firebase config
    if (!isFirebaseConfigured()) {
      console.log('[Push] Firebase not configured, skipping token generation');
      return null;
    }

    // Check VAPID key
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.log('[Push] VAPID key not configured, skipping token generation');
      return null;
    }

    // Check permission
    if (Notification.permission !== 'granted') {
      console.log('[Push] Notification permission not granted');
      return null;
    }

    // Initialize Firebase
    const { messaging: msg } = initFirebase();
    if (!msg) {
      console.log('[Push] Messaging not available');
      return null;
    }

    // Register service worker
    let swRegistration = null;
    if ('serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('[Push] Service worker registered');
      } catch (swError) {
        console.warn('[Push] Service worker registration failed:', swError.message);
      }
    }

    // Get FCM token
    const tokenOptions = { vapidKey };
    if (swRegistration) {
      tokenOptions.serviceWorkerRegistration = swRegistration;
    }

    const fcmToken = await getToken(msg, tokenOptions);
    
    if (fcmToken) {
      console.log('[Push] ✅ FCM Token generated successfully');
      
      // Store locally
      localStorage.setItem('fcmToken', fcmToken);
      
      // Send to backend
      await sendTokenToBackend(fcmToken);
      
      return fcmToken;
    } else {
      console.log('[Push] No token received');
      return null;
    }
  } catch (error) {
    console.error('[Push] Token generation failed:', error);
    return null;
  }
};

// Send token to backend
const sendTokenToBackend = async (fcmToken) => {
  try {
    const authToken = localStorage.getItem('token');
    if (!authToken) {
      console.log('[Push] No auth token, skipping backend save');
      return false;
    }

    await api.post('/client/device-token', {
      token: fcmToken,
      platform: 'web'
    });
    
    console.log('[Push] ✅ Token sent to backend');
    localStorage.setItem('pushNotificationsEnabled', 'true');
    return true;
  } catch (error) {
    console.error('[Push] Failed to send token to backend:', error);
    return false;
  }
};

// Remove token from backend (disable notifications)
export const disablePushNotifications = async () => {
  try {
    const fcmToken = localStorage.getItem('fcmToken');
    if (fcmToken) {
      await api.delete('/client/device-token', { data: { token: fcmToken } });
      console.log('[Push] Token removed from backend');
    }
    
    localStorage.removeItem('fcmToken');
    localStorage.setItem('pushNotificationsEnabled', 'false');
    return true;
  } catch (error) {
    console.error('[Push] Failed to disable notifications:', error);
    return false;
  }
};

// Enable push notifications (re-register)
export const enablePushNotifications = async () => {
  try {
    // Clear session flag to allow re-requesting
    sessionStorage.removeItem(SESSION_KEY);
    
    const permission = await requestPermission();
    if (permission === 'granted') {
      const token = await generateToken();
      return !!token;
    }
    return false;
  } catch (error) {
    console.error('[Push] Failed to enable notifications:', error);
    return false;
  }
};

// Check if push notifications are enabled
export const isPushEnabled = () => {
  return localStorage.getItem('pushNotificationsEnabled') === 'true' &&
         localStorage.getItem('fcmToken') &&
         Notification.permission === 'granted';
};

// Setup foreground message handler
export const setupForegroundHandler = (onMessageCallback) => {
  const { messaging: msg } = initFirebase();
  if (!msg) return () => {};

  return onMessage(msg, (payload) => {
    console.log('[Push] Foreground message received:', payload);
    
    // Show browser notification if page is not focused
    if (document.hidden && Notification.permission === 'granted') {
      const title = payload.notification?.title || 'New Message - Go Viral Ads';
      const body = payload.notification?.body || 'You have a new message';
      
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
  try {
    // Check if user is authenticated
    const authToken = localStorage.getItem('token');
    if (!authToken) {
      console.log('[Push] Not authenticated, skipping push init');
      return;
    }

    // Check if user has disabled push notifications
    if (localStorage.getItem('pushNotificationsEnabled') === 'false') {
      console.log('[Push] User has disabled push notifications');
      return;
    }

    // Step 1: Request permission
    const permission = await requestPermission();
    
    // Step 2: Generate token if granted
    if (permission === 'granted') {
      await generateToken();
    }
  } catch (error) {
    // Silent fail - never crash the app
    console.error('[Push] Initialization error:', error);
  }
};
