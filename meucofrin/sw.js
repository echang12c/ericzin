/* Service worker do SeuCofrin — cache do app shell + estáticos */
const CACHE = 'cofre-v9';
const PRECACHE = [
  './',
  'index.html',
  'privacidade.html',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const LIFEPLAN = 'https://ericzin.pages.dev/#cofrin/metas';

/* Web Push: mostra a notificação enviada pelo worker cofre-notifier */
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch (_) { data = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(data.title || '🔔 SeuCofrin', {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url || LIFEPLAN },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || LIFEPLAN, self.registration.scope).href;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // reaproveita uma janela já aberta no destino; senão abre o Life Plan
      for (const c of list) {
        if (new URL(c.url).origin === new URL(alvo).origin && 'focus' in c) {
          return c.focus().then(w => (w && 'navigate' in w) ? w.navigate(alvo) : w);
        }
      }
      return clients.openWindow(alvo);
    })
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase, fontes e CDNs passam direto pela rede
  if (url.origin !== location.origin) return;

  // Navegação: rede primeiro (atualizações chegam logo), cache como fallback offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put('index.html', cp));
        return r;
      }).catch(() => caches.match('index.html'))
    );
    return;
  }

  // Estáticos do site (modelos 3D, silhuetas, ícones): cache primeiro
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(req, cp));
      }
      return r;
    }))
  );
});
