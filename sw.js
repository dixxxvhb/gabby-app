/* Bluebird service worker - network-first app shell with offline cache, network-first everything else. */
var CACHE = "bluebird-shell-v2";
var SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./modules/pwa.js",
  "./modules/voice.js",
  "./data/prompts.js",
  "./data/trivia.json",
  "./manifest.webmanifest",
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,600&family=Nunito:wght@400;600;800&display=swap"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isShellRequest(url) {
  return SHELL.some(function (s) {
    if (s.indexOf("http") === 0) return url === s;
    return url.indexOf(location.origin) === 0 && url.replace(location.origin, "").replace(/^\//, "./") === s.replace(/^\.\//, "./");
  }) || /\.(css|js|json|woff2?)(\?|$)/.test(url) || /\/$/.test(url);
}

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = e.request.url;

  if (e.request.mode === "navigate" || isShellRequest(url)) {
    // network-first for the app shell so every push reaches her; cache is the offline fallback
    e.respondWith(
      fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(e.request).then(function (hit) {
          return hit || (e.request.mode === "navigate" ? caches.match("./index.html") : undefined);
        });
      })
    );
    return;
  }

  // network-first for everything else (Gemini calls, external data)
  e.respondWith(
    fetch(e.request).then(function (res) {
      return res;
    }).catch(function () {
      return caches.match(e.request);
    })
  );
});
