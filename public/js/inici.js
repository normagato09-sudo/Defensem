/* Portada: els propers actes de l'agenda.
   L'agenda només s'escriu a /agenda.html (una sola font): aquí es llegeix aquella pàgina i se'n mostren els
   actes que encara no han passat (data-fins >= avui), el més proper primer, com a targetes que hi enllacen. */
(function () {
  'use strict';
  var box = document.getElementById('propers');
  if (!box) return;
  var MAX = 3;
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function buit() {
    box.textContent = '';
    var p = el('p', 'agenda-buit', 'Ara mateix no hi ha cap acte anunciat. Segueix-nos a ');
    var a = el('a', null, 'Instagram');
    a.href = 'https://www.instagram.com/defensemlempordanet/'; a.target = '_blank'; a.rel = 'noopener noreferrer';
    p.appendChild(a); p.appendChild(document.createTextNode(' per saber quan és el proper.'));
    box.appendChild(p);
  }
  var d = new Date();
  var avui = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  fetch('/agenda.html').then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');   // document inert: no s'hi executa res
    var actes = Array.prototype.slice.call(doc.querySelectorAll('#actes li[data-fins]'))
      .filter(function (a) { return a.getAttribute('data-fins') >= avui; })
      .sort(function (a, b) { return a.getAttribute('data-fins') < b.getAttribute('data-fins') ? -1 : 1; })
      .slice(0, MAX);
    if (!actes.length) { buit(); return; }
    box.textContent = '';
    var ul = el('ul', 'propers-llista');
    actes.forEach(function (a) {
      var t = a.querySelector('time'), h = a.querySelector('h3'), lloc = a.querySelector('.lloc');
      var li = el('li'), en = el('a', 'card proper');
      en.href = '/agenda.html';
      var tx = el('div', 'tx');
      if (t) { var tm = el('time', null, t.textContent); tm.setAttribute('datetime', t.getAttribute('datetime') || ''); tx.appendChild(tm); }
      tx.appendChild(el('h3', null, h ? h.textContent : ''));
      if (lloc) tx.appendChild(el('p', 'lloc', lloc.textContent));
      en.appendChild(tx); li.appendChild(en); ul.appendChild(li);
    });
    box.appendChild(ul);
  }).catch(buit);
})();
