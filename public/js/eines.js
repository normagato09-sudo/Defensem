/* Eines (/eines.html): visors per analitzar el territori.
   Es gestionen des de l'àrea privada (Eines) i es llegeixen de la taula «eines» de Supabase: NOMÉS les publicades
   (ho garanteix la política RLS; el filtre publicada=eq.true només evita demanar res més), en l'ordre desat.
   Sense Supabase configurat o sense cap eina publicada, es mostra la targeta «Pròximament». */
(function () {
  'use strict';
  var S = window.Segur, cfg = S && S.config();
  // Mateixa llista que el check de supabase/schema.sql.
  var CATEGORIES = { urbanisme: 'Urbanisme', energia: 'Energia', paisatge: 'Paisatge', medi_natural: 'Medi natural', altres: 'Altres' };
  var BUIT = 'Aviat hi trobareu eines per analitzar el territori.';
  var llista = document.getElementById('eines-llista');
  if (!llista) return;

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function segura(u) {
    try { var x = new URL(u); return x.protocol === 'https:' ? x.href : ''; } catch (e) { return ''; }
  }
  function missatge(t) { llista.textContent = ''; llista.appendChild(el('p', 'buit', t)); }

  function targeta(e) {
    var c = el('article', 'card eina');
    var tx = el('div', 'tx');
    tx.appendChild(el('span', 'etiq', CATEGORIES[e.categoria]));
    tx.appendChild(el('h3', null, e.nom));
    if (e.organisme) tx.appendChild(el('p', 'eina-org', e.organisme));
    tx.appendChild(el('p', null, e.descripcio || ''));
    var acc = el('div', 'eina-accions');
    var a = el('a', 'btn', 'Obre el visor');
    a.href = segura(e.url); a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', 'Obre ' + e.nom + ' (s’obre en una pestanya nova)');
    acc.appendChild(a);
    tx.appendChild(acc);
    c.appendChild(tx);
    return c;
  }

  function pinta(totes) {
    var eines = totes.filter(function (e) { return e && e.nom && CATEGORIES[e.categoria] && segura(e.url); });
    if (!eines.length) { llista.textContent = ''; llista.appendChild(S.proximament(BUIT)); return; }
    llista.textContent = '';
    eines.forEach(function (e) { llista.appendChild(targeta(e)); });
  }

  if (!cfg) { llista.textContent = ''; llista.appendChild(S.proximament(BUIT)); return; }
  fetch(cfg.url + '/rest/v1/eines?select=id,nom,organisme,descripcio,url,categoria,ordre&publicada=eq.true&order=ordre.asc,nom.asc',
    { headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key } })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (l) { pinta(Array.isArray(l) ? l : []); })
    .catch(function () { missatge('Ara mateix no podem carregar les eines. Torna-ho a provar més tard.'); });
})();
