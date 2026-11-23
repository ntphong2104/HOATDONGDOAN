/* Service Worker for Hoạt Động Đoàn PTIT HCM — Web Push (iOS 16.4+ PWA, Android, Desktop) */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Hoạt Động Đoàn PTIT HCM',
    body: 'Bạn có thông báo mới từ Đoàn Thanh Niên PTIT HCM.',
    url: '/',
    tag: 'ptit-doan-notification',
    icon: '/icon-192.png?v=doan3',
    badge: '/favicon-32x32.png?v=doan',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = {
          ...payload,
          ...parsed,
        };
      }
    }
  } catch {
    try {
      const txt = event.data ? event.data.text() : '';
      if (txt) payload.body = txt;
    } catch {}
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/icon-192.png?v=doan3',
    badge: payload.badge || '/favicon-32x32.png?v=doan',
    tag: payload.tag || 'ptit-doan-notification',
    renotify: true,
    data: {
      url: payload.url || '/',
    },
  };

  const tasks = [self.registration.showNotification(payload.title, options)];
  if (typeof self.navigator !== 'undefined' && typeof self.navigator.setAppBadge === 'function') {
    const badgeCount = typeof payload.badgeCount === 'number' && payload.badgeCount > 0 ? payload.badgeCount : 1;
    tasks.push(self.navigator.setAppBadge(badgeCount).catch(() => {}));
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawTarget = (event.notification.data && event.notification.data.url) || '/';
  let targetUrl = self.location.origin + '/';
  try {
    const candidate = typeof rawTarget === 'string' && rawTarget.startsWith('/') && !rawTarget.startsWith('//') && !rawTarget.startsWith('/\\')
      ? rawTarget
      : '/';
    const parsed = new URL(candidate, self.location.origin);
    if (parsed.origin === self.location.origin) {
      targetUrl = parsed.href;
    }
  } catch {}

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetUrl).catch(() => {});
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
