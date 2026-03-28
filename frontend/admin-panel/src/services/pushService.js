// Push Notification Service for Admin Panel
import api from './api';
import { requestNotificationPermission, onForegroundMessage } from '../firebase';

// Save device token to backend
const saveDeviceToken = async (fcmToken) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('[Push] No auth token, skipping device token save');
      return false;
    }
    
    await api.post('/admin/device-token', { 
      token: fcmToken,
      platform: 'web',
      userAgent: navigator.userAgent
    });
    console.log('[Push] Device token saved to backend');
    return true;
  } catch (error) {
    console.error('[Push] Failed to save device token:', error);
    return false;
  }
};

// Register service worker for push notifications
const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    console.log('[Push] Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log('[Push] Service worker registered:', registration.scope);
    return registration;
  } catch (error) {
    console.error('[Push] Service worker registration failed:', error);
    return null;
  }
};

// Initialize push notifications
export const initPushNotifications = async () => {
  // Only initialize if authenticated
  const token = localStorage.getItem('token');
  if (!token) {
    console.log('[Push] Not authenticated, skipping push init');
    return;
  }

  // Check if notifications are supported
  if (!('Notification' in window)) {
    console.log('[Push] Notifications not supported');
    return;
  }

  // Register service worker first
  await registerServiceWorker();

  // Request permission and get token
  const fcmToken = await requestNotificationPermission();
  if (fcmToken) {
    // Save to backend
    await saveDeviceToken(fcmToken);
    
    // Store locally for reference
    localStorage.setItem('fcmToken', fcmToken);
  }
};

// Setup foreground message handler
export const setupForegroundHandler = (onMessage) => {
  return onForegroundMessage((payload) => {
    console.log('[Push] Foreground message received:', payload);
    
    // Show browser notification if page is not focused
    if (document.hidden && Notification.permission === 'granted') {
      const title = payload.notification?.title || 'New Message';
      const body = payload.notification?.body || 'You have a new message';
      
      new Notification(title, {
        body,
        icon: '/icon-192.png',
        tag: 'message-notification',
        data: payload.data
      });
    }
    
    // Call custom handler
    if (onMessage) {
      onMessage(payload);
    }
  });
};

// Remove device token (on logout)
export const removeDeviceToken = async () => {
  try {
    const fcmToken = localStorage.getItem('fcmToken');
    if (fcmToken) {
      await api.delete('/admin/device-token', { data: { token: fcmToken } });
      localStorage.removeItem('fcmToken');
      console.log('[Push] Device token removed');
    }
  } catch (error) {
    console.error('[Push] Failed to remove device token:', error);
  }
};
