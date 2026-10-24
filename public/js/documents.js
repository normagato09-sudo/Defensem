/* Documents PDF (secció Informació). Cada contenidor <div data-documents> en pinta una llista:
     data-agrupa   agrupats per categoria (pàgina /documents.html)
     data-projecte només els relacionats amb aquest projecte (pàgines de projecte)
     data-buit     frase de la targeta «Pròximament» si no n'hi ha cap de publicat
   Es llegeixen de la taula «informacio» de Supabase (NOMÉS els publicats: ho garanteix la política RLS) i es
   gestionen des de l'app (bloc Informació). De cada document: títol, data i mida. S'obren en una pestanya nova. */
(function () {
  'use strict';
  var S = window.Segur;
  if (!S) return;
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x) e.textContent = x; return e; }
  function mida(b) {
    if (!(b > 0)) return '';
    return b >= 5e5 ? (b / 1e6).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1000)) + ' kB';
  }
  function element(d) {
    var url = S.urlPdf(null, d.fitxer);
    if (!url) return null;
    var li = el('li'), tx = el('div', 'doc-tx');
    li.appendChild(el('span', 'doc-ic', 'PDF'));
    var a = el('a', null, d.titol); a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.setAttribute('aria-label', d.titol + ' (PDF' + (mida(d.mida) ? ', ' + mida(d.mida) : '') + '; s’obre en una pestanya nova)');
    tx.appendChild(a);
    var meta = [];
    if (d.data) { var x = new Date(d.data + 'T12:00:00'); if (!isNaN(x)) meta.push(x.toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' })); }
    meta.push('PDF' + (mida(d.mida) ? ', ' + mida(d.mida) : ''));
    tx.appendChild(el('span', 'doc-meta', meta.join(' · ')));
    li.appendChild(tx);
    return li;
  }
  function llista(docs) {
    var ul = el('ul', 'docs-llista');
    docs.forEach(function (d) { var li = element(d); if (li) ul.appendChild(li); });
    return ul;
  }
  function pinta(caixa) {
    var projecte = caixa.getAttribute('data-projecte'), agrupa = caixa.hasAttribute('data-agrupa');
    var frase = caixa.getAttribute('data-buit') || 'Aviat hi trobareu documents per descarregar.';
    function buit() { caixa.textContent = ''; caixa.appendChild(S.proximament(frase, !agrupa)); }
    if (!S.config()) { buit(); return; }
    S.llegeix('informacio?select=id,titol,categoria,data,fitxer,mida,projecte&publicada=eq.true' +
      (/^(la-tallada|albons)$/.test(projecte || '') ? '&projecte=eq.' + projecte : '') + '&order=data.desc.nullslast,titol.asc')
      .then(function (l) {
        var docs = l.filter(function (d) { return d && d.titol && S.urlPdf(null, d.fitxer); });
        if (!docs.length) { buit(); return; }
        caixa.textContent = '';
        if (!agrupa) { caixa.appendChild(llista(docs)); return; }
        var cats = {};
        docs.forEach(function (d) { var c = (d.categoria || 'Altres').trim(); (cats[c] = cats[c] || []).push(d); });
        Object.keys(cats).sort(function (a, b) { return a.localeCompare(b, 'ca'); }).forEach(function (c) {
          var s = el('section', 'docs-cat'); s.appendChild(el('h2', null, c)); s.appendChild(llista(cats[c])); caixa.appendChild(s);
        });
      })
      .catch(buit);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-documents]'), pinta);
})();
