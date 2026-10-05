/* Service worker do Meu Cofrin dentro do LifePlan — só o push das metas do dia.
   Sem cache de propósito: o LifePlan é um arquivo só e deve sempre vir fresco da rede. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const LIFEPLAN = './#cofrin/metas';

/* Web Push: mostra a notificação enviada pelo worker cofre-notifier */
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch (_) { data = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(data.title || '🔔 Meu Cofrin', {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: 'cofrin-icon.png',
    badge: 'cofrin-icon.png',
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
