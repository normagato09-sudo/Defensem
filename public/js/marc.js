/* Capçalera i peu comuns de totes les pàgines públiques (un sol lloc per canviar el menú o el peu).
   Ús, a cada pàgina:
     <body data-pagina="agenda">                                   ← clau de la pàgina actual (es marca al menú)
     <script src="/js/marc.js" data-part="cap"></script>           ← just després de <body>: «Salta al contingut» i capçalera
     <main id="inici" tabindex="-1">…</main>
     <script src="/js/marc.js" data-part="peu"></script>           ← just després de </main>: peu
   S'executa en el moment (sense defer), així la capçalera es veu des del primer pintat, sense salts.
   El menú mòbil (botó «Menú») el gestiona /js/menu.js. La capçalera és fixa; la seva alçada real es desa a --alt-cap.
   Els elements amb [data-peticio] de qualsevol pàgina reben l'enllaç de la petició.
   Pàgina del joc (/joc): data-part="cap-minim" (només el logo i «Signa la petició») i data-part="peu-minim"
   (només els enllaços legals), per deixar tota la pantalla al joc. */
(function () {
  'use strict';
  // Enllaç de la petició (formulari de Google). És l'únic lloc on s'ha de canviar.
  var PETICIO = 'https://docs.google.com/forms/d/e/1FAIpQLSf6IsYYaV5FMGA-Qw-Khk-ff-6PxW5JrYaxLETymXJ7eg7CJg/viewform';
  var INSTAGRAM = 'https://www.instagram.com/defensemlempordanet/';
  var CORREU = 'defensemlempordanet@gmail.com';
  var MENU = [
    ['inici', '/', 'Inici'],
    ['qui-som', '/qui-som.html', 'Qui som'],
    ['actualitat', '/actualitat.html', 'Actualitat'],
    ['recursos', '/recursos.html', 'Recursos'],
    ['contacte', '/contacte.html', 'Contacte']
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

  if (part === 'cap') {
    var items = MENU.map(function (m) {
      return '<li><a href="' + m[1] + '"' + (m[0] === actual ? ' aria-current="page"' : '') + '>' + m[2] + '</a></li>';
    }).join('');
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
  } else if (part === 'cap-minim') {
    script.insertAdjacentHTML('beforebegin',
      '<a class="salta" href="#inici">Salta al contingut</a>' +
      '<header class="cap cap-minim"><div class="w bar">' +
        '<a class="logo" href="/">Defensem <b>l’Empordanet</b></a>' +
        '<a class="btn btn-peticio" data-peticio>Signa la petició</a>' +
      '</div></header>');
    peticio(document.querySelector('header.cap [data-peticio]'));
  } else if (part === 'peu-minim') {
    script.insertAdjacentHTML('beforebegin',
      '<footer class="peu-minim"><div class="peu-legal"><div class="w"><ul class="legal">' +
        LEGALS.map(function (l) { return '<li><a href="' + l[0] + '">' + l[1] + '</a></li>'; }).join('') +
      '</ul></div></div></footer>');
    Array.prototype.forEach.call(document.querySelectorAll('[data-peticio]'), peticio);
  } else if (part === 'peu') {
    script.insertAdjacentHTML('beforebegin',
      '<footer><div class="w">' +
        '<div class="cond">Defensem l’Empordanet</div>' +
        '<p>Pensem en el que tenim, en el que som i en el que deixarem.</p>' +
        '<p class="small">Web de l’Associació Defensem l’Empordanet · <a href="mailto:' + CORREU + '">' + CORREU + '</a> · ' +
          '<a href="' + INSTAGRAM + '" target="_blank" rel="noopener noreferrer">Instagram</a></p>' +
      '</div>' +
      '<div class="peu-legal"><div class="w"><ul class="legal">' +
        LEGALS.map(function (l) { return '<li><a href="' + l[0] + '">' + l[1] + '</a></li>'; }).join('') +
      '</ul></div></div></footer>');
    // Ara ja és tot el document: enllaços de la petició dins del contingut (portada, joc…).
    Array.prototype.forEach.call(document.querySelectorAll('[data-peticio]'), peticio);
  }
})();
