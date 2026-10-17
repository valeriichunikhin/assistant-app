// The Home Screen app's service worker (docs/specs/pwa-push.md): shows the pushes the `push` function
// sends and opens the app on a tap. No caching and no fetch handler, so a published page is live at once.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data && e.data.text() }; }
  // iOS revokes the subscription after pushes that show nothing, so every push shows a notification.
  e.waitUntil(self.registration.showNotification(data.title || 'Assistant', {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url },
    tag: data.tag
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './';
  var target = new URL(url, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
        // Focus first, then move it to the push's tab; a client the worker does not control cannot navigate.
        return c.focus().then(function (w) {
          if (w && w.url !== target && 'navigate' in w) return w.navigate(target).catch(function () {});
        });
      }
    }
    return self.clients.openWindow(target);
  }));
});
