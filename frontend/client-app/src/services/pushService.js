// Push Notification Service for Client App
// Production-level implementation with full debugging

// NOTE: Firebase SDK is loaded via dynamic import (see loadFirebaseModules)
// so anonymous/login-page visitors never download the messaging bundle.
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

// Lazy Firebase SDK loader — modules are downloaded only when push
// initialization actually runs (after authentication).
let firebaseModulesPromise = null;
const loadFirebaseModules = () => {
  if (!firebaseModulesPromise) {
    firebaseModulesPromise = Promise.all([
      import('firebase/app'),
      import('firebase/messaging'),
    ]).then(([appMod, messagingMod]) => ({
      initializeApp: appMod.initializeApp,
      getMessaging: messagingMod.getMessaging,
      getToken: messagingMod.getToken,
      onMessage: messagingMod.onMessage,
    }));
  }
  return firebaseModulesPromise;
};

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

// Initialize Firebase (singleton, async due to dynamic SDK import)
let initPromise = null;
const initFirebase = () => {
  if (app) {
    console.log('[Push] Firebase already initialized');
    return Promise.resolve({ app, messaging });
  }

  if (!isFirebaseConfigured()) {
    console.error('[Push] Firebase NOT configured - check .env variables');
    return Promise.resolve({ app: null, messaging: null });
  }

  if (!initPromise) {
    initPromise = (async () => {
      try {
        console.log('[Push] Initializing Firebase...');
        const { initializeApp, getMessaging } = await loadFirebaseModules();
        app = initializeApp(firebaseConfig);
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
          messaging = getMessaging(app);
          console.log('[Push] Firebase messaging initialized');
        }
        return { app, messaging };
      } catch (error) {
        console.error('[Push] Firebase init error:', error);
        initPromise = null; // Do not cache failure — allow retry on next call
        return { app: null, messaging: null };
      }
    })();
  }
  return initPromise;
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
    const { messaging: msg } = await initFirebase();
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

    const { getToken } = await loadFirebaseModules();
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
    reportPushState(true); // inform backend delivery is now disabled
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
    reportPushState(true); // inform backend delivery is now disabled
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
    localStorage.setItem('gvaPushTokenRefreshAt', String(Date.now()));
    reportPushState(true); // inform backend the delivery is healthy again
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

// ---------------------------------------------------------------------------
// Notification delivery state machine (permission UX pass)
// States: healthy | token_missing | not_requested | denied | disabled | unsupported
// This reflects the ACTUAL browser + token state — never just a saved flag.
// ---------------------------------------------------------------------------
export const getNotificationStatus = () => {
  try {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return 'unsupported';
    }
    if (localStorage.getItem('pushNotificationsEnabled') === 'false') return 'disabled';
    const permission = Notification.permission;
    if (permission === 'denied') return 'denied';
    if (permission === 'default') return 'not_requested';
    // granted
    return localStorage.getItem('fcmToken') ? 'healthy' : 'token_missing';
  } catch (e) {
    return 'unsupported';
  }
};

// Report delivery state to the backend (authenticated, fire-and-forget).
// Throttled: at most one request per 24h per unchanged state — healthy clients
// generate ZERO extra API calls on repeat visits.
export const reportPushState = async (force = false) => {
  try {
    const authToken = localStorage.getItem('token');
    if (!authToken) return; // not logged in — nothing to report

    const state = getNotificationStatus();
    const key = 'gvaPushStateReport';
    let last = null;
    try { last = JSON.parse(localStorage.getItem(key)); } catch (e) { last = null; }

    const DAY_MS = 24 * 60 * 60 * 1000;
    if (!force && last && last.state === state && (Date.now() - (last.at || 0)) < DAY_MS) {
      return; // already reported this state recently
    }

    await api.patch('/client/push-state', { state });
    localStorage.setItem(key, JSON.stringify({ state, at: Date.now() }));
    console.log('[Push] State reported to backend:', state);
  } catch (e) {
    // Non-fatal: state reporting must never break the app
    console.warn('[Push] State report failed (non-fatal):', e.message);
  }
};

// Setup foreground message handler
// Returns an unsubscribe function immediately; the actual Firebase listener is
// attached once the dynamically imported SDK resolves (post-login only).
export const setupForegroundHandler = (onMessageCallback) => {
  let unsubscribe = null;
  let disposed = false;

  initFirebase().then(({ messaging: msg }) => {
    if (disposed || !msg) return;
    return loadFirebaseModules();
  }).then((modules) => {
    if (disposed || !modules || !messaging) return;
    unsubscribe = modules.onMessage(messaging, (payload) => {
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
  }).catch((err) => {
    console.error('[Push] Foreground handler setup failed (non-fatal):', err.message);
  });

  return () => {
    disposed = true;
    if (typeof unsubscribe === 'function') unsubscribe();
  };
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
      reportPushState();
      return;
    }

    // Unsupported browser/device — report once (throttled), never prompt
    if (typeof Notification === 'undefined') {
      reportPushState();
      return;
    }

    // Check if already have a valid token
    const existingToken = localStorage.getItem('fcmToken');
    if (existingToken && Notification.permission === 'granted') {
      // Healthy path: NO popup, NO repeated registration. Refresh the token via
      // Firebase SDK at most once per 24h (tokens can rotate silently).
      const lastRefresh = Number(localStorage.getItem('gvaPushTokenRefreshAt') || 0);
      const DAY_MS = 24 * 60 * 60 * 1000;
      if (Date.now() - lastRefresh < DAY_MS) {
        console.log('[Push] Healthy — skipping token refresh (last refresh < 24h ago)');
        reportPushState();
        return;
      }
      console.log('[Push] Existing token found — refreshing via Firebase SDK (getToken)...');
      try {
        await generateToken();
        localStorage.setItem('gvaPushTokenRefreshAt', String(Date.now()));
        console.log('[Push] ✅ Token refreshed and re-registered');
      } catch (e) {
        console.warn('[Push] Token refresh failed:', e.message);
      }
      reportPushState();
      return;
    }

    // Permission not decided yet: NEVER auto-trigger the native browser prompt.
    // Signal the app to show our own lightweight in-app prompt instead — the
    // native request only happens from the user's explicit "Allow" action.
    if (Notification.permission === 'default') {
      console.log('[Push] Permission undecided - signaling in-app prompt');
      window.dispatchEvent(new CustomEvent('gva-push-permission-needed'));
    } else if (Notification.permission === 'granted') {
      // Granted but no token stored (e.g. fresh device) — repair silently
      console.log('[Push] Permission granted, generating token...');
      try {
        await generateToken();
        localStorage.setItem('gvaPushTokenRefreshAt', String(Date.now()));
      } catch (e) {
        console.warn('[Push] Token generation failed:', e.message);
      }
    } else {
      // denied — never re-request; Profile shows re-enable guidance
      console.log('[Push] Permission denied by user — not re-requesting');
    }

    reportPushState();
    console.log('[Push] ========== AUTO INIT COMPLETE ==========');
  } catch (error) {
    console.error('[Push] Auto-init error (non-fatal):', error.message);
  }
};

// Export sendTokenToBackend for re-registration
export { sendTokenToBackend };
