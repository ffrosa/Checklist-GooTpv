// ═══════════════════════════════════════════════════════════════
// SERVICE WORKER - Sistema GooTpv PWA
// Estrategia: Cache-First para assets, Network-First para datos
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'gootpv-v2-2026';
const STATIC_CACHE = 'gootpv-static-v2';
const DYNAMIC_CACHE = 'gootpv-dynamic-v2';

// Assets críticos para cachear inmediatamente
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json'
];

// CDNs y recursos externos
const EXTERNAL_RESOURCES = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://unpkg.com/lucide@latest',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

// Instalación: Precachear assets estáticos
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando Service Worker...');

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Cacheando assets estáticos...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                return caches.open(DYNAMIC_CACHE);
            })
            .then(cache => {
                console.log('[SW] Cacheando recursos externos...');
                // Cachear recursos externos con fetch
                return Promise.all(
                    EXTERNAL_RESOURCES.map(url => 
                        fetch(url, { mode: 'no-cors' })
                            .then(response => cache.put(url, response))
                            .catch(err => console.log('[SW] No se pudo cachear:', url, err))
                    )
                );
            })
            .then(() => {
                console.log('[SW] Instalación completa');
                return self.skipWaiting();
            })
            .catch(err => console.error('[SW] Error en instalación:', err))
    );
});

// Activación: Limpiar caches antiguas
self.addEventListener('activate', (event) => {
    console.log('[SW] Activando Service Worker...');

    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
                        .map(name => {
                            console.log('[SW] Eliminando cache antigua:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activación completa');
                return self.clients.claim();
            })
    );
});

// Fetch: Estrategia híbrida
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Estrategia 1: Cache-First para assets estáticos (HTML, CSS, JS, imágenes)
    if (request.mode === 'navigate' || 
        request.destination === 'style' || 
        request.destination === 'script' ||
        request.destination === 'image' ||
        request.destination === 'font') {

        event.respondWith(
            caches.match(request)
                .then(cached => {
                    if (cached) {
                        // Actualizar cache en segundo plano
                        fetch(request)
                            .then(response => {
                                if (response.ok) {
                                    caches.open(STATIC_CACHE)
                                        .then(cache => cache.put(request, response));
                                }
                            })
                            .catch(() => {});
                        return cached;
                    }

                    return fetch(request)
                        .then(response => {
                            if (!response || response.status !== 200 || response.type !== 'basic') {
                                return response;
                            }
                            const responseClone = response.clone();
                            caches.open(DYNAMIC_CACHE)
                                .then(cache => cache.put(request, responseClone));
                            return response;
                        })
                        .catch(() => {
                            // Fallback para navegación
                            if (request.mode === 'navigate') {
                                return caches.match('/index.html');
                            }
                            return new Response('Sin conexión', { status: 503 });
                        });
                })
        );
        return;
    }

    // Estrategia 2: Network-First para datos/API (si hubiera backend)
    // Para localStorage, los datos ya están en el cliente
    event.respondWith(
        fetch(request)
            .then(response => {
                const responseClone = response.clone();
                caches.open(DYNAMIC_CACHE)
                    .then(cache => cache.put(request, responseClone));
                return response;
            })
            .catch(() => {
                return caches.match(request)
                    .then(cached => {
                        if (cached) return cached;
                        return new Response(JSON.stringify({ offline: true }), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                    });
            })
    );
});

// Sincronización en segundo plano
self.addEventListener('sync', (event) => {
    if (event.tag === 'gootpv-sync') {
        console.log('[SW] Sincronización en segundo plano...');
        event.waitUntil(
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'SYNC_COMPLETE' });
                });
            })
        );
    }
});

// Notificaciones push (preparado para futuro)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        event.waitUntil(
            self.registration.showNotification(data.title || 'GooTpv', {
                body: data.body || 'Nueva notificación',
                icon: 'data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect fill='%230f172a' width='192' height='192' rx='32'/%3E%3Ctext x='96' y='120' font-size='80' text-anchor='middle' fill='%2314b8a6'%3E🛒%3C/text%3E%3C/svg%3E',
                badge: 'data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect fill='%2314b8a6' width='96' height='96' rx='16'/%3E%3Ctext x='48' y='60' font-size='40' text-anchor='middle' fill='white'%3E🛒%3C/text%3E%3C/svg%3E',
                tag: data.tag || 'gootpv-notification',
                requireInteraction: false,
                actions: data.actions || []
            })
        );
    }
});

// Click en notificación
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.openWindow('/')
    );
});

// Mensajes desde la app principal
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data === 'GET_VERSION') {
        event.ports[0].postMessage(CACHE_NAME);
    }
});

console.log('[SW] Service Worker GooTpv cargado');