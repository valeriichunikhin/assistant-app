// The Home Screen app's service worker (docs/specs/pwa-push.md): shows the pushes the `push` function
// sends and opens the app on a tap. A push with nid (its row in the notification center, docs/specs/notif-center.md)
// opens «Уведомления» on it.
// Since 05.11.2026 it also serves the page itself from its cache (docs/specs/app-page-cache.md): stale-while-revalidate
// on the app's navigations only, a fresh copy fetched behind it, and a changed <meta name="published"> stamp told to
// the windows ({type: 'update'}), which offer «Обновить». Everything else (the API, changelog, desktop*, brands/,
// icons/, gym/, fonts/) passes by untouched.
// The switch: PAGE_CACHE = false sets no fetch handler and activate drops the cache — the page is live again on the
// next open (the browser checks sw.js on every one). A new CACHE name drops the old copy the same way.
// Turning it back on takes a new CACHE name too (page-v2, …): the old worker may still put a copy into page-v1 after
// the switch-off's activate has dropped it, and activate keeps only CACHE.
var PAGE_CACHE = true;
var CACHE = 'page-v1';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE || !PAGE_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// The page's stamp, as the publish script writes it; '' when there is none.
function stamp(text) {
  var m = /<meta name="published" content="([^"]*)">/.exec(text || '');
  return m ? m[1] : '';
}

// The page's own address: the scope or scope + index.html, whatever the query and hash (?key=…, #tab). Other pages in
// the scope (privacy.html) and files opened directly are not the app and go to the network as before.
function isPage(req) {
  if (req.mode !== 'navigate') return false;
  var u = new URL(req.url), s = new URL(self.registration.scope);
  return u.origin === s.origin && (u.pathname === s.pathname || u.pathname === s.pathname + 'index.html');
}

// A 200 basic answer goes into the cache under the scope, with x-page-cache: hit so a copy served from it is told
// apart from the network's; resolves with the page's text, or null when nothing was kept.
function keep(res) {
  if (!res || res.status !== 200 || res.type !== 'basic') return Promise.resolve(null);
  return res.clone().text().then(function (text) {
    var h = new Headers(res.headers);
    h.set('x-page-cache', 'hit');
    h.delete('content-length');
    h.delete('content-encoding');
    return caches.open(CACHE).then(function (c) {
      return c.put(self.registration.scope, new Response(text, { status: 200, statusText: 'OK', headers: h }));
    }).then(function () { return text; });
  });
}

// {type: 'update'} to every window of the app, and to the one this navigation is opening: before its document runs it
// is not in matchAll yet, and clients.get waits for it.
function tell(msg, id) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    var seen = false;
    list.forEach(function (c) {
      if (c.id === id) seen = true;
      c.postMessage(msg);
    });
    if (seen || !id) return;
    return self.clients.get(id).then(function (c) { if (c) c.postMessage(msg); });
  }).catch(function () {});
}

if (PAGE_CACHE) self.addEventListener('fetch', function (e) {
  if (!isPage(e.request)) return;
  var id = e.resultingClientId;
  // A cache that cannot be read (evicted, quota, WebKit's «Unable to open cache») counts as no copy: the network.
  var hit = caches.open(CACHE).then(function (c) { return c.match(self.registration.scope); }).catch(function () { return null; });
  // No copy yet: the network's answer, kept on the way (keep clones it before the page reads the body).
  var first = hit.then(function (r) { return r ? null : fetch(e.request); });
  var kept = first.then(keep);
  // A copy: it goes out at once; the fresh page (by its address: a navigation request takes no init in every engine)
  // replaces it behind, and a new stamp is told to the windows.
  var fresh = hit.then(function (r) {
    if (!r) return;
    var was = r.clone().text().then(stamp);
    return fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(keep).then(function (text) {
      if (text === null) return;
      return was.then(function (old) {
        var now = stamp(text);
        if (now && now !== old) return tell({ type: 'update', published: now }, id);
      });
    });
  });
  e.respondWith(hit.then(function (r) { return r || first; }));
  e.waitUntil(Promise.all([kept, fresh]).catch(function () {}));
});

self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data && e.data.text() }; }
  // iOS revokes the subscription after pushes that show nothing, so every push shows a notification.
  e.waitUntil(self.registration.showNotification(data.title || 'naL3ON', {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url, nid: data.nid },
    tag: data.tag
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var d = e.notification.data || {}, url = d.url || './';
  // The push's url is #notif/<nid>?to=… already; an older sender's url without it still lands on the entry.
  if (d.nid && url.indexOf('#notif/') < 0) url = './#notif/' + d.nid;
  var target = new URL(url, self.registration.scope).href;
  // A push only ever opens the app itself: a url outside its scope opens the app's start.
  if (target.indexOf(self.registration.scope) !== 0) target = self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
        // Focus first, then move it to the push's tab; a client the worker does not control cannot navigate.
        // iOS has no WindowClient.navigate (02.11.2026: a tap only brought the app up on its last tab), so the page
        // is told the address too and moves itself; navigate stays for the browsers that have it.
        c.postMessage({ type: 'open', url: target });
        return c.focus().then(function (w) {
          if (w && w.url !== target && 'navigate' in w) return w.navigate(target).catch(function () {});
        });
      }
    }
    return self.clients.openWindow(target);
  }));
});
