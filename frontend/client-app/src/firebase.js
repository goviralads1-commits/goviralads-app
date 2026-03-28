// Firebase Cloud Messaging configuration for push notifications
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// Firebase config from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase only if config is available
let app = null;
let messaging = null;

const isFirebaseConfigured = () => {
  return firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId;
};

if (isFirebaseConfigured()) {
  try {
    app = initializeApp(firebaseConfig);
    // Only initialize messaging if supported (not in SSR, not in unsupported browsers)
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      messaging = getMessaging(app);
    }
  } catch (error) {
    console.warn('[Firebase] Initialization failed:', error.message);
  }
} else {
  console.log('[Firebase] Not configured - push notifications disabled');
}

// Request notification permission and get FCM token
export const requestNotificationPermission = async () => {
  if (!messaging) {
    console.log('[Firebase] Messaging not available');
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    console.log('[Firebase] Permission:', permission);
    
    if (permission !== 'granted') {
      console.log('[Firebase] Notification permission denied');
      return null;
    }

    // Get FCM token
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.warn('[Firebase] VAPID key not configured');
      return null;
    }

    const token = await getToken(messaging, { vapidKey });
    console.log('[Firebase] FCM Token obtained');
    return token;
  } catch (error) {
    console.error('[Firebase] Error getting token:', error);
    return null;
  }
};

// Listen for foreground messages
export const onForegroundMessage = (callback) => {
  if (!messaging) return () => {};
  
  return onMessage(messaging, (payload) => {
    console.log('[Firebase] Foreground message:', payload);
    callback(payload);
  });
};

export { messaging };
