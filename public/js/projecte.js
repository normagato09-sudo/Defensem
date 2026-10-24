/* Pàgines de projecte (/projecte-la-tallada.html, /projecte-albons.html): mateixa plantilla.
   Llegeix el projecte de la taula «projectes» de Supabase (NOMÉS si està publicat: ho garanteix la política RLS)
   i en pinta la descripció, el mapa i la situació actual. Es gestiona des de l'app (bloc Projectes).
   Sense Supabase, sense projecte publicat o si falla la connexió, es queda la targeta «Pròximament» de l'HTML.
   Els documents i les notícies relacionades els pinten /js/documents.js i /js/noticies.js. */
(function () {
  'use strict';
  var S = window.Segur, caixa = document.getElementById('projecte-info');
  if (!S || !caixa || !S.config()) return;
  var id = caixa.getAttribute('data-projecte');
  if (!/^(la-tallada|albons)$/.test(id || '')) return;
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x) e.textContent = x; return e; }
  function bloc(idBloc, titol, cos) {
    var s = el('section'); s.id = idBloc; s.setAttribute('aria-labelledby', idBloc + '-t');
    var h = el('h2', null, titol); h.id = idBloc + '-t';
    s.appendChild(h); s.appendChild(cos);
    return s;
  }
  S.llegeix('projectes?select=id,titol,descripcio,mapa,mapa_enllac,situacio&publicada=eq.true&id=eq.' + id).then(function (l) {
    var p = l[0];
    if (!p || !(p.descripcio || '').trim()) return;
    caixa.textContent = '';
    var d = el('div', 'txt'); d.appendChild(S.paragrafs(p.descripcio));
    caixa.appendChild(bloc('descripcio', 'Descripció', d));
    var src = S.urlImatge(null, p.mapa), enllac = /^https:\/\//i.test(p.mapa_enllac || '') ? S.enllac(p.mapa_enllac) : '';
    var mapa;
    if (src || enllac) {
      mapa = el('figure', 'projecte-mapa');
      if (src) {
        var i = document.createElement('img'); i.src = src; i.alt = 'Mapa del projecte ' + (p.titol || ''); i.loading = 'lazy'; i.decoding = 'async';
        i.onerror = function () { i.remove(); };
        mapa.appendChild(i);
      }
      if (enllac) {
        var a = el('a', null, 'Obre el mapa'); a.href = enllac; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', 'Obre el mapa del projecte (s’obre en una pestanya nova)');
        mapa.appendChild(a);
      }
    } else mapa = S.proximament('Aviat hi trobareu el mapa del projecte.', true);
    caixa.appendChild(bloc('mapa', 'Mapa', mapa));
    var sit;
    if ((p.situacio || '').trim()) { sit = el('div', 'situacio'); sit.appendChild(S.paragrafs(p.situacio)); }
    else sit = S.proximament('Aviat hi trobareu la situació actual del projecte.', true);
    caixa.appendChild(bloc('situacio', 'Situació actual', sit));
  }).catch(function () { /* es queda «Pròximament» */ });
})();
