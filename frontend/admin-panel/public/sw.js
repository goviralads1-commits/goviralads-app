const CACHE_NAME = 'gva-admin-v1';
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
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  // Skip API calls
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('/auth/') ||
      event.request.url.includes('/admin/') ||
      event.request.url.includes('/client/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((response) => {
          if (response) return response;
          
          if (event.request.mode === 'navigate') {
            return caches.match('/').then((indexResponse) => {
              if (indexResponse) return indexResponse;
              return new Response(
                `<!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Offline - GVA Admin</title>
                  <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                      font-family: 'Inter', -apple-system, sans-serif;
                      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                      min-height: 100vh;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      color: #f8fafc;
                    }
                    .container { text-align: center; padding: 40px 20px; }
                    .icon { font-size: 64px; margin-bottom: 24px; }
                    h1 { font-size: 24px; margin-bottom: 12px; }
                    p { font-size: 16px; color: #94a3b8; margin-bottom: 24px; }
                    button {
                      background: linear-gradient(135deg, #6366f1, #4f46e5);
                      color: white; border: none; padding: 14px 28px;
                      font-size: 16px; font-weight: 600; border-radius: 12px; cursor: pointer;
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
                { headers: { 'Content-Type': 'text/html' } }
              );
            });
          }
          return new Response('', { status: 408, statusText: 'Request timed out' });
        });
      })
  );
});
