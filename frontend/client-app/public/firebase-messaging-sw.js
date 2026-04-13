// Firebase Cloud Messaging Service Worker
// Handles background push notifications when app is closed or in background

// Import Firebase scripts (must use importScripts in service worker)
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Firebase config will be set by the main app when registering the service worker
let firebaseInitialized = false;

// Listen for config message from main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG' && !firebaseInitialized) {
    try {
      firebase.initializeApp(event.data.config);
      firebaseInitialized = true;
      console.log('[SW] Firebase initialized with config from main app');
    } catch (error) {
      console.warn('[SW] Firebase init error:', error.message);
    }
  }
});

// Handle push messages - ALWAYS show our custom notification
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received');
  
  // Parse the payload
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
    console.log('[SW] Push payload:', JSON.stringify(payload));
  } catch (e) {
    console.warn('[SW] Failed to parse push data:', e);
    return;
  }
  
  // Get notification text from data field (backend sends data-only messages)
  const title = payload.notification?.title || payload.data?.title || 'New Message - Go Viral Ads';
  const body = payload.notification?.body || payload.data?.body || 'You have a new message';
  const taskId = payload.data?.taskId || '';

  // Deep link URL: navigate directly to the task page for one-click chat open
  // /tasks/:taskId mounts TaskDetail directly — no two-step Support page loading
  const deepLinkUrl = taskId ? `/tasks/${taskId}` : (payload.data?.url || '/support');

  console.log('[SW] Showing notification:', { title, body, deepLinkUrl, taskId });
  
  const notificationOptions = {
    body: body,
    icon: 'https://www.goviralads.com/gva-icon-192.png',
    badge: 'https://www.goviralads.com/gva-icon-192.png',
    tag: 'gva-message-' + (taskId || Date.now()),
    renotify: true,
    requireInteraction: false,
    data: {
      taskId: taskId,
      url: deepLinkUrl   // stored as deepLinkUrl so notificationclick uses /tasks/:taskId
    }
    // NO actions array - keeps it clean without Unsubscribe button
  };

  event.waitUntil(
    self.registration.showNotification(title, notificationOptions)
  );
});

// Handle notification click - open the chat directly
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] ========== NOTIFICATION CLICK ==========');
  event.notification.close();

  const data = event.notification.data || {};
  const taskId = data.taskId;

  // Navigate directly to task page with scrollToChat=true so TaskDetail auto-scrolls to chat
  // Falls back to stored url, then /support
  const relativePath = taskId ? `/tasks/${taskId}?scrollToChat=true` : (data.url || '/support');
  
  // Build full URL with origin for reliable navigation
  const fullUrl = new URL(relativePath, self.location.origin).href;
  console.log('[SW] TaskId:', taskId);
  console.log('[SW] Relative path:', relativePath);
  console.log('[SW] Full URL to open:', fullUrl);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      console.log('[SW] Found', clientList.length, 'client(s)');
      
      // Check if there's already an open window
      for (const client of clientList) {
        console.log('[SW] Client URL:', client.url);
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          console.log('[SW] Found existing window, posting message and focusing');
          // Post message to navigate — NotificationClickHandler in App.jsx receives this
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            url: relativePath,
            taskId: taskId
          });
          return client.focus();
        }
      }
      
      // No existing window, open new one with FULL URL
      // ProtectedRoute + LoginForm handle the intendedUrl redirect if not logged in
      console.log('[SW] No existing window, opening new tab with full URL');
      if (clients.openWindow) {
        return clients.openWindow(fullUrl);
      }
    })
  );
  console.log('[SW] =====================================');
});
