const CACHE_NAME = 'taskflow-pro-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip API calls - always go to network
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('/auth/') ||
      event.request.url.includes('/client/') ||
      event.request.url.includes('/admin/') ||
      event.request.url.includes('/public/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response before caching
        const responseClone = response.clone();
        
        // Only cache successful responses
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request).then((response) => {
          if (response) {
            return response;
          }
          
          // If it's a navigation request, return the offline page
          if (event.request.mode === 'navigate') {
            return caches.match('/').then((indexResponse) => {
              if (indexResponse) {
                return indexResponse;
              }
              // Return a basic offline response
              return new Response(
                `<!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Offline - TaskFlow Pro</title>
                  <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                      min-height: 100vh;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      color: #f8fafc;
                    }
                    .container {
                      text-align: center;
                      padding: 40px 20px;
                    }
                    .icon {
                      font-size: 64px;
                      margin-bottom: 24px;
                    }
                    h1 {
                      font-size: 24px;
                      margin-bottom: 12px;
                    }
                    p {
                      font-size: 16px;
                      color: #94a3b8;
                      margin-bottom: 24px;
                    }
                    button {
                      background: linear-gradient(135deg, #22c55e, #16a34a);
                      color: white;
                      border: none;
                      padding: 14px 28px;
                      font-size: 16px;
                      font-weight: 600;
                      border-radius: 12px;
                      cursor: pointer;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="icon">📡</div>
                    <h1>You're Offline</h1>
                    <p>Please check your internet connection and try again.</p>
                    <button onclick="window.location.reload()">Try Again</button>
                  </div>
                </body>
                </html>`,
                {
                  headers: { 'Content-Type': 'text/html' },
                }
              );
            });
          }
          
          return new Response('', { status: 408, statusText: 'Request timed out' });
        });
      })
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
    },
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'TaskFlow Pro', options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there's already a window open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Open new window
      return clients.openWindow(urlToOpen);
    })
  );
});
