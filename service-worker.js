var APP_VERSION = '1.41.0';
var CACHE_NAME = 'dict-app-v' + APP_VERSION;
var V = '?v=' + APP_VERSION;
var urlsToCache = [
    './',
    './index.html' + V,
    './manifest.json' + V,
    './version.json' + V,
    './data-embed.js' + V,
    './styles/main.css' + V,
    './core/dict-store-browser.js' + V,
    './core/command-parser.js' + V,
    './core/validators.js' + V,
    './core/operations.js' + V,
    './core/queries.js' + V,
    './core/updates.js' + V,
    './core/export-import.js' + V,
    './core/image-composer.js' + V,
    './ui/edit-page.js' + V,
    './ui/browse-page.js' + V,
    './ui/looseleaf.js' + V,
    './ui/article-page.js' + V,
    './ui/drawing-board.js' + V,
    './main.js' + V
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(urlsToCache);
        })
    );
});

self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(keys.filter(function(key) {
                return key !== CACHE_NAME;
            }).map(function(key) {
                return caches.delete(key);
            }));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);
    if (url.pathname.endsWith('/version.json')) {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' }).catch(function() {
                return caches.match(event.request);
            })
        );
        return;
    }
    event.respondWith(
        fetch(event.request).then(function(response) {
            var responseClone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
                if (event.request.method === 'GET') {
                    try { cache.put(event.request, responseClone); } catch(e) {}
                }
            });
            return response;
        }).catch(function() {
            return caches.match(event.request);
        })
    );
});