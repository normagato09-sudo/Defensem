/* Botó d'ull per mostrar o amagar la contrasenya. S'aplica a cada input amb l'atribut data-ull.
   Canvia només el type (password ↔ text): el valor no es toca i es conserven el focus i el cursor.
   En enviar el formulari o en sortir de la pàgina, el camp torna a quedar amagat. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var ULL = ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'];
  var TACAT = ['M10.6 5.1A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6',
    'M9.9 9.9a3 3 0 0 0 4.2 4.2', 'M3 3l18 18'];

  function icona(camins) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    camins.forEach(function (d) { var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.appendChild(p); });
    return svg;
  }

  function prepara(input) {
    var embolcall = document.createElement('span');
    embolcall.className = 'pw';
    input.parentNode.insertBefore(embolcall, input);
    embolcall.appendChild(input);

    var boto = document.createElement('button');
    boto.type = 'button';
    boto.className = 'pw-ull';
    boto.setAttribute('aria-controls', input.id);
    embolcall.appendChild(boto);

    function posa(visible) {
      boto.textContent = '';
      boto.appendChild(icona(visible ? TACAT : ULL));
      boto.setAttribute('aria-label', visible ? 'Amagar contrasenya' : 'Mostrar contrasenya');
      boto.setAttribute('aria-pressed', String(visible));
    }
    function amaga() { if (input.type !== 'password') { input.type = 'password'; posa(false); } }

    // Amb ratolí o tacte, el clic no treu el focus del camp (així el teclat del mòbil no es tanca).
    boto.addEventListener('mousedown', function (e) { if (document.activeElement === input) e.preventDefault(); });
    boto.addEventListener('click', function () {
      var inici = input.selectionStart, fi = input.selectionEnd, teniaFocus = document.activeElement === input;
      var visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      posa(visible);
      try { if (inici != null) input.setSelectionRange(inici, fi); } catch (e) { /* alguns navegadors no ho permeten */ }
      if (teniaFocus) input.focus();
    });
    if (input.form) input.form.addEventListener('submit', amaga, true);
    window.addEventListener('pagehide', amaga);
    posa(false);
  }

  Array.prototype.forEach.call(document.querySelectorAll('input[type=password][data-ull]'), prepara);
})();
