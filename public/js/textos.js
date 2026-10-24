/* Textos de la web que es canvien des de l'app (bloc Pàgines → taula «pagines» de Supabase).
   Cada element amb data-text="<clau>" porta escrit a l'HTML el text de sempre; si a Supabase n'hi ha un de desat
   (i no és buit), el substitueix. Un <div> rep paràgrafs; un <p>, el text amb salts de línia.
   Sense Supabase, o si falla la connexió, es queda el text de l'HTML. */
(function () {
  'use strict';
  var S = window.Segur;
  var els = document.querySelectorAll('[data-text]');
  if (!S || !els.length || !S.config()) return;
  S.llegeix('pagines?select=clau,contingut').then(function (l) {
    var t = {};
    l.forEach(function (x) { if (x && typeof x.contingut === 'string' && x.contingut.trim()) t[x.clau] = x.contingut; });
    Array.prototype.forEach.call(els, function (e) {
      var v = t[e.getAttribute('data-text')];
      if (!v) return;
      var frag = S.paragrafs(v);
      if (e.tagName === 'P') {
        e.textContent = '';
        Array.prototype.forEach.call(frag.childNodes, function (p, i) {
          if (i) { e.appendChild(document.createElement('br')); e.appendChild(document.createElement('br')); }
          while (p.firstChild) e.appendChild(p.firstChild);
        });
      } else { e.textContent = ''; e.appendChild(frag); }
    });
  }).catch(function () { /* es queda el text de l'HTML */ });
})();
