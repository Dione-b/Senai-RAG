/**
 * Service worker do PocketRAG (escrito à mão, sem dependências).
 *
 * Estratégia:
 *  - Navegações (HTML): rede com fallback para o shell cacheado (offline).
 *  - Assets mesma origem (js/css/wasm/png): cache-first (nomes têm hash).
 *  - /api/* e requisições cross-origin: sempre rede (nunca intercepta).
 *
 * Ao fazer bump de CACHE_VERSION, os caches antigos são removidos no activate.
 */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `pocketrag-${CACHE_VERSION}`;

/** Shell mínimo para o app abrir offline. */
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {
        // Pré-cache parcial não deve impedir a instalação.
      }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('pocketrag-') && key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Só GET: POST /api/answer (e similares) vai direto para a rede.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Outra origem (ex.: CDN sob COEP): não cachea.
  if (url.origin !== self.location.origin) return;

  // API sempre via rede, sem cache.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(handleAsset(request));
});

/** HTML: rede primeiro; offline, devolve o shell cacheado. */
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      // O servidor faz fallback para index.html em qualquer rota (SPA).
      await cache.put('/', response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match('/');
    if (cached) return cached;
    return new Response('Você está offline e o app ainda não foi cacheado.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/** Assets: cache primeiro; miss, busca e guarda. */
async function handleAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}
