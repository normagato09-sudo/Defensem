/* Entitats adherides (/recursos.html#entitats).
   - Llegeix de la taula «entitats» de Supabase NOMÉS les publicades (ho garanteix la política RLS; el filtre
     publicada=eq.true només evita demanar res més). Sense Supabase configurat, es mostra l'estat buit.
   - Les entitats només s'afegeixen des de l'app de la zona privada (/app → Entitats). */
(function () {
  'use strict';
  var S = window.Segur, cfg = S && S.config();
  // Mateixa llista que el check de supabase/schema.sql.
  var TIPUS = { associacio: 'Associació', collectiu: 'Col·lectiu', entitat_veinal: 'Entitat veïnal', fundacio: 'Fundació',
    cooperativa: 'Cooperativa', sindicat: 'Sindicat o organització professional', observatori: 'Observatori',
    xarxa: 'Xarxa d’entitats', altres: 'Altres' };
  var BUIT = 'Aviat hi trobareu les entitats adherides.';

  var llista = document.getElementById('ent-llista');
  var totes = [];

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }

  function estatBuit() {
    llista.textContent = '';
    var b = el('div', 'buit ent-buit');
    b.appendChild(el('p', null, BUIT));
    llista.appendChild(b);
  }

  function enllac(href, text, nom) {
    var a = el('a', null, text);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', (text === 'Visita la web' ? 'Visita la web de ' : text + ' de ') + nom + ' (s’obre en una pestanya nova)');
    return a;
  }

  function targeta(e) {
    var c = el('article', 'card ent-card');
    var cap = el('div', 'ent-cap');
    // Logo: fitxer de Storage o, provisionalment, adreça https:// externa.
    var src = !e.logo ? '' : /^https:\/\//i.test(e.logo) ? S.enllac(e.logo) : S.urlImatge(null, e.logo);
    if (src) {
      var i = document.createElement('img');
      i.src = src; i.alt = 'Logo de ' + e.nom; i.loading = 'lazy'; i.className = 'ent-logo'; i.referrerPolicy = 'no-referrer';
      i.onerror = function () { i.remove(); };
      cap.appendChild(i);
    }
    var tit = el('div', 'ent-tit');
    tit.appendChild(el('span', 'etiq', TIPUS[e.tipus] || 'Altres'));
    tit.appendChild(el('h3', null, e.nom));
    if (e.municipi) tit.appendChild(el('p', 'ent-mun', e.municipi));
    cap.appendChild(tit);
    c.appendChild(cap);
    var tx = el('div', 'tx');
    if (e.descripcio) tx.appendChild(el('p', null, e.descripcio));
    var web = /^https:\/\//i.test(e.web || '') ? S.enllac(e.web) : '';
    var ig = /^https:\/\/(www\.)?instagram\.com\//i.test(e.instagram || '') ? S.enllac(e.instagram) : '';
    if (web || ig) {
      var l = el('p', 'ent-enllacos');
      if (web) { var v = enllac(web, 'Visita la web', e.nom); v.className = 'btn'; l.appendChild(v); }
      if (ig) l.appendChild(enllac(ig, 'Instagram', e.nom));
      tx.appendChild(l);
    }
    c.appendChild(tx);
    return c;
  }

  function pinta(l) {
    totes = l.filter(function (e) { return e && typeof e.nom === 'string' && e.nom; })
      .sort(function (a, b) { return a.nom.localeCompare(b.nom, 'ca'); });
    if (!totes.length) { estatBuit(); return; }
    llista.textContent = '';
    totes.forEach(function (e) { llista.appendChild(targeta(e)); });
  }

  if (!cfg) estatBuit();
  else {
    fetch(cfg.url + '/rest/v1/entitats?select=id,nom,tipus,municipi,descripcio,web,instagram,logo&publicada=eq.true&order=nom.asc',
      { headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key } })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (l) { pinta(Array.isArray(l) ? l : []); })
      .catch(function () {
        llista.textContent = '';
        llista.appendChild(el('p', 'buit', 'Ara mateix no podem carregar la llista d’entitats. Torna-ho a provar més tard.'));
      });
  }

})();
