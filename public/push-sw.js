// Service worker thông báo đẩy Fly To Sky: hiện thông báo kể cả khi đã đóng trang; bấm vào mở đúng trang cần xử lý.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: event.data && event.data.text() }; }
  const title = d.title || 'Thông báo mới';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: d.icon || self.FTS_PUSH_ICON || '/favicon.ico',
    badge: d.badge || self.FTS_PUSH_BADGE || undefined,
    tag: d.tag || undefined,
    renotify: !!d.tag,
    timestamp: d.ts || Date.now(),
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { try { await w.focus(); if ('navigate' in w) await w.navigate(target); return; } catch { /* mở cửa sổ mới */ } }
    }
    await self.clients.openWindow(target);
  })());
});

// Trình duyệt đổi khoá đăng ký → đăng ký lại với máy chủ.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const key = await (await fetch(self.FTS_PUSH_KEY_URL || '/api/push/key', { credentials: 'include' })).json();
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key.publicKey });
      await fetch(self.FTS_PUSH_SUBSCRIBE_URL || '/api/push/subscribe', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), renewed: true }) });
    } catch { /* lần mở trang sau sẽ tự đăng ký lại */ }
  })());
});
