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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <IconLibraryProvider>
      <App />
    </IconLibraryProvider>
  </React.StrictMode>,
)
