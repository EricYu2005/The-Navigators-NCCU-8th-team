const CACHE_NAME = 'carenav-pwa-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg'
];

// 1. 安裝 Service Worker 並快取核心 App Shell 靜態資源
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[CareNav SW] Pre-caching offline app shell');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// 2. 啟用並強制清除舊版本快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[CareNav SW] Clearing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. 攔截請求：網路優先 (Network First)，保證線上隨時取得 Render 最新版本，離線才回退快取
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API 請求強制網路優先
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({
            success: false,
            message: '目前處於離線狀態，請檢查網路連線。'
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // 靜態核心檔案與網頁：網路優先 (Network First)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // 離線時回退至本地快取
        return caches.match(event.request);
      })
  );
});