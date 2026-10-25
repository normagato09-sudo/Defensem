/* Agenda de Defensem l’Empordanet (/agenda.html i el bloc Agenda d’/actualitat.html).
   - Si Supabase està configurat, els actes es llegeixen de la taula «actes» (NOMÉS els publicats: ho garanteix
     la política RLS) i substitueixen els de l'HTML. Es gestionen des de l'app de la zona privada (/app → Agenda).
   - Si no (o si la taula encara no existeix), es fan servir els actes escrits a l'HTML, dins de <ol id="actes">,
     cada un amb data-fins="AAAA-MM-DD" (l'últim dia de l'acte).
   En tots dos casos, en carregar la pàgina:
   - deixa a dalt els actes que encara no han passat (el més proper primer),
   - mou els passats a «Actes anteriors» (desplegable tancat; el més recent primer),
   - si no en queda cap de proper, mostra l'avís #agenda-buit.
   Sense JavaScript, es veuen tots els actes de l'HTML en una sola llista. */
(function () {
  'use strict';
  var llista = document.getElementById('actes');
  if (!llista) return;
  var fets = document.getElementById('actes-fets');
  var anteriors = document.getElementById('actes-anteriors');
  var buit = document.getElementById('agenda-buit');

  var d = new Date();
  var avui = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);

  function ordena() {
    var actes = Array.prototype.slice.call(document.querySelectorAll('#actes > li[data-fins], #actes-fets > li[data-fins]'));
    actes.sort(function (a, b) { return a.getAttribute('data-fins') < b.getAttribute('data-fins') ? -1 : 1; });
    var propers = actes.filter(function (a) { return a.getAttribute('data-fins') >= avui; });
    var passats = actes.filter(function (a) { return a.getAttribute('data-fins') < avui; }).reverse();
    propers.forEach(function (a) { llista.appendChild(a); });
    if (fets) passats.forEach(function (a) { fets.appendChild(a); });
    if (anteriors) anteriors.hidden = passats.length === 0;
    if (buit) buit.hidden = propers.length > 0;
    llista.hidden = propers.length === 0;
  }
  ordena();

  // ---------- Actes de Supabase ----------
  var S = window.Segur, cfg = S && S.config();
  if (!cfg) return;
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function cartell(c) {
    if (!c) return null;
    if (/^\/img\/agenda\/[a-z0-9-]+\.webp$/.test(c)) return { gran: c, petit: c.replace(/\.webp$/, '-petit.webp') };
    var u = S.urlImatge(null, c);
    return u ? { gran: u, petit: u } : null;
  }
  function quan(a) {
    if (a.quan) return a.quan;
    var dt = new Date(a.data + 'T12:00:00');
    var t = isNaN(dt) ? a.data : dt.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    t = t.charAt(0).toUpperCase() + t.slice(1);
    return a.hora ? t + ' · ' + a.hora.slice(0, 5).replace(':', '.').replace(/^0/, '') + ' h' : t;
  }
  // «@nom» dins del text d'organització → enllaç a Instagram
  function organitza(text) {
    var p = el('p', 'org'), re = /@([A-Za-z0-9._]{1,30})/g, ultim = 0, m;
    p.appendChild(document.createTextNode('Organitza: '));
    while ((m = re.exec(text))) {
      p.appendChild(document.createTextNode(text.slice(ultim, m.index)));
      var a = el('a', null, m[0]); a.href = 'https://www.instagram.com/' + m[1] + '/'; a.target = '_blank'; a.rel = 'noopener noreferrer';
      p.appendChild(a); ultim = m.index + m[0].length;
    }
    p.appendChild(document.createTextNode(text.slice(ultim)));
    return p;
  }
  function acte(a) {
    var li = el('li', 'acte'); li.setAttribute('data-fins', a.data_fi || a.data);
    var c = cartell(a.cartell);
    if (c) {
      var en = el('a', 'acte-cartell'); en.href = c.gran; en.target = '_blank'; en.rel = 'noopener';
      en.setAttribute('aria-label', 'Cartell de «' + a.titol + '» en gran (s’obre en una pestanya nova)');
      var i = document.createElement('img'); i.src = c.petit; i.alt = ''; i.width = 360; i.height = 509; i.loading = 'lazy'; i.decoding = 'async';
      i.onerror = function () { en.remove(); li.classList.add('sense-cartell'); };
      en.appendChild(i); li.appendChild(en);
    } else li.classList.add('sense-cartell');
    var tx = el('div', 'acte-tx'), tm = el('time', null, quan(a));
    tm.setAttribute('datetime', a.data + (a.hora ? 'T' + a.hora.slice(0, 5) : ''));
    tx.appendChild(tm);
    tx.appendChild(el('h3', null, a.titol));
    if (a.lloc) tx.appendChild(el('p', 'lloc', a.lloc));
    if (a.descripcio) tx.appendChild(el('p', null, a.descripcio));
    if (a.organitza) tx.appendChild(organitza(a.organitza));
    li.appendChild(tx);
    return li;
  }
  fetch(cfg.url + '/rest/v1/actes?select=id,titol,data,hora,data_fi,quan,lloc,descripcio,organitza,cartell&publicada=eq.true&order=data.asc',
    { headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key } })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (l) {
      if (!Array.isArray(l)) throw 0;
      llista.textContent = ''; if (fets) fets.textContent = '';
      l.filter(function (a) { return a && a.titol && /^\d{4}-\d{2}-\d{2}$/.test(a.data || ''); }).forEach(function (a) { llista.appendChild(acte(a)); });
      ordena();
    })
    .catch(function () { /* sense la taula (o sense connexió) es queden els actes de l'HTML */ });
})();
