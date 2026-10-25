/* Service worker de l'app de la zona privada (abast: /app/).
   Només desa l'«armadura» de l'app (HTML, CSS, JS, fonts i icones) perquè s'obri ràpid i s'instal·li.
   MAI no desa dades: les peticions a Supabase (notícies, usuaris, sessió…) i a /api/ van sempre a la xarxa,
   i les respostes de fora d'aquest origen no es toquen. Estratègia: primer la xarxa i, si no n'hi ha, la còpia.
   Puja VERSIO quan canviïn aquests fitxers perquè es buidi la memòria cau antiga. */
var VERSIO = 'defensem-app-v6';
var ARMADURA = ['/app/', '/app/app.css', '/app/app.js', '/app/manifest.webmanifest', '/css/site.css', '/js/config.js', '/js/segur.js',
  '/js/vendor-supabase.js', '/fonts/open-sans-latin-wght-normal.woff2', '/img/logo-defensem.webp', '/app/icones/icona-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSIO).then(function (c) { return c.addAll(ARMADURA); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (l) {
    return Promise.all(l.filter(function (k) { return k.indexOf('defensem-app-') === 0 && k !== VERSIO; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;           // Supabase i qualsevol altre origen: ni tocar-ho
  var cami = url.pathname === '/app' ? '/app/' : url.pathname;
  if (req.mode === 'navigate') cami = '/app/';
  if (ARMADURA.indexOf(cami) === -1) return;                                       // només l'armadura de l'app
  e.respondWith(fetch(req).then(function (r) {
    if (r.ok && r.type === 'basic') { var copia = r.clone(); caches.open(VERSIO).then(function (c) { c.put(cami, copia); }); }
    return r;
  }).catch(function () { return caches.match(cami); }));
});
