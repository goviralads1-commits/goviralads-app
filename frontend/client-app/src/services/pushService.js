// Push Notification Service for Client App
// Phase 1: Permission + Token generation only (no backend yet)

import { initializeApp } from 'firebase/app';
import { getMessaging, getToken } from 'firebase/messaging';

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

// Check if Firebase is configured
const isFirebaseConfigured = () => {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId
  );
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

// Generate FCM token (requires VAPID key)
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
    const app = initializeApp(firebaseConfig);
    const messaging = getMessaging(app);

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

    const fcmToken = await getToken(messaging, tokenOptions);
    
    if (fcmToken) {
      console.log('[Push] ✅ FCM Token generated successfully:');
      console.log('[Push] Token:', fcmToken);
      
      // Store locally for reference (will send to backend in Phase 2)
      localStorage.setItem('fcmToken', fcmToken);
      
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

// Initialize push notifications (call after login)
export const initPushNotifications = async () => {
  try {
    // Check if user is authenticated
    const authToken = localStorage.getItem('token');
    if (!authToken) {
      console.log('[Push] Not authenticated, skipping push init');
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
