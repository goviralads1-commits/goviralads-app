import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './style.css'
import { IconLibraryProvider } from './context/IconLibraryContext'

// sw.js registration disabled — firebase-messaging-sw.js is the sole service worker
// Reason: two SW registrations caused unpredictable push notification handling
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('/sw.js')
//       .then((registration) => {
//         console.log('ServiceWorker registered:', registration.scope);
//       })
//       .catch((error) => {
//         console.log('ServiceWorker registration failed:', error);
//       });
//   });
// }

// One-shot cleanup of the LEGACY cache-first service worker (/sw.js, registered by
// builds before Apr 2026). It cached the app shell and could serve a stale index
// whose hashed chunks no longer exist after a deploy — the stale-shell failure mode
// behind the ErrorBoundary screen. Only registrations whose script URL ends with
// '/sw.js' are removed; firebase-messaging-sw.js (the sole active SW for push) is
// never touched, and no new service worker is registered here.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => {
      registrations.forEach((reg) => {
        const scriptURL =
          reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
        if (scriptURL.endsWith('/sw.js')) {
          reg.unregister();
        }
      });
    })
    .catch(() => { /* cleanup is best-effort; never block app startup */ });
  // Remove the legacy shell cache owned by that worker (no-op if absent).
  if ('caches' in window) {
    caches.delete('gva-admin-v2').catch(() => {});
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <IconLibraryProvider>
      <App />
    </IconLibraryProvider>
  </React.StrictMode>,
)
