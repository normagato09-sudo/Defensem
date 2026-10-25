/* Capçalera i peu comuns de totes les pàgines públiques (un sol lloc per canviar el menú o el peu).
   Ús, a cada pàgina:
     <body data-pagina="agenda">                                   ← clau de la pàgina actual (es marca al menú)
     <script src="/js/marc.js" data-part="cap"></script>           ← just després de <body>: «Salta al contingut» i capçalera
     <main id="inici" tabindex="-1">…</main>
     <script src="/js/marc.js" data-part="peu"></script>           ← just després de </main>: peu
   S'executa en el moment (sense defer), així la capçalera es veu des del primer pintat, sense salts.
   El menú (desplegables; en mòbil, acordió dins del menú) el gestiona /js/menu.js. La capçalera és fixa; la seva alçada
   real es desa a --alt-cap. El peu porta el lema, el correu i Instagram; els textos amb data-text es poden
   canviar des de l'app (bloc Pàgines) i els posa /js/textos.js.
   Els elements amb [data-peticio] de qualsevol pàgina reben l'enllaç de la petició. */
(function () {
  'use strict';
  // Enllaç de la petició (formulari de Google). És l'únic lloc on s'ha de canviar.
  var PETICIO = 'https://docs.google.com/forms/d/e/1FAIpQLSf6IsYYaV5FMGA-Qw-Khk-ff-6PxW5JrYaxLETymXJ7eg7CJg/viewform';
  var INSTAGRAM = 'https://www.instagram.com/defensemlempordanet/';
  var CORREU = 'defensemlempordanet@gmail.com';
  // Menú: [clau, adreça (o null si només obre el submenú), text, submenú]. El logo porta a l'inici.
  var MENU = [
    ['qui-som', '/qui-som.html', 'Qui som'],
    ['actualitat', '/actualitat.html', 'Actualitat', [
      ['noticies-defensem', '/noticies-defensem.html', 'Notícies de Defensem'],
      ['noticies-renovables', '/noticies-renovables.html', 'Notícies d’energies renovables'],
      ['agenda', '/agenda.html', 'Agenda']]],
    ['projectes', null, 'Projectes', [
      ['projecte-la-tallada', '/projecte-la-tallada.html', 'Aerogeneradors de La Tallada'],
      ['projecte-albons', '/projecte-albons.html', 'Aerogenerador d’Albons']]],
    ['recursos', null, 'Recursos', [
      ['documents', '/documents.html', 'Informació'],
      ['entitats', '/entitats.html', 'Entitats'],
      ['eines', '/eines.html', 'Eines']]]
  ];
  var LEGALS = [
    ['/avis-legal.html', 'Avís legal'], ['/privacitat.html', 'Política de privacitat'],
    ['/cookies.html', 'Política de cookies'], ['/preferencies-cookies.html', 'Preferències de cookies']
  ];

  var script = document.currentScript;
  if (!script) return;
  var part = script.getAttribute('data-part');
  var actual = document.body.getAttribute('data-pagina') || '';

  function peticio(a) {
    a.href = PETICIO; a.target = '_blank'; a.rel = 'noopener noreferrer';
    if (!a.getAttribute('aria-label')) a.setAttribute('aria-label', (a.textContent || 'Signa la petició').trim() + ' (s’obre en una pestanya nova, formulari de Google)');
  }

  var FLETXA = '<svg viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="M1 1.5l5 5 5-5"/></svg>';
  function enllacMenu(m) {
    return '<a href="' + m[1] + '"' + (m[0] === actual ? ' aria-current="page"' : '') + '>' + m[2] + '</a>';
  }
  function element(m) {
    if (!m[3]) return '<li>' + enllacMenu(m) + '</li>';
    var id = 'sub-' + m[0], dins = m[3].some(function (f) { return f[0] === actual; }) || m[0] === actual;
    var boto = m[1]
      ? enllacMenu(m) + '<button type="button" class="desp-b" aria-expanded="false" aria-controls="' + id + '" aria-label="Mostra el submenú ' + m[2] + '">' + FLETXA + '</button>'
      : '<button type="button" class="desp-b desp-t" aria-expanded="false" aria-controls="' + id + '">' + m[2] + FLETXA + '</button>';
    return '<li class="desp' + (dins ? ' actiu' : '') + '"><div class="desp-cap">' + boto + '</div>' +
      '<ul class="sub" id="' + id + '">' + m[3].map(function (f) { return '<li>' + enllacMenu(f) + '</li>'; }).join('') + '</ul></li>';
  }

  if (part === 'cap') {
    var items = MENU.map(element).join('');
    script.insertAdjacentHTML('beforebegin',
      '<a class="salta" href="#inici">Salta al contingut</a>' +
      '<header class="cap"><div class="w bar">' +
        '<a class="logo" href="/"' + (actual === 'inici' ? ' aria-current="page"' : '') + '>Defensem <b>l’Empordanet</b></a>' +
        '<nav id="nav" aria-label="Principal"><ul>' + items + '</ul></nav>' +
        '<a class="btn btn-peticio" data-peticio>Signa la petició</a>' +
        '<button id="mb" type="button" aria-expanded="false" aria-controls="nav">Menú</button>' +
      '</div></header>');
    peticio(document.querySelector('header.cap [data-peticio]'));
    // La capçalera queda fixa a dalt: el contingut comença just a sota (padding-top del <body>) i els salts a
    // una àncora hi deixen el mateix marge, amb l'alçada real (canvia entre mòbil i escriptori o si el logo fa dues línies).
    var capcalera = document.querySelector('header.cap'), arrel = document.documentElement;
    arrel.classList.add('amb-cap');
    var mesura = function () { arrel.style.setProperty('--alt-cap', capcalera.offsetHeight + 'px'); };
    mesura();
    if (window.ResizeObserver) new ResizeObserver(mesura).observe(capcalera); else window.addEventListener('resize', mesura);
  } else if (part === 'peu') {
    script.insertAdjacentHTML('beforebegin',
      '<footer id="peu"><div class="w peu-graella">' +
        '<div class="peu-marca"><div class="cond">Defensem l’Empordanet</div>' +
          '<p data-text="peu-lema">Pensem en el que tenim, en el que som i en el que deixarem.</p></div>' +
        '<section class="peu-contacte" id="contacte" aria-labelledby="contacte-t"><h2 class="cond" id="contacte-t">Contacte</h2><ul class="contacte">' +
          '<li><span class="cond">Correu electrònic</span><a href="mailto:' + CORREU + '">' + CORREU + '</a></li>' +
          '<li><span class="cond">Instagram</span><a href="' + INSTAGRAM + '" target="_blank" rel="noopener noreferrer" aria-label="Instagram de Defensem l’Empordanet (s’obre en una pestanya nova)">@defensemlempordanet</a></li>' +
        '</ul></section>' +
      '</div>' +
      '<div class="w peu-petit"><p class="small">Web de la iniciativa ciutadana Defensem l’Empordanet · <a href="mailto:' + CORREU + '">' + CORREU + '</a> · ' +
          '<a href="' + INSTAGRAM + '" target="_blank" rel="noopener noreferrer">Instagram</a></p></div>' +
      '<div class="peu-legal"><div class="w"><ul class="legal">' +
        LEGALS.map(function (l) { return '<li><a href="' + l[0] + '">' + l[1] + '</a></li>'; }).join('') +
      '</ul></div></div></footer>');
    // Ara ja és tot el document: enllaços de la petició dins del contingut (portada, joc…).
    Array.prototype.forEach.call(document.querySelectorAll('[data-peticio]'), peticio);
  }
})();
