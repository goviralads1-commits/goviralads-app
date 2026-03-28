// Firebase Cloud Messaging Service Worker
// Handles background push notifications when app is closed or in background

// Import Firebase scripts (must use importScripts in service worker)
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Firebase config will be set by the main app when registering the service worker
// Using self.__FIREBASE_CONFIG__ which is set by the SDK
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

// For push messages, we can show notifications without Firebase SDK
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received');
  
  // Parse the payload
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    console.warn('[SW] Failed to parse push data');
  }
  
  const notificationTitle = payload.notification?.title || 'New Message';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new message',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'message-notification',
    data: payload.data || {},
    requireInteraction: true
  };

  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  const data = event.notification.data || {};
  const taskId = data.taskId;
  
  // Build the URL to open
  let urlToOpen = '/support';
  if (taskId) {
    urlToOpen = `/support?taskId=${taskId}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already an open window
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Navigate existing window to the chat
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            taskId: taskId
          });
          return client.focus();
        }
      }
      // No existing window, open new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
